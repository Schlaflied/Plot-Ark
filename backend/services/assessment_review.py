"""Persistence + human review for assessment design suggestions.

Each flagged item becomes one change_log row (change_type='assessment_design'),
so decisions flow into the same LTM snapshots as other recommendations.
Review status maps onto the existing change_log statuses:
    accept / revise -> 'applied'     reject -> 'dismissed'     undecided -> 'pending'
"""

import json

CHANGE_TYPE = "assessment_design"
AGENT = "content_optimizer"
DECISIONS = ("accept", "reject", "revise")


class ReviewError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def load_course_modules(course_id) -> list:
    """Read curricula.modules; returns [] if the course or DB is unavailable."""
    from db import get_db
    try:
        conn = get_db()
        if not conn:
            return []
        cur = conn.cursor()
        cur.execute("SELECT modules FROM curricula WHERE id = %s", (course_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"[assessment_review] could not load modules: {e}")
        return []
    raw = row[0] if row else None
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return []
    return raw if isinstance(raw, list) else []


def _row_to_suggestion(row) -> dict:
    row_id, module_id, recommendation, status, detail = row
    d = json.loads(detail) if isinstance(detail, str) and detail else (detail or {})
    return {
        "id": row_id,
        "module_id": module_id,
        "status": status,
        "decision": d.get("decision"),
        "item_title": d.get("item_title"),
        "item_index": d.get("item_index"),
        "classification": d.get("classification"),
        "reason": d.get("reason"),
        "objective": d.get("objective"),
        "alternatives": d.get("alternatives", []),
        "chosen_alternative": d.get("chosen_alternative"),
        "revised_text": d.get("revised_text"),
        "recommendation": recommendation,
    }


def save_suggestions(course_id: int, suggestions: list) -> None:
    """Replace this course's pending assessment suggestions with a fresh set.

    Reviewed (applied/dismissed) rows are kept as decision history.
    """
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
        for s in suggestions:
            first = s["alternatives"][0]["suggestion"] if s["alternatives"] else ""
            cur.execute(
                """INSERT INTO change_log
                   (course_id, module_id, flag_reason, recommendation, agent, status, change_type, detail)
                   VALUES (%s, %s, %s, %s, %s, 'pending', %s, %s)""",
                (course_id, s["module_id"], [s["reason"]], first, AGENT, CHANGE_TYPE, json.dumps(s)),
            )
        conn.commit()
        cur.close()
    finally:
        conn.close()


def list_suggestions(course_id: int) -> list:
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
        return [_row_to_suggestion(r) for r in rows]
    finally:
        conn.close()


def record_decision(suggestion_id: int, decision: str, alternative_index: int = 0,
                    revised_text: str = "") -> dict:
    """Persist an instructor's accept / reject / revise decision for one suggestion."""
    if decision not in DECISIONS:
        raise ReviewError(f"decision must be one of {', '.join(DECISIONS)}")
    revised_text = (revised_text or "").strip()
    if decision == "revise" and not revised_text:
        raise ReviewError("revised_text is required when revising a suggestion")

    from db import get_db
    conn = get_db()
    if not conn:
        raise ReviewError("Database unavailable", 503)
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT id, module_id, recommendation, status, detail FROM change_log
               WHERE id = %s AND change_type = %s""",
            (suggestion_id, CHANGE_TYPE),
        )
        row = cur.fetchone()
        if not row:
            raise ReviewError("Suggestion not found", 404)
        if row[3] != "pending":
            raise ReviewError("Suggestion has already been reviewed", 409)

        d = json.loads(row[4]) if isinstance(row[4], str) and row[4] else {}
        alts = d.get("alternatives", [])
        recommendation = row[2]
        if decision == "reject":
            status = "dismissed"
        else:
            status = "applied"
            if decision == "accept":
                if not isinstance(alternative_index, int) or not 0 <= alternative_index < max(len(alts), 1):
                    raise ReviewError("alternative_index out of range")
                if alts:
                    d["chosen_alternative"] = alts[alternative_index]
                    recommendation = alts[alternative_index]["suggestion"]
            else:
                d["revised_text"] = revised_text
                recommendation = revised_text
        d["decision"] = decision

        cur.execute(
            "UPDATE change_log SET status = %s, recommendation = %s, detail = %s WHERE id = %s",
            (status, recommendation, json.dumps(d), suggestion_id),
        )
        conn.commit()
        cur.close()
        return _row_to_suggestion((suggestion_id, row[1], recommendation, status, json.dumps(d)))
    finally:
        conn.close()
