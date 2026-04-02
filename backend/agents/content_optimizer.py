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

        # Feedback sentiment per module
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

        cur.close()
        conn.close()

        underperforming = []
        high_performing = []

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
            neg_feedback = fb.get("off", 0) + fb.get("not-read", 0)
            pos_feedback = fb.get("got-it", 0) + fb.get("mostly", 0)

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
                if any(i["type"] == "reading" and i["struggles"] > 2 for i in mod_issues):
                    suggestions.append("Consider adding video alternatives for difficult readings")
                if not suggestions:
                    suggestions.append("Monitor closely and gather more student feedback")

                underperforming.append({
                    "module_id": obj_id,
                    "module_name": obj_name,
                    "struggle_rate": round(struggle_rate, 2),
                    "completion_rate": round(completion_rate, 2),
                    "failure_rate": round(failure_rate, 2),
                    "negative_feedback": neg_feedback,
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
                })

        underperforming.sort(key=lambda x: x["struggle_rate"], reverse=True)

        return {
            "underperforming_content": underperforming,
            "high_performing_content": high_performing,
        }

    def _fallback_sql(self, sm: SharedMemory) -> dict:
        return self._run(sm)
