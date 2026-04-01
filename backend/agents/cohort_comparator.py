"""Cohort Comparator Agent — compares student groups by performance profile."""

from agents.base import BaseNode, SharedMemory
from db import get_db


class CohortComparatorNode(BaseNode):
    name = "cohort_comparator"
    description = "Compares student cohorts by performance patterns"
    model = "sql-only"
    required_output_keys = ["groups", "insights"]

    def _run(self, sm: SharedMemory) -> dict:
        course_id = sm.get("course_id")
        prefix = f"course/{course_id}/%"

        conn = get_db()
        cur = conn.cursor()

        # Per-student aggregated stats
        cur.execute("""
            SELECT actor_name, actor_email,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE verb IN ('completed', 'passed')) as mastered,
                COUNT(*) FILTER (WHERE verb = 'struggled') as struggled,
                COUNT(*) FILTER (WHERE verb = 'failed') as failed,
                COUNT(*) FILTER (WHERE verb = 'experienced') as viewed,
                COUNT(DISTINCT object_id) FILTER (
                    WHERE object_id LIKE %s AND object_id NOT LIKE %s
                ) as modules_touched
            FROM xapi_statements
            WHERE object_id LIKE %s
            GROUP BY actor_name, actor_email
        """, (f"course/{course_id}/module/%", f"course/{course_id}/module/%/%", prefix))
        students = cur.fetchall()

        # Total modules
        cur.execute("""
            SELECT COUNT(DISTINCT object_id)
            FROM xapi_statements
            WHERE object_id LIKE %s AND object_id NOT LIKE %s
        """, (f"course/{course_id}/module/%", f"course/{course_id}/module/%/%"))
        total_modules = cur.fetchone()[0] or 1

        cur.close()
        conn.close()

        # Classify students into cohorts
        high_performers = []
        average_students = []
        at_risk = []
        disengaged = []

        for s in students:
            name, email, total, mastered, struggled, failed, viewed, mods = s
            comp_rate = mastered / max(total, 1)
            struggle_rate = struggled / max(total, 1)

            profile = {
                "name": name, "email": email,
                "total": total, "mastered": mastered,
                "struggled": struggled, "failed": failed,
                "completion_rate": round(comp_rate, 2),
                "struggle_rate": round(struggle_rate, 2),
                "modules_touched": mods,
            }

            if comp_rate > 0.5 and struggle_rate < 0.1:
                high_performers.append(profile)
            elif comp_rate < 0.15 or total < 3:
                disengaged.append(profile)
            elif struggle_rate > 0.25 or failed > 2:
                at_risk.append(profile)
            else:
                average_students.append(profile)

        def _group_stats(group):
            if not group:
                return {"count": 0, "avg_completion": 0, "avg_struggle": 0, "avg_actions": 0, "avg_modules": 0}
            return {
                "count": len(group),
                "avg_completion": round(sum(s["completion_rate"] for s in group) / len(group), 2),
                "avg_struggle": round(sum(s["struggle_rate"] for s in group) / len(group), 2),
                "avg_actions": round(sum(s["total"] for s in group) / len(group), 1),
                "avg_modules": round(sum(s["modules_touched"] for s in group) / len(group), 1),
            }

        groups = {
            "high_performers": {**_group_stats(high_performers), "students": [s["name"] for s in high_performers]},
            "average": {**_group_stats(average_students), "students": [s["name"] for s in average_students]},
            "at_risk": {**_group_stats(at_risk), "students": [s["name"] for s in at_risk]},
            "disengaged": {**_group_stats(disengaged), "students": [s["name"] for s in disengaged]},
        }

        # Generate insights
        insights = []
        hp = groups["high_performers"]
        ar = groups["at_risk"]
        de = groups["disengaged"]

        if hp["count"] > 0 and ar["count"] > 0:
            if hp["avg_actions"] > 0:
                ratio = round(hp["avg_actions"] / max(ar["avg_actions"], 1), 1)
                insights.append(f"High performers have {ratio}x more interactions than at-risk students")
            if hp["avg_modules"] > ar["avg_modules"]:
                insights.append(f"High performers engage with {hp['avg_modules']} modules vs {ar['avg_modules']} for at-risk")

        if de["count"] > 0:
            pct = round(de["count"] / max(len(students), 1) * 100)
            insights.append(f"{pct}% of students ({de['count']}) show disengaged behavior")

        if ar["count"] > 0:
            insights.append(f"{ar['count']} students are at risk with avg struggle rate of {ar['avg_struggle']:.0%}")

        if hp["count"] > 0 and hp["avg_completion"] > 0.7:
            insights.append(f"Top performers maintain {hp['avg_completion']:.0%} completion rate — content works well for motivated students")

        if not insights:
            insights.append("Insufficient data for meaningful cohort comparisons")

        return {
            "groups": groups,
            "insights": insights,
            "total_students": len(students),
            "total_modules": total_modules,
        }

    def _fallback_sql(self, sm: SharedMemory) -> dict:
        return self._run(sm)
