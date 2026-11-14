"""Manager Follow-up Pulse API (Enterprise L&D).

Admin endpoints require ``X-User-Role: enterprise_admin``; manager endpoints are
scoped to the ``X-User-Email`` header. As elsewhere in Plot Ark today, these
headers are client-asserted (there is no server-side session yet), so this is
a privacy-by-design boundary, not a security boundary.

Nothing here returns per-manager answers to admins, and comments are only ever
returned to the manager who wrote them.
"""

from __future__ import annotations

import datetime
import json

from flask import Blueprint, jsonify, request

from db import get_db
from services.enterprise_followup import (
    DEFAULT_INTERVALS,
    DEFAULT_MIN_GROUP_SIZE,
    STATUSES,
    STATUS_LABELS,
    aggregate_followup,
    evidence_card,
    is_due,
    validate_intervals,
    validate_min_group_size,
    validate_response,
)


enterprise_followup_bp = Blueprint("enterprise_followup", __name__)


def _is_admin() -> bool:
    return request.headers.get("X-User-Role", "") == "enterprise_admin"


def _email() -> str:
    return request.headers.get("X-User-Email", "").strip().lower()


def _load_config(cur, program_id: int):
    """Return (name, config) or None when the program does not exist."""
    cur.execute("SELECT name FROM enterprise_programs WHERE id = %s", (program_id,))
    program = cur.fetchone()
    if not program:
        return None
    cur.execute("""
        SELECT intervals_days, program_version, anchor_date, min_group_size
        FROM enterprise_followup_config WHERE program_id = %s
    """, (program_id,))
    row = cur.fetchone()
    config = {
        "intervals_days": list(row[0]) if row else list(DEFAULT_INTERVALS),
        "program_version": row[1] if row else "v1",
        "anchor_date": row[2] if row else datetime.date.today(),
        "min_group_size": row[3] if row else DEFAULT_MIN_GROUP_SIZE,
    }
    return program[0], config


def _public_config(config: dict) -> dict:
    return {**config, "anchor_date": config["anchor_date"].isoformat()}


def _cohort_aggregate(cur, program_id: int, cohort_id: int, interval: int, min_group_size: int) -> dict:
    cur.execute("""
        SELECT COUNT(*) FROM enterprise_followup_managers
        WHERE program_id = %s AND cohort_id = %s
    """, (program_id, cohort_id))
    invited = cur.fetchone()[0]
    cur.execute("""
        SELECT r.status FROM enterprise_followup_responses r
        JOIN enterprise_followup_managers m ON m.id = r.manager_id
        WHERE m.program_id = %s AND m.cohort_id = %s AND r.interval_days = %s
    """, (program_id, cohort_id, interval))
    return aggregate_followup(invited, [row[0] for row in cur.fetchall()], min_group_size)


def _save_snapshot(cur, program_id: int, cohort_id: int, version: str, interval: int, aggregate: dict) -> None:
    cur.execute("""
        INSERT INTO enterprise_followup_snapshots
            (program_id, cohort_id, program_version, interval_days, aggregate)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (program_id, cohort_id, program_version, interval_days)
        DO UPDATE SET aggregate = EXCLUDED.aggregate, updated_at = NOW()
    """, (program_id, cohort_id, version, interval, json.dumps(aggregate)))


