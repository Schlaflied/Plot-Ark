"""Student self-view routes — personal behavioral mirror (footprint + rhythm).

Serves each student their OWN xAPI traces so the data producer gets
interpretive access to their data (Cogito Direction A/B at LMS scale).

RED-LINE COMPLIANCE:
  - Endpoints return only the requesting student's rows (X-User-Email scoped)
  - No class averages, rankings, or peer comparisons of any kind
  - Behavioral counts (visits / revisits) only — no mastery scores
"""

import re
from flask import Blueprint, request, jsonify
from db import get_db

selfview_bp = Blueprint("selfview", __name__)


def _normalize_module_id(raw_id: str) -> str:
    """Normalize an xAPI object_id to 'module_N' (1-indexed).

    xAPI stores module IDs as 'course/X/module/N' (0-indexed);
    downstream consumers (KG mapping, frontend) use 'module_N' (1-indexed).
    """
    m = re.search(r"module/(\d+)", raw_id)
    if m:
        return f"module_{int(m.group(1)) + 1}"
    return raw_id


@selfview_bp.route("/api/selfview/footprint/<int:course_id>", methods=["GET"])
def get_footprint(course_id: int):
    """Return the student's own attention footprint for a course.

    Module-level: visits, revisit days, last visit, verb breakdown.
    Concept-level: module counts projected onto KG concepts via kg_mapper.
    """
    email = request.headers.get("X-User-Email", "").strip()
    if not email:
        return jsonify({"error": "Missing X-User-Email header"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()
        prefix = f"course/{course_id}/%"

        # Per-module aggregates — only this student's rows
        cur.execute("""
            SELECT substring(object_id from 'module/(\\d+)') AS mod_idx,
                   COUNT(*) AS visits,
                   COUNT(DISTINCT DATE(timestamp)) AS active_days,
                   MAX(timestamp) AS last_visited
            FROM xapi_statements
            WHERE actor_email = %s AND object_id LIKE %s
              AND object_id LIKE %s
            GROUP BY mod_idx
            ORDER BY mod_idx
        """, (email, prefix, f"course/{course_id}/module/%"))
        module_rows = cur.fetchall()

        # Per-module verb breakdown
        cur.execute("""
            SELECT substring(object_id from 'module/(\\d+)') AS mod_idx,
                   verb, COUNT(*)
            FROM xapi_statements
            WHERE actor_email = %s AND object_id LIKE %s
              AND object_id LIKE %s
            GROUP BY mod_idx, verb
        """, (email, prefix, f"course/{course_id}/module/%"))
        verb_map: dict[str, dict[str, int]] = {}
        for mod_idx, verb, count in cur.fetchall():
            if mod_idx is None:
                continue
            key = f"module_{int(mod_idx) + 1}"
            verb_map.setdefault(key, {})[verb] = count

        cur.close()
        conn.close()

        modules: dict[str, dict] = {}
        for mod_idx, visits, active_days, last_visited in module_rows:
            if mod_idx is None:
                continue
            key = f"module_{int(mod_idx) + 1}"
            modules[key] = {
                "visits": visits,
                # Revisits = distinct active days beyond the first
                "revisits": max(0, active_days - 1),
                "last_visited": last_visited.isoformat() if last_visited else None,
                "verbs": verb_map.get(key, {}),
            }

        # Project module counts onto KG concepts (graceful degradation: no KG → {})
        concepts: dict[str, dict] = {}
        try:
            from services.kg_mapper import get_kg_mapping_for_course
            mapping = get_kg_mapping_for_course(course_id)
            if mapping:
                for mod_num, concept_list in (mapping.get("module_concepts") or {}).items():
                    mod_key = f"module_{mod_num}"
                    footprint = modules.get(mod_key)
                    if not footprint:
                        continue
                    for c in concept_list or []:
                        label = c.get("label") if isinstance(c, dict) else str(c)
                        if not label:
                            continue
                        entry = concepts.setdefault(label, {"visits": 0, "revisits": 0, "last_visited": None})
                        entry["visits"] += footprint["visits"]
                        entry["revisits"] += footprint["revisits"]
                        lv = footprint["last_visited"]
                        if lv and (entry["last_visited"] is None or lv > entry["last_visited"]):
                            entry["last_visited"] = lv
        except Exception as e:
            print(f"[selfview] KG projection skipped for course {course_id}: {e}")

        return jsonify({
            "course_id": course_id,
            "modules": modules,
            "concepts": concepts,
        })
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@selfview_bp.route("/api/selfview/rhythm/<int:course_id>", methods=["GET"])
def get_rhythm(course_id: int):
    """Return the student's own 7x24 activity matrix for a course.

    matrix[weekday][hour] = statement count; weekday 0 = Sunday (Postgres dow).
    """
    email = request.headers.get("X-User-Email", "").strip()
    if not email:
        return jsonify({"error": "Missing X-User-Email header"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()
        prefix = f"course/{course_id}/%"

        cur.execute("""
            SELECT EXTRACT(dow FROM timestamp)::int AS dow,
                   EXTRACT(hour FROM timestamp)::int AS hour,
                   COUNT(*)
            FROM xapi_statements
            WHERE actor_email = %s AND object_id LIKE %s
            GROUP BY dow, hour
        """, (email, prefix))
        matrix = [[0] * 24 for _ in range(7)]
        for dow, hour, count in cur.fetchall():
            matrix[dow][hour] = count

        cur.execute("""
            SELECT COUNT(*),
                   COUNT(DISTINCT DATE(timestamp)),
                   MIN(timestamp), MAX(timestamp)
            FROM xapi_statements
            WHERE actor_email = %s AND object_id LIKE %s
        """, (email, prefix))
        total, active_days, first_activity, last_activity = cur.fetchone()

        cur.close()
        conn.close()

        return jsonify({
            "course_id": course_id,
            "matrix": matrix,
            "total_statements": total,
            "active_days": active_days,
            "first_activity": first_activity.isoformat() if first_activity else None,
            "last_activity": last_activity.isoformat() if last_activity else None,
        })
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@selfview_bp.route("/api/selfview/students/<int:course_id>", methods=["GET"])
def list_students(course_id: int):
    """Demo helper: list mock students with xAPI activity in a course.

    Used by the login page to 'act as' a generated student.
    """
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT actor_email, actor_name, COUNT(*) AS statements
            FROM xapi_statements
            WHERE object_id LIKE %s
            GROUP BY actor_email, actor_name
            ORDER BY statements DESC
        """, (f"course/{course_id}/%",))
        students = [
            {"email": r[0], "name": r[1], "statements": r[2]}
            for r in cur.fetchall()
        ]
        cur.close()
        conn.close()
        return jsonify({"course_id": course_id, "students": students})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500
