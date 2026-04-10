"""Behavior Analyst Agent — aggregates xAPI learning behavior data."""

from agents.base import BaseNode, SharedMemory
from db import get_db


class BehaviorAnalystNode(BaseNode):
    name = "behavior_analyst"
    description = "Analyzes learning behavior patterns from xAPI data"
    model = "sql-only"
    required_output_keys = ["engagement_metrics", "module_engagement", "verb_distribution"]

    def _run(self, sm: SharedMemory) -> dict:
        course_id = sm.get("course_id")
        prefix = f"course/{course_id}/%"

        conn = get_db()
        cur = conn.cursor()

        # Daily active users — no hard time cut-off so mock data generated
        # 14 days ago is fully captured.  Return up to the last 30 days.
        cur.execute("""
            SELECT DATE(timestamp) as day,
                   COUNT(DISTINCT actor_email) as active_users,
                   COUNT(*) as total_actions
            FROM xapi_statements
            WHERE object_id LIKE %s
            GROUP BY DATE(timestamp)
            ORDER BY day
            LIMIT 30
        """, (prefix,))
        daily = [{"date": r[0].isoformat(), "active_users": r[1], "actions": r[2]} for r in cur.fetchall()]

        # Peak activity hours
        cur.execute("""
            SELECT EXTRACT(HOUR FROM timestamp)::int as hour, COUNT(*) as count
            FROM xapi_statements
            WHERE object_id LIKE %s
            GROUP BY hour
            ORDER BY count DESC
            LIMIT 5
        """, (prefix,))
        peak_hours = [r[0] for r in cur.fetchall()]

        # Average actions per student
        cur.execute("""
            SELECT COUNT(*)::float / NULLIF(COUNT(DISTINCT actor_email), 0)
            FROM xapi_statements WHERE object_id LIKE %s
        """, (prefix,))
        avg_actions = round(cur.fetchone()[0] or 0, 1)

        # Module engagement — count struggles across ALL objects in each module (including sub-content)
        module_prefix = f"course/{course_id}/module/%"
        cur.execute("""
            SELECT
                m.object_id,
                m.object_name,
                COUNT(*) as total_interactions,
                COUNT(DISTINCT m.actor_email) as unique_students,
                COUNT(*) FILTER (WHERE m.verb IN ('completed', 'passed')) as completions,
                COALESCE(s.struggle_total, 0) as struggles
            FROM xapi_statements m
            LEFT JOIN (
                SELECT
                    SUBSTRING(object_id FROM '^(course/[0-9]+/module/[0-9]+)') as module_id,
                    COUNT(*) as struggle_total
                FROM xapi_statements
                WHERE object_id LIKE %s
                  AND verb = 'struggled'
                GROUP BY SUBSTRING(object_id FROM '^(course/[0-9]+/module/[0-9]+)')
            ) s ON s.module_id = m.object_id
            WHERE m.object_id LIKE %s AND m.object_id NOT LIKE %s
            GROUP BY m.object_id, m.object_name, s.struggle_total
            ORDER BY m.object_id
        """, (module_prefix, module_prefix, f"course/{course_id}/module/%/%"))
        modules = []
        for r in cur.fetchall():
            total_interactions = r[2] if r[2] > 0 else 1
            unique = r[3] if r[3] > 0 else 1
            completions = r[4]
            struggles = r[5]
            # Cap completion_rate at 1.0 — completions/unique can exceed 1 due to noise
            completion_rate = min(round(completions / unique, 2), 1.0)
            struggle_rate = round(struggles / max(total_interactions + struggles, 1), 2)
            modules.append({
                "module_id": r[0], "module_name": r[1],
                "interactions": total_interactions, "unique_students": r[3],
                "completions": completions, "struggles": struggles,
                "completion_rate": completion_rate,
                "struggle_rate": struggle_rate,
                "drop_off_rate": round(1 - completion_rate, 2),
            })

        # Verb distribution
        cur.execute("""
            SELECT verb, COUNT(*) FROM xapi_statements
            WHERE object_id LIKE %s GROUP BY verb ORDER BY COUNT(*) DESC
        """, (prefix,))
        verb_dist = {r[0]: r[1] for r in cur.fetchall()}

        # ── Time-on-Task Distribution per Module ──────────────────────────────
        # Estimate duration per student per module from first → last timestamp
        cur.execute("""
            SELECT
                SUBSTRING(object_id FROM '^(course/[0-9]+/module/[0-9]+)') as module_id,
                actor_email,
                EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) / 60.0 as duration_minutes
            FROM xapi_statements
            WHERE object_id LIKE %s
            GROUP BY module_id, actor_email
            HAVING COUNT(*) >= 2
        """, (module_prefix,))
        duration_rows = cur.fetchall()

        # Feedback sentiment per student per module — for cross-referencing
        cur.execute("""
            SELECT module_index, student_id, sentiment
            FROM student_feedback
            WHERE course_id = %s
        """, (course_id,))
        student_fb = {}  # {mod_idx: {student_id: sentiment}}
        for r in cur.fetchall():
            mi = r[0]
            if mi not in student_fb:
                student_fb[mi] = {}
            student_fb[mi][r[1]] = r[2]

        cur.close()
        conn.close()

        # ── Compute time-on-task statistics ───────────────────────────────────
        # Group durations by module
        mod_durations = {}  # module_id → [(email, duration), ...]
        for r in duration_rows:
            mod_id = r[0]
            if mod_id and r[2] is not None:
                if mod_id not in mod_durations:
                    mod_durations[mod_id] = []
                mod_durations[mod_id].append((r[1], float(r[2])))

        time_on_task = []
        for mod_id, student_durations in mod_durations.items():
            durations = [d for _, d in student_durations]
            if not durations:
                continue

            durations_sorted = sorted(durations)
            n = len(durations_sorted)
            mean_d = sum(durations_sorted) / n
            median_d = durations_sorted[n // 2] if n % 2 != 0 else (durations_sorted[n // 2 - 1] + durations_sorted[n // 2]) / 2
            p90_d = durations_sorted[int(n * 0.9)] if n >= 5 else durations_sorted[-1]

            # Extract module index from module_id
            parts = mod_id.split("/")
            mod_idx = int(parts[-1]) if parts[-1].isdigit() else 0
            fb_for_mod = student_fb.get(mod_idx, {})

            # Classify outliers
            outliers = []
            for email, dur in student_durations:
                if dur < 1:  # filter out < 1 min noise
                    continue
                ratio = dur / max(median_d, 1)
                if ratio > 2.0 or ratio < 0.5:
                    # Check student's feedback for this module
                    sentiment = fb_for_mod.get(email, "skip")

                    if ratio > 2.0:
                        if sentiment in ("off", "mostly"):
                            label = "struggling_engaged"
                        elif sentiment == "not-read":
                            label = "likely_idle"
                        elif sentiment == "skip":
                            label = "likely_idle"
                        elif sentiment == "got-it":
                            label = "slow_but_thorough"
                        else:
                            label = "unknown_outlier"
                    else:  # ratio < 0.5
                        if sentiment == "got-it":
                            label = "fast_learner"
                        elif sentiment in ("not-read", "skip"):
                            label = "skimmed"
                        else:
                            label = "fast_but_unsure"

                    outliers.append({
                        "student": email,
                        "duration_min": round(dur, 1),
                        "ratio_to_median": round(ratio, 2),
                        "sentiment": sentiment,
                        "label": label,
                    })

            # Summarize outlier labels
            label_counts = {}
            for o in outliers:
                label_counts[o["label"]] = label_counts.get(o["label"], 0) + 1

            time_on_task.append({
                "module_id": mod_id,
                "module_index": mod_idx,
                "mean_minutes": round(mean_d, 1),
                "median_minutes": round(median_d, 1),
                "p90_minutes": round(p90_d, 1),
                "student_count": n,
                "outlier_count": len(outliers),
                "outlier_labels": label_counts,
                "outliers": outliers[:20],  # cap for token efficiency
            })

        time_on_task.sort(key=lambda x: x["module_index"])

        return {
            "engagement_metrics": {
                "daily_activity": daily,
                "peak_activity_hours": peak_hours,
                "avg_actions_per_student": avg_actions,
            },
            "module_engagement": modules,
            "verb_distribution": verb_dist,
            "time_on_task": time_on_task,
        }

    def _fallback_sql(self, sm: SharedMemory) -> dict:
        # _run IS the SQL implementation, just re-run it
        return self._run(sm)
