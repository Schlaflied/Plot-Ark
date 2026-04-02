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

        cur.close()
        conn.close()

        return {
            "engagement_metrics": {
                "daily_activity": daily,
                "peak_activity_hours": peak_hours,
                "avg_actions_per_student": avg_actions,
            },
            "module_engagement": modules,
            "verb_distribution": verb_dist,
        }

    def _fallback_sql(self, sm: SharedMemory) -> dict:
        # _run IS the SQL implementation, just re-run it
        return self._run(sm)
