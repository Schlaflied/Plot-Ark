"""Persistence + human review for accessibility findings (advisory).

Same pattern as assessment_review: one change_log row per finding
(change_type='accessibility_check'); accept / revise -> 'applied', reject -> 'dismissed'.
"""

import json

CHANGE_TYPE = "accessibility_check"
AGENT = "content_optimizer"
DECISIONS = ("accept", "reject", "revise")


class ReviewError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _to_dict(row_id, module_id, recommendation, status, detail):
    d = json.loads(detail) if isinstance(detail, str) and detail else (detail or {})
    return {"id": row_id, "module_id": module_id, "status": status,
            "decision": d.get("decision"), "recommendation": recommendation,
            "revised_text": d.get("revised_text"), "filename": d.get("filename"),
            "finding": d.get("finding")}


def save_findings(course_id: int, filename: str, findings: list, module_id=None) -> None:
    """Replace this file's pending findings with a fresh set; reviewed rows are kept."""
    from db import get_db
    conn = get_db()
    if not conn:
        raise ReviewError("Database unavailable", 503)
    try:
        cur = conn.cursor()
        cur.execute(
            """DELETE FROM change_log WHERE course_id = %s AND status = 'pending'
               AND change_type = %s AND detail::jsonb ->> 'filename' = %s""",
            (course_id, CHANGE_TYPE, filename))
        for f in findings:
            cur.execute(
                """INSERT INTO change_log
                   (course_id, module_id, flag_reason, recommendation, agent, status, change_type, detail)
                   VALUES (%s, %s, %s, %s, %s, 'pending', %s, %s)""",
                (course_id, module_id, [f"WCAG {f['wcag_criterion']}: {f['message']}"],
                 f["suggested_fix"], AGENT, CHANGE_TYPE,
                 json.dumps({"filename": filename, "finding": f})))
        conn.commit()
        cur.close()
    finally:
        conn.close()


def list_findings(course_id: int) -> list:
    from db import get_db
    conn = get_db()
    if not conn:
        raise ReviewError("Database unavailable", 503)
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT id, module_id, recommendation, status, detail FROM change_log
               WHERE course_id = %s AND change_type = %s ORDER BY id""",
            (course_id, CHANGE_TYPE))
        rows = cur.fetchall()
        cur.close()
        return [_to_dict(*r) for r in rows]
    finally:
        conn.close()


def record_decision(finding_id: int, decision: str, revised_text: str = "") -> dict:
    if decision not in DECISIONS:
        raise ReviewError(f"decision must be one of {', '.join(DECISIONS)}")
    revised_text = (revised_text or "").strip()
    if decision == "revise" and not revised_text:
        raise ReviewError("revised_text is required when revising a finding")
    from db import get_db
    conn = get_db()
    if not conn:
        raise ReviewError("Database unavailable", 503)
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT id, module_id, recommendation, status, detail FROM change_log
               WHERE id = %s AND change_type = %s""", (finding_id, CHANGE_TYPE))
        row = cur.fetchone()
        if not row:
            raise ReviewError("Finding not found", 404)
        if row[3] != "pending":
            raise ReviewError("Finding has already been reviewed", 409)
        d = json.loads(row[4]) if isinstance(row[4], str) and row[4] else {}
        recommendation = row[2]
        status = "dismissed" if decision == "reject" else "applied"
        if decision == "revise":
            d["revised_text"] = revised_text
            recommendation = revised_text
        d["decision"] = decision
        cur.execute("UPDATE change_log SET status = %s, recommendation = %s, detail = %s WHERE id = %s",
                    (status, recommendation, json.dumps(d), finding_id))
        conn.commit()
        cur.close()
        return _to_dict(finding_id, row[1], recommendation, status, json.dumps(d))
    finally:
        conn.close()
