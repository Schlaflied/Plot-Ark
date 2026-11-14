"""Persistence + human review for feedback triage escalations.

Each proposed escalation becomes one change_log row (change_type='feedback_triage'),
so accepted/revised ones appear in LTM snapshots like other recommendations.
accept / revise -> 'applied'     reject -> 'dismissed'     undecided -> 'pending'
Only aggregate data is stored: no learner ids, no raw comment archive.
"""

import json

CHANGE_TYPE = "feedback_triage"
AGENT = "content_optimizer"
DECISIONS = ("accept", "reject", "revise")


class ReviewError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def recommendation_text(t: dict) -> str:
    return (f"Advisory ({t['level'].replace('_', ' ')}): learners raised \"{t['label']}\" — "
            f"{t['distinct_learners']} distinct learner(s). Rule: {t['rule_detail']}.")


def _row_to_item(row) -> dict:
    row_id, module_id, recommendation, status, detail = row
    d = json.loads(detail) if isinstance(detail, str) and detail else (detail or {})
    return {
        "id": row_id,
        "course_ref": module_id,
        "status": status,
        "decision": d.get("decision"),
        "label": d.get("label"),
        "level": d.get("level"),
        "distinct_learners": d.get("distinct_learners"),
        "triggered_rule": d.get("triggered_rule"),
        "rule_detail": d.get("rule_detail"),
        "examples": d.get("examples", []),
        "examples_withheld": d.get("examples_withheld", False),
        "revised_text": d.get("revised_text"),
        "recommendation": recommendation,
    }


def save_escalations(course_id: int, escalations: list) -> None:
    """Replace this course's pending triage items; reviewed rows are kept as history."""
    from db import get_db
    conn = get_db()
    if not conn:
        raise ReviewError("Database unavailable", 503)
    try:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM change_log WHERE course_id = %s AND status = 'pending' AND change_type = %s",
            (course_id, CHANGE_TYPE),
        )
        for t in escalations:
            cur.execute(
                """INSERT INTO change_log
                   (course_id, module_id, flag_reason, recommendation, agent, status, change_type, detail)
                   VALUES (%s, %s, %s, %s, %s, 'pending', %s, %s)""",
                (course_id, t["course_ref"], [t["triggered_rule"]], recommendation_text(t),
                 AGENT, CHANGE_TYPE, json.dumps(t)),
            )
        conn.commit()
        cur.close()
    finally:
        conn.close()


def list_escalations(course_id: int) -> list:
    from db import get_db
    conn = get_db()
    if not conn:
        raise ReviewError("Database unavailable", 503)
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT id, module_id, recommendation, status, detail FROM change_log
               WHERE course_id = %s AND change_type = %s ORDER BY id""",
            (course_id, CHANGE_TYPE),
        )
        rows = cur.fetchall()
        cur.close()
        return [_row_to_item(r) for r in rows]
    finally:
        conn.close()


def record_decision(item_id: int, decision: str, revised_text: str = "") -> dict:
    """Persist a reviewer's accept / reject / revise decision for one escalation."""
    if decision not in DECISIONS:
        raise ReviewError(f"decision must be one of {', '.join(DECISIONS)}")
    revised_text = (revised_text or "").strip()
    if decision == "revise" and not revised_text:
        raise ReviewError("revised_text is required when revising")

    from db import get_db
    conn = get_db()
    if not conn:
        raise ReviewError("Database unavailable", 503)
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT id, module_id, recommendation, status, detail FROM change_log
               WHERE id = %s AND change_type = %s""",
            (item_id, CHANGE_TYPE),
        )
        row = cur.fetchone()
        if not row:
            raise ReviewError("Escalation not found", 404)
        if row[3] != "pending":
            raise ReviewError("Escalation has already been reviewed", 409)

        d = json.loads(row[4]) if isinstance(row[4], str) and row[4] else {}
        recommendation = row[2]
        if decision == "reject":
            status = "dismissed"
        else:
            status = "applied"
            if decision == "revise":
                d["revised_text"] = revised_text
                recommendation = revised_text
        d["decision"] = decision

        cur.execute(
            "UPDATE change_log SET status = %s, recommendation = %s, detail = %s "
            "WHERE id = %s AND status = 'pending'",
            (status, recommendation, json.dumps(d), item_id),
        )
        if cur.rowcount == 0:
            conn.rollback()
            cur.close()
            raise ReviewError("Escalation has already been reviewed", 409)
        conn.commit()
        cur.close()
        return _row_to_item((item_id, row[1], recommendation, status, json.dumps(d)))
    finally:
        conn.close()
