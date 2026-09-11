"""Enterprise L&D API facade over Plot Ark's shared learning engine."""

from __future__ import annotations

import hashlib
import json

from flask import Blueprint, jsonify, request

from db import get_db
from services.enterprise_ingest import (
    parse_enterprise_source,
    validate_upload_batch,
)
from services.enterprise_analysis import analyze_enterprise_program
from services.enterprise_ltm import write_enterprise_cold_snapshot
from services.lightrag_service import slug


enterprise_bp = Blueprint("enterprise", __name__)


def _program_row(row) -> dict:
    return {
        "id": row[0],
        "name": row[1],
        "description": row[2] or "",
        "organization": {"id": row[3], "name": row[4], "slug": row[5]},
        "engine_course_id": row[6],
        "created_at": row[7].isoformat() if row[7] else None,
        "cohort": {"id": row[8], "label": row[9]} if row[8] else None,
        "source_count": int(row[10] or 0),
        "event_count": int(row[11] or 0),
    }


@enterprise_bp.route("/api/enterprise/programs", methods=["GET"])
def list_programs():
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT p.id, p.name, p.description, o.id, o.name, o.slug,
                   p.engine_course_id, p.created_at, c.id, c.label,
                   COUNT(DISTINCT s.id), COUNT(DISTINCT e.id)
            FROM enterprise_programs p
            JOIN organizations o ON o.id = p.organization_id
            LEFT JOIN enterprise_cohorts c ON c.id = (
                SELECT c2.id FROM enterprise_cohorts c2
                WHERE c2.program_id = p.id ORDER BY c2.created_at DESC LIMIT 1
            )
            LEFT JOIN enterprise_sources s ON s.program_id = p.id
            LEFT JOIN enterprise_learning_events e ON e.program_id = p.id
            GROUP BY p.id, o.id, c.id
            ORDER BY p.created_at DESC
        """)
        return jsonify({"programs": [_program_row(row) for row in cur.fetchall()]})
    finally:
        conn.close()


@enterprise_bp.route("/api/enterprise/programs", methods=["POST"])
def create_program():
    data = request.get_json(silent=True) or {}
    organization_name = str(data.get("organization_name", "")).strip()
    program_name = str(data.get("program_name", "")).strip()
    cohort_label = str(data.get("cohort_label", "Initial cohort")).strip() or "Initial cohort"
    description = str(data.get("description", "")).strip()
    if not organization_name or not program_name:
        return jsonify({"error": "organization_name and program_name are required"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        organization_slug = slug(organization_name)
        cur.execute("""
            INSERT INTO organizations (name, slug)
            VALUES (%s, %s)
            ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
            RETURNING id
        """, (organization_name, organization_slug))
        organization_id = cur.fetchone()[0]
        cur.execute("""
            INSERT INTO curricula
                (topic, level, audience, course_code, course_type, module_count, modules, sources, semester)
            VALUES (%s, 'workplace', 'employees', %s, 'enterprise', 0, '[]', '[]', %s)
            RETURNING id
        """, (program_name, f"ENT-{organization_slug[:12].upper()}", cohort_label))
        engine_course_id = cur.fetchone()[0]
        cur.execute("""
            INSERT INTO enterprise_programs (organization_id, engine_course_id, name, description)
            VALUES (%s, %s, %s, %s) RETURNING id, created_at
        """, (organization_id, engine_course_id, program_name, description))
        program_id, created_at = cur.fetchone()
        cur.execute("""
            INSERT INTO enterprise_cohorts (program_id, label)
            VALUES (%s, %s) RETURNING id
        """, (program_id, cohort_label))
        cohort_id = cur.fetchone()[0]
        conn.commit()
        return jsonify({
            "id": program_id,
            "name": program_name,
            "description": description,
            "organization": {"id": organization_id, "name": organization_name, "slug": organization_slug},
            "engine_course_id": engine_course_id,
            "cohort": {"id": cohort_id, "label": cohort_label},
            "created_at": created_at.isoformat(),
        }), 201
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()


@enterprise_bp.route("/api/enterprise/programs/<int:program_id>", methods=["GET"])
def get_program(program_id: int):
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT p.id, p.name, p.description, o.id, o.name, o.slug,
                   p.engine_course_id, p.created_at, c.id, c.label,
                   COUNT(DISTINCT s.id), COUNT(DISTINCT e.id)
            FROM enterprise_programs p
            JOIN organizations o ON o.id = p.organization_id
            LEFT JOIN enterprise_cohorts c ON c.id = (
                SELECT c2.id FROM enterprise_cohorts c2
                WHERE c2.program_id = p.id ORDER BY c2.created_at DESC LIMIT 1
            )
            LEFT JOIN enterprise_sources s ON s.program_id = p.id
            LEFT JOIN enterprise_learning_events e ON e.program_id = p.id
            WHERE p.id = %s
            GROUP BY p.id, o.id, c.id
        """, (program_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Program not found"}), 404
        program = _program_row(row)
        cur.execute("""
            SELECT id, filename, source_kind, metadata, created_at
            FROM enterprise_sources WHERE program_id = %s ORDER BY created_at DESC
        """, (program_id,))
        program["sources"] = [
            {
                "id": source[0], "filename": source[1], "source_kind": source[2],
                "metadata": source[3] or {}, "created_at": source[4].isoformat(),
            }
            for source in cur.fetchall()
        ]
        return jsonify(program)
    finally:
        conn.close()


def _learner_token(organization_id: int, learner_ref: str) -> str:
    material = f"{organization_id}:{learner_ref.strip().lower()}".encode("utf-8")
    return "learner_" + hashlib.sha256(material).hexdigest()[:16]


@enterprise_bp.route("/api/enterprise/programs/<int:program_id>/sources", methods=["POST"])
def upload_sources(program_id: int):
    source_kind = request.form.get("source_kind", "training_content").strip()
    if source_kind not in {"training_content", "lms_report"}:
        return jsonify({"error": "source_kind must be training_content or lms_report"}), 400
    uploads = request.files.getlist("files[]")
    files = [(upload.filename or "unknown", upload.read()) for upload in uploads]
    try:
        validate_upload_batch(files, source_kind)
        parsed_sources = [parse_enterprise_source(name, content, source_kind) for name, content in files]
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT p.organization_id, p.engine_course_id,
                   COALESCE(%s::integer, (
                       SELECT id FROM enterprise_cohorts
                       WHERE program_id = p.id ORDER BY created_at DESC LIMIT 1
                   ))
            FROM enterprise_programs p WHERE p.id = %s
        """, (request.form.get("cohort_id") or None, program_id))
        scope = cur.fetchone()
        if not scope:
            return jsonify({"error": "Program not found"}), 404
        organization_id, engine_course_id, cohort_id = scope
        response_sources = []
        module_candidates = []
        for (filename, content), parsed in zip(files, parsed_sources):
            cur.execute("""
                INSERT INTO enterprise_sources
                    (program_id, cohort_id, filename, source_kind, size_bytes, metadata, extracted_text)
                VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id, created_at
            """, (
                program_id, cohort_id, filename, source_kind, len(content),
                json.dumps(parsed.metadata, default=str), parsed.extracted_text,
            ))
            source_id, created_at = cur.fetchone()
            for event in parsed.events:
                cur.execute("""
                    INSERT INTO enterprise_learning_events
                        (organization_id, program_id, cohort_id, source_id, learner_ref,
                         module_id, module_title, event_type, completion, score,
                         duration_seconds, attempts, occurred_at, raw_payload)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                            COALESCE(%s::timestamptz, NOW()), %s)
                """, (
                    organization_id, program_id, cohort_id, source_id,
                    _learner_token(organization_id, event["learner_ref"]),
                    event["module_id"], event["module_title"], event["event_type"],
                    event["completion"], event["score"], event["duration_seconds"],
                    event["attempts"], event["occurred_at"] or None,
                    # Preserve provenance through source_id without retaining
                    # the original LMS row, which may contain names or email.
                    json.dumps({"imported_from": source_kind}),
                ))
            module_candidates.extend(parsed.metadata.get("modules", []))
            response_sources.append({
                "id": source_id,
                "filename": filename,
                "source_kind": source_kind,
                "metadata": parsed.metadata,
                "events_imported": len(parsed.events),
                "created_at": created_at.isoformat(),
            })

        if module_candidates:
            modules = [
                {"id": module.get("id"), "title": module.get("title"), "content": ""}
                for module in module_candidates
            ]
            cur.execute("""
                UPDATE curricula SET modules = %s, module_count = %s WHERE id = %s
            """, (json.dumps(modules), len(modules), engine_course_id))
        conn.commit()
        return jsonify({"program_id": program_id, "sources": response_sources}), 201
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()


@enterprise_bp.route("/api/enterprise/programs/<int:program_id>/pulse", methods=["POST"])
def submit_pulse(program_id: int):
    data = request.get_json(silent=True) or {}
    state = str(data.get("state", "")).strip()
    module_id = str(data.get("module_id", "course")).strip() or "course"
    learner_ref = str(data.get("learner_ref", "anonymous")).strip() or "anonymous"
    if state not in {"understood", "partial", "unlocated", "not-reviewed"}:
        return jsonify({"error": "Invalid pulse state"}), 400
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT p.organization_id, c.id
            FROM enterprise_programs p JOIN enterprise_cohorts c ON c.program_id = p.id
            WHERE p.id = %s ORDER BY c.created_at DESC LIMIT 1
        """, (program_id,))
        scope = cur.fetchone()
        if not scope:
            return jsonify({"error": "Program not found"}), 404
        organization_id, cohort_id = scope
        cur.execute("""
            INSERT INTO enterprise_pulses
                (organization_id, program_id, cohort_id, learner_ref, module_id, state)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id, created_at
        """, (
            organization_id, program_id, cohort_id,
            _learner_token(organization_id, learner_ref), module_id, state,
        ))
        pulse_id, created_at = cur.fetchone()
        conn.commit()
        return jsonify({"id": pulse_id, "state": state, "created_at": created_at.isoformat()}), 201
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()


