"""Mastery API routes — serves concept mastery data to frontend.

Endpoints:
  GET  /api/mastery/<course_id>        → current mastery map
  POST /api/mastery/<course_id>/sync   → trigger mastery recalculation
"""

from flask import Blueprint, request, jsonify

mastery_bp = Blueprint("mastery", __name__)

_MASTERY_ORDER = {"mastered": 4, "learning": 3, "struggling": 2, "not_started": 1}


@mastery_bp.route("/api/mastery/all", methods=["GET"])
def get_mastery_all():
    """Return merged concept mastery across all courses (best-wins per concept).

    Used by the standalone /graph page which has no specific course context.
    """
    from services.mastery_tracker import get_concept_mastery_map
    from db import get_db

    conn = get_db()
    if not conn:
        return jsonify({"mastery": {}})
    try:
        cur = conn.cursor()
        cur.execute("SELECT DISTINCT course_id FROM cohort_concept_mastery")
        course_ids = [row[0] for row in cur.fetchall()]
        cur.close()
        conn.close()
    except Exception:
        return jsonify({"mastery": {}})

    merged: dict[str, str] = {}
    for cid in course_ids:
        for concept, level in get_concept_mastery_map(cid).items():
            if _MASTERY_ORDER.get(level, 0) > _MASTERY_ORDER.get(merged.get(concept, ""), 0):
                merged[concept] = level

    return jsonify({"mastery": merged})


@mastery_bp.route("/api/mastery/<int:course_id>", methods=["GET"])
def get_mastery(course_id):
    """Return concept mastery map for a course.

    Response: {"mastery": {"concept_id": "mastered", ...}}
    """
    from services.mastery_tracker import get_concept_mastery_map

    semester = request.args.get("semester", "")
    mastery = get_concept_mastery_map(course_id, semester)
    return jsonify({"course_id": course_id, "mastery": mastery})


@mastery_bp.route("/api/mastery/<int:course_id>/sync", methods=["POST"])
def sync_mastery(course_id):
    """Trigger mastery recalculation from feedback + xAPI data.

    Requires KG mapping to exist for this course.
    """
    from services.mastery_tracker import sync_concept_mastery
    from services.kg_mapper import get_kg_mapping_for_course

    data = request.get_json() or {}
    semester = data.get("semester", "")

    # Get KG mapping for this course
    kg_mapping = get_kg_mapping_for_course(course_id)
    if not kg_mapping or not kg_mapping.get("module_concepts"):
        return jsonify({
            "status": "skipped",
            "reason": "No KG mapping available for this course",
        }), 200

    sync_concept_mastery(course_id, kg_mapping, semester)

    return jsonify({
        "status": "synced",
        "course_id": course_id,
    })