@enterprise_followup_bp.route("/api/enterprise/programs/<int:program_id>/followup/config", methods=["GET", "PUT"])
def followup_config(program_id: int):
    if not _is_admin():
        return jsonify({"error": "Enterprise admin only"}), 403
    data = request.get_json(silent=True) or {}
    if request.method == "PUT":
        try:
            intervals = validate_intervals(data.get("intervals_days"))
            min_size = validate_min_group_size(data.get("min_group_size"))
            version = str(data.get("program_version", "v1")).strip() or "v1"
            anchor = (
                datetime.date.fromisoformat(data["anchor_date"])
                if data.get("anchor_date") else datetime.date.today()
            )
        except (ValueError, TypeError) as exc:
            return jsonify({"error": str(exc)}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        loaded = _load_config(cur, program_id)
        if not loaded:
            return jsonify({"error": "Program not found"}), 404
        if request.method == "PUT":
            cur.execute("""
                INSERT INTO enterprise_followup_config
                    (program_id, intervals_days, program_version, anchor_date, min_group_size)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (program_id) DO UPDATE SET
                    intervals_days = EXCLUDED.intervals_days,
                    program_version = EXCLUDED.program_version,
                    anchor_date = EXCLUDED.anchor_date,
                    min_group_size = EXCLUDED.min_group_size,
                    updated_at = NOW()
            """, (program_id, json.dumps(intervals), version, anchor, min_size))
            conn.commit()
            loaded = _load_config(cur, program_id)
        return jsonify(_public_config(loaded[1]))
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()


@enterprise_followup_bp.route("/api/enterprise/programs/<int:program_id>/followup/managers", methods=["POST"])
def register_managers(program_id: int):
    """Admin registers the managers who will be asked, for one cohort."""
    if not _is_admin():
        return jsonify({"error": "Enterprise admin only"}), 403
    data = request.get_json(silent=True) or {}
    emails = sorted({str(e).strip().lower() for e in data.get("manager_emails", []) if str(e).strip()})
    if not emails or any("@" not in e for e in emails):
        return jsonify({"error": "manager_emails must be a non-empty list of email addresses"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT COALESCE(%s::integer, (
                SELECT id FROM enterprise_cohorts WHERE program_id = %s ORDER BY created_at DESC LIMIT 1
            ))
        """, (data.get("cohort_id"), program_id))
        cohort_id = cur.fetchone()[0]
        cur.execute("SELECT 1 FROM enterprise_cohorts WHERE id = %s AND program_id = %s", (cohort_id, program_id))
        if not cohort_id or not cur.fetchone():
            return jsonify({"error": "Cohort not found for this program"}), 404
        for email in emails:
            cur.execute("""
                INSERT INTO enterprise_followup_managers (program_id, cohort_id, manager_email)
                VALUES (%s, %s, %s) ON CONFLICT DO NOTHING
            """, (program_id, cohort_id, email))
        conn.commit()
        return jsonify({"program_id": program_id, "cohort_id": cohort_id, "registered": len(emails)}), 201
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()


@enterprise_followup_bp.route("/api/enterprise/programs/<int:program_id>/followup/coverage", methods=["GET"])
def followup_coverage(program_id: int):
    """Admin view: who has / has not responded, plus cohort aggregates and evidence cards.

    Per-manager rows carry only responded yes/no, never the answer.
    """
    if not _is_admin():
        return jsonify({"error": "Enterprise admin only"}), 403
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        loaded = _load_config(cur, program_id)
        if not loaded:
            return jsonify({"error": "Program not found"}), 404
        program_name, config = loaded
        cur.execute("SELECT id, label FROM enterprise_cohorts WHERE program_id = %s ORDER BY created_at", (program_id,))
        cohorts = cur.fetchall()
        result = []
        for cohort_id, label in cohorts:
            cur.execute("""
                SELECT m.id, m.manager_email,
                       COALESCE(array_agg(r.interval_days) FILTER (WHERE r.id IS NOT NULL), '{}')
                FROM enterprise_followup_managers m
                LEFT JOIN enterprise_followup_responses r ON r.manager_id = m.id
                WHERE m.program_id = %s AND m.cohort_id = %s
                GROUP BY m.id, m.manager_email ORDER BY m.manager_email
            """, (program_id, cohort_id))
            managers = cur.fetchall()
            intervals = []
            for interval in config["intervals_days"]:
                aggregate = _cohort_aggregate(cur, program_id, cohort_id, interval, config["min_group_size"])
                _save_snapshot(cur, program_id, cohort_id, config["program_version"], interval, aggregate)
                intervals.append({
                    "interval_days": interval,
                    "due": is_due(config["anchor_date"], interval),
                    "managers": [
                        {"email": email, "responded": interval in (done or [])}
                        for _, email, done in managers
                    ],
                    "aggregate": aggregate,
                    "evidence_card": evidence_card(program_name, label, interval, aggregate),
                })
            result.append({"cohort": {"id": cohort_id, "label": label}, "intervals": intervals})
        conn.commit()
        return jsonify({
            "program_id": program_id,
            "config": _public_config(config),
            "status_labels": STATUS_LABELS,
            "cohorts": result,
        })
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()


@enterprise_followup_bp.route("/api/enterprise/programs/<int:program_id>/followup/snapshots", methods=["GET"])
def followup_snapshots(program_id: int):
    """LTM view: stored aggregates per program version and cohort, for version comparison."""
    if not _is_admin():
        return jsonify({"error": "Enterprise admin only"}), 403
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT s.program_version, c.label, s.interval_days, s.aggregate, s.updated_at
            FROM enterprise_followup_snapshots s
            JOIN enterprise_cohorts c ON c.id = s.cohort_id
            WHERE s.program_id = %s
            ORDER BY s.program_version, c.label, s.interval_days
        """, (program_id,))
        return jsonify({"snapshots": [
            {"program_version": r[0], "cohort": r[1], "interval_days": r[2],
             "aggregate": r[3], "updated_at": r[4].isoformat()}
            for r in cur.fetchall()
        ]})
    finally:
        conn.close()


@enterprise_followup_bp.route("/api/enterprise/followup/mine", methods=["GET"])
def my_followups():
    """Manager view: only this manager's own requests and own answers."""
    email = _email()
    if not email:
        return jsonify({"error": "X-User-Email required"}), 401
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT m.id, m.program_id, m.cohort_id, p.name, c.label
            FROM enterprise_followup_managers m
            JOIN enterprise_programs p ON p.id = m.program_id
            JOIN enterprise_cohorts c ON c.id = m.cohort_id
            WHERE m.manager_email = %s ORDER BY m.created_at DESC
        """, (email,))
        requests = []
        for manager_id, program_id, _cohort_id, program_name, cohort_label in cur.fetchall():
            _, config = _load_config(cur, program_id)
            cur.execute("""
                SELECT interval_days, status, comment FROM enterprise_followup_responses
                WHERE manager_id = %s
            """, (manager_id,))
            answered = {r[0]: (r[1], r[2]) for r in cur.fetchall()}
            for interval in config["intervals_days"]:
                status, comment = answered.get(interval, (None, ""))
                requests.append({
                    "manager_id": manager_id,
                    "program": program_name,
                    "cohort": cohort_label,
                    "interval_days": interval,
                    "due": is_due(config["anchor_date"], interval),
                    "my_status": status,
                    "my_comment": comment,
                })
        return jsonify({"requests": requests, "options": [
            {"value": s, "label": STATUS_LABELS[s]} for s in STATUSES
        ]})
    finally:
        conn.close()


@enterprise_followup_bp.route("/api/enterprise/followup/mine/<int:manager_id>/<int:interval_days>", methods=["PUT"])
def submit_followup(manager_id: int, interval_days: int):
    email = _email()
    if not email:
        return jsonify({"error": "X-User-Email required"}), 401
    data = request.get_json(silent=True) or {}
    try:
        status, comment = validate_response(data.get("status"), data.get("comment"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT program_id, cohort_id FROM enterprise_followup_managers
            WHERE id = %s AND manager_email = %s
        """, (manager_id, email))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Follow-up request not found"}), 404
        program_id, cohort_id = row
        _, config = _load_config(cur, program_id)
        if interval_days not in config["intervals_days"]:
            return jsonify({"error": "Interval is not configured for this program"}), 400
        if not is_due(config["anchor_date"], interval_days):
            return jsonify({"error": "This follow-up is not due yet"}), 409
        cur.execute("""
            INSERT INTO enterprise_followup_responses (manager_id, interval_days, status, comment)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (manager_id, interval_days)
            DO UPDATE SET status = EXCLUDED.status, comment = EXCLUDED.comment
        """, (manager_id, interval_days, status, comment))
        aggregate = _cohort_aggregate(cur, program_id, cohort_id, interval_days, config["min_group_size"])
        _save_snapshot(cur, program_id, cohort_id, config["program_version"], interval_days, aggregate)
        conn.commit()
        return jsonify({"manager_id": manager_id, "interval_days": interval_days, "status": status})
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()
