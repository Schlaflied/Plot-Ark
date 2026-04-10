"""Content Optimizer Agent — identifies underperforming content and suggests improvements."""

from agents.base import BaseNode, SharedMemory
from db import get_db


class ContentOptimizerNode(BaseNode):
    name = "content_optimizer"
    description = "Analyzes which content is effective and which needs improvement"
    model = "sql-only"
    required_output_keys = ["underperforming_content", "high_performing_content"]

    def _run(self, sm: SharedMemory) -> dict:
        course_id = sm.get("course_id")

        conn = get_db()
        cur = conn.cursor()

        # Module-level performance
        cur.execute("""
            SELECT object_id, object_name,
                COUNT(DISTINCT actor_email) as unique_students,
                COUNT(*) FILTER (WHERE verb IN ('completed', 'passed')) as completions,
                COUNT(*) FILTER (WHERE verb = 'struggled') as struggles,
                COUNT(*) FILTER (WHERE verb = 'failed') as failures,
                COUNT(*) FILTER (WHERE verb = 'experienced') as views
            FROM xapi_statements
            WHERE object_id LIKE %s
              AND object_id NOT LIKE %s
            GROUP BY object_id, object_name
            ORDER BY object_id
        """, (f"course/{course_id}/module/%", f"course/{course_id}/module/%/%"))
        modules = cur.fetchall()

        # Sub-content performance (readings, assessments, concepts)
        cur.execute("""
            SELECT object_id, object_name,
                COUNT(*) as interactions,
                COUNT(*) FILTER (WHERE verb = 'struggled') as struggles,
                COUNT(*) FILTER (WHERE verb IN ('completed', 'passed')) as completions,
                COUNT(*) FILTER (WHERE verb = 'failed') as failures
            FROM xapi_statements
            WHERE object_id LIKE %s
              AND object_id LIKE '%%/%%/%%/%%'
            GROUP BY object_id, object_name
            ORDER BY struggles DESC
        """, (f"course/{course_id}/%",))
        sub_content = cur.fetchall()

        # ── Feedback four-color distribution per module ────────────────────────
        cur.execute("""
            SELECT module_index, sentiment, COUNT(*) as cnt
            FROM student_feedback
            WHERE course_id = %s
            GROUP BY module_index, sentiment
        """, (course_id,))
        fb_map = {}
        for r in cur.fetchall():
            mi = r[0]
            if mi not in fb_map:
                fb_map[mi] = {}
            fb_map[mi][r[1]] = r[2]

        # ── Total students who submitted xAPI data (for skip rate) ─────────────
        cur.execute("""
            SELECT COUNT(DISTINCT actor_email)
            FROM xapi_statements
            WHERE object_id LIKE %s
        """, (f"course/{course_id}/%",))
        total_xapi_students = cur.fetchone()[0] or 0

        # ── Text feedback comments (for future LLM analysis) ──────────────────
        cur.execute("""
            SELECT module_index, module_title, comment
            FROM student_feedback
            WHERE course_id = %s AND comment IS NOT NULL AND comment != ''
            ORDER BY module_index
        """, (course_id,))
        text_comments = []
        for r in cur.fetchall():
            text_comments.append({
                "module_index": r[0],
                "module_title": r[1] or f"Module {r[0] + 1}",
                "comment": r[2],
            })

        cur.close()
        conn.close()

        underperforming = []
        high_performing = []
        feedback_signals = []  # ← NEW: per-module feedback breakdown

        for r in modules:
            obj_id, obj_name = r[0], r[1]
            unique, completions, struggles, failures, views = r[2], r[3], r[4], r[5], r[6]

            total_actions = completions + struggles + failures + views
            struggle_rate = struggles / max(total_actions, 1)
            completion_rate = min(completions / max(unique, 1), 1.0)  # cap at 100%
            failure_rate = failures / max(total_actions, 1)

            # Extract module index from object_id
            parts = obj_id.split("/")
            mod_idx = int(parts[-1]) if parts[-1].isdigit() else 0
            fb = fb_map.get(mod_idx, {})

            # ── Four-color distribution ────────────────────────────────────────
            got_it = fb.get("got-it", 0)
            mostly = fb.get("mostly", 0)
            confused = fb.get("off", 0)
            unread = fb.get("not-read", 0)
            total_feedback = got_it + mostly + confused + unread
            skip_count = max(total_xapi_students - total_feedback, 0)

            neg_feedback = confused + unread
            pos_feedback = got_it + mostly

            # ── Cross-validation flags ─────────────────────────────────────────
            cross_flags = []
            # 虚假完成: high completion + high ⚫ (didn't read)
            if completion_rate > 0.6 and unread > max(total_feedback * 0.3, 2):
                cross_flags.append("⚠️ False Completion — high completion but many students report not reading")
            # 模块设计问题: high completion + high 🔴 (confused)
            if completion_rate > 0.5 and confused > max(total_feedback * 0.3, 2):
                cross_flags.append("🔥 Design Issue — students complete but remain confused")
            # 完全脱离: low completion + high ⚫
            if completion_rate < 0.4 and unread > max(total_feedback * 0.3, 2):
                cross_flags.append("⚫ Complete Disengagement — low completion AND students not reading")
            # 高 skip 率
            if total_xapi_students > 0 and skip_count > total_xapi_students * 0.5:
                cross_flags.append(f"⏭️ High Skip Rate — {skip_count}/{total_xapi_students} students skipped feedback")
            # 内容好但有障碍: high 🟢 + low completion
            if got_it > max(total_feedback * 0.4, 2) and completion_rate < 0.4:
                cross_flags.append("🤔 Friction — positive feedback but low completion, check UX/tech barriers")

            # Build per-module feedback signal
            fb_signal = {
                "module_id": obj_id,
                "module_name": obj_name,
                "module_index": mod_idx,
                "got_it": got_it,
                "mostly": mostly,
                "confused": confused,
                "unread": unread,
                "total_feedback": total_feedback,
                "skip_count": skip_count,
                "cross_flags": cross_flags,
            }
            feedback_signals.append(fb_signal)

            # Find struggling sub-content for this module
            mod_issues = []
            for sc in sub_content:
                if sc[0].startswith(obj_id + "/"):
                    if sc[3] > 0:  # has struggles
                        mod_issues.append({
                            "content": sc[1],
                            "type": "reading" if "/reading/" in sc[0] else ("assessment" if "/assessment/" in sc[0] else "concept"),
                            "struggles": sc[3],
                            "completions": sc[4],
                        })

            if struggle_rate > 0.2 or failure_rate > 0.15 or neg_feedback > 2:
                suggestions = []
                if struggle_rate > 0.3:
                    suggestions.append("Consider breaking this module into smaller sub-modules")
                if failure_rate > 0.2:
                    suggestions.append("Review assessment difficulty; consider adding practice problems")
                if neg_feedback > 2:
                    suggestions.append("Review student feedback comments for specific pain points")
                if confused > mostly and confused > 1:
                    suggestions.append("Students report unknown-unknowns — add scaffolding or worked examples")
                if unread > got_it and unread > 1:
                    suggestions.append("Low reading engagement — consider restructuring or adding relevance context")
                if any(i["type"] == "reading" and i["struggles"] > 2 for i in mod_issues):
                    suggestions.append("Consider adding video alternatives for difficult readings")
                if cross_flags:
                    suggestions.extend([f"[Cross-signal] {f}" for f in cross_flags])
                if not suggestions:
                    suggestions.append("Monitor closely and gather more student feedback")

                underperforming.append({
                    "module_id": obj_id,
                    "module_name": obj_name,
                    "struggle_rate": round(struggle_rate, 2),
                    "completion_rate": round(completion_rate, 2),
                    "failure_rate": round(failure_rate, 2),
                    "negative_feedback": neg_feedback,
                    "feedback_distribution": {
                        "got_it": got_it, "mostly": mostly,
                        "confused": confused, "unread": unread,
                        "skip": skip_count,
                    },
                    "issues": mod_issues[:5],
                    "suggestions": suggestions,
                })
            elif completion_rate > 0.6 and struggle_rate < 0.1:
                avg_sentiment = "got-it" if pos_feedback > neg_feedback else "mixed"
                high_performing.append({
                    "module_id": obj_id,
                    "module_name": obj_name,
                    "completion_rate": round(completion_rate, 2),
                    "avg_sentiment": avg_sentiment,
                    "positive_feedback": pos_feedback,
                    "feedback_distribution": {
                        "got_it": got_it, "mostly": mostly,
                        "confused": confused, "unread": unread,
                        "skip": skip_count,
                    },
                })

        underperforming.sort(key=lambda x: x["struggle_rate"], reverse=True)

        return {
            "underperforming_content": underperforming,
            "high_performing_content": high_performing,
            "feedback_signals": feedback_signals,
            "text_comments": text_comments[:50],  # cap at 50 for token efficiency
        }

    def _fallback_sql(self, sm: SharedMemory) -> dict:
        return self._run(sm)
