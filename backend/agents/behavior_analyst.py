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

        # Daily active users (last 14 days)
        cur.execute("""
            SELECT DATE(timestamp) as day,
                   COUNT(DISTINCT actor_email) as active_users,
                   COUNT(*) as total_actions
            FROM xapi_statements
            WHERE object_id LIKE %s
              AND timestamp > NOW() - INTERVAL '14 days'
            GROUP BY DATE(timestamp)
            ORDER BY day
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

        # Module engagement
        module_prefix = f"course/{course_id}/module/%"
        cur.execute("""
            SELECT object_id, object_name,
                COUNT(*) as total_interactions,
                COUNT(DISTINCT actor_email) as unique_students,
                COUNT(*) FILTER (WHERE verb IN ('completed', 'passed')) as completions,
                COUNT(*) FILTER (WHERE verb = 'struggled') as struggles
            FROM xapi_statements
            WHERE object_id LIKE %s AND object_id NOT LIKE %s
            GROUP BY object_id, object_name
            ORDER BY object_id
        """, (module_prefix, f"course/{course_id}/module/%/%"))
        modules = []
        for r in cur.fetchall():
            total = r[3] if r[3] > 0 else 1
            modules.append({
                "module_id": r[0], "module_name": r[1],
                "interactions": r[2], "unique_students": r[3],
                "completions": r[4], "struggles": r[5],
                "completion_rate": round(r[4] / total, 2),
                "drop_off_rate": round(1 - (r[4] / total), 2),
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
