"""At-Risk Detector Agent — identifies students who may be falling behind."""

from agents.base import BaseNode, SharedMemory
from db import get_db


class RiskDetectorNode(BaseNode):
    name = "risk_detector"
    description = "Identifies at-risk students based on xAPI + feedback signals"
    model = "sql-only"
    required_output_keys = ["at_risk_students", "risk_distribution"]

    def _run(self, sm: SharedMemory) -> dict:
        course_id = sm.get("course_id")
        prefix = f"course/{course_id}/%"

        conn = get_db()
        cur = conn.cursor()

        # Get per-student stats
        cur.execute("""
            SELECT actor_name, actor_email,
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE verb IN ('completed', 'passed')) as mastered,
                COUNT(*) FILTER (WHERE verb = 'struggled') as struggled,
                COUNT(*) FILTER (WHERE verb = 'failed') as failed,
                COUNT(*) FILTER (WHERE verb = 'experienced') as viewed,
                MAX(timestamp) as last_seen,
                MIN(timestamp) as first_seen
            FROM xapi_statements
            WHERE object_id LIKE %s
            GROUP BY actor_name, actor_email
        """, (prefix,))
        students_raw = cur.fetchall()

        # Get feedback sentiment counts per student
        cur.execute("""
            SELECT student_id, sentiment, COUNT(*) as cnt
            FROM student_feedback
            WHERE course_id = %s
            GROUP BY student_id, sentiment
        """, (course_id,))
        feedback_map = {}
        for r in cur.fetchall():
            sid = r[0]
            if sid not in feedback_map:
                feedback_map[sid] = {}
            feedback_map[sid][r[1]] = r[2]

        # Total modules in this course
        cur.execute("""
            SELECT COUNT(DISTINCT object_id)
            FROM xapi_statements
            WHERE object_id LIKE %s AND object_id NOT LIKE %s
        """, (f"course/{course_id}/module/%", f"course/{course_id}/module/%/%"))
        total_modules = cur.fetchone()[0] or 1

        cur.close()
        conn.close()

        from datetime import datetime, timedelta
        now = datetime.now()
        at_risk = []
        risk_counts = {"low": 0, "medium": 0, "high": 0}

        for r in students_raw:
            name, email = r[0], r[1]
            total, mastered, struggled, failed, viewed = r[2], r[3], r[4], r[5], r[6]
            last_seen = r[7]
            first_seen = r[8]

            signals = []
            risk_score = 0

            # Signal 1: High struggle rate
            struggle_rate = struggled / max(total, 1)
            if struggle_rate > 0.3:
                signals.append(f"High struggle rate: {struggle_rate:.0%}")
                risk_score += 3
            elif struggle_rate > 0.15:
                signals.append(f"Moderate struggle rate: {struggle_rate:.0%}")
                risk_score += 1

            # Signal 2: Low completion rate
            completion_rate = mastered / max(total, 1)
            if completion_rate < 0.15:
                signals.append(f"Very low completion rate: {completion_rate:.0%}")
                risk_score += 3
            elif completion_rate < 0.30:
                signals.append(f"Low completion rate: {completion_rate:.0%}")
                risk_score += 1

            # Signal 3: Inactivity
            if last_seen:
                days_inactive = (now - last_seen.replace(tzinfo=None)).days
                if days_inactive > 7:
                    signals.append(f"No activity in {days_inactive} days")
                    risk_score += 3
                elif days_inactive > 3:
                    signals.append(f"Inactive for {days_inactive} days")
                    risk_score += 1

            # Signal 4: Failures
            if failed > 2:
                signals.append(f"Failed {failed} assessments")
                risk_score += 2

            # Signal 5: Negative feedback
            fb = feedback_map.get(email, {})
            neg = fb.get("off", 0) + fb.get("not-read", 0)
            if neg > 2:
                signals.append(f"{neg} negative feedback submissions")
                risk_score += 2

            # Signal 6: Low interaction volume
            if total < 3:
                signals.append(f"Only {total} total interactions")
                risk_score += 2

            # Classify risk level
            if risk_score >= 5:
                level = "high"
            elif risk_score >= 2:
                level = "medium"
            else:
                level = "low"

            risk_counts[level] += 1

            # Only report medium and high risk
            if level in ("medium", "high"):
                # Generate recommendation
                recs = []
                if struggled > failed and struggled > 2:
                    recs.append("Schedule 1-on-1 check-in to identify specific difficulties")
                if failed > 1:
                    recs.append("Provide supplementary materials before next assessment")
                if days_inactive > 3 if last_seen else True:
                    recs.append("Send engagement reminder or check for personal circumstances")
                if neg > 1:
                    recs.append("Review module content flagged in negative feedback")
                if not recs:
                    recs.append("Monitor closely in coming sessions")

                at_risk.append({
                    "name": name,
                    "email": email,
                    "risk_level": level,
                    "risk_score": risk_score,
                    "signals": signals,
                    "recommended_actions": recs,
                    "stats": {
                        "total_actions": total,
                        "mastered": mastered,
                        "struggled": struggled,
                        "failed": failed,
                        "completion_rate": round(completion_rate, 2),
                        "last_seen": last_seen.isoformat() if last_seen else None,
                    },
                })

        # Sort by risk score descending
        at_risk.sort(key=lambda x: x["risk_score"], reverse=True)

        return {
            "at_risk_students": at_risk,
            "risk_distribution": risk_counts,
            "total_students_analyzed": len(students_raw),
        }

    def _fallback_sql(self, sm: SharedMemory) -> dict:
        return self._run(sm)