@enterprise_bp.route("/api/enterprise/programs/<int:program_id>/analyze", methods=["POST"])
def analyze_program(program_id: int):
    data = request.get_json(silent=True) or {}
    cohort_id = data.get("cohort_id")
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        run_id, report = analyze_enterprise_program(conn, program_id, cohort_id)
        conn.commit()
    except LookupError as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 404
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()

    try:
        report["ltm"] = {"status": "saved", "path": write_enterprise_cold_snapshot(report)}
    except Exception as exc:
        report["ltm"] = {"status": "warning", "message": str(exc)}
    return jsonify(report), 201


@enterprise_bp.route("/api/enterprise/programs/<int:program_id>/analysis/latest", methods=["GET"])
def latest_analysis(program_id: int):
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, report FROM enterprise_analysis_runs
            WHERE program_id = %s ORDER BY created_at DESC LIMIT 1
        """, (program_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "No analysis found"}), 404
        run_id, report = row
        cur.execute("""
            SELECT id, module_id, title, detail, evidence, impact, confidence, status
            FROM enterprise_suggestions
            WHERE analysis_run_id = %s ORDER BY id
        """, (run_id,))
        report["suggestions"] = [
            {
                "id": item[0], "module_id": item[1], "title": item[2],
                "detail": item[3], "evidence": item[4], "impact": item[5],
                "confidence": item[6], "status": item[7],
            }
            for item in cur.fetchall()
        ]
        return jsonify(report)
    finally:
        conn.close()


@enterprise_bp.route("/api/enterprise/suggestions/<int:suggestion_id>", methods=["PATCH"])
def decide_suggestion(suggestion_id: int):
    data = request.get_json(silent=True) or {}
    status = str(data.get("status", "")).strip()
    if status not in {"accepted", "rejected"}:
        return jsonify({"error": "status must be accepted or rejected"}), 400
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE enterprise_suggestions
            SET status = %s, decided_at = NOW()
            WHERE id = %s RETURNING id, status, decided_at
        """, (status, suggestion_id))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Suggestion not found"}), 404
        conn.commit()
        return jsonify({"id": row[0], "status": row[1], "decided_at": row[2].isoformat()})
    except Exception as exc:
        conn.rollback()
        return jsonify({"error": str(exc)}), 500
    finally:
        conn.close()
