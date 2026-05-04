"""Student profile routes — CRUD for student-facing profile page."""

import json
from flask import Blueprint, request, jsonify
from db import get_db

profile_bp = Blueprint("profile", __name__)


def _get_or_create_profile(email: str) -> dict | None:
    """Fetch profile by email, creating a blank one if it doesn't exist."""
    conn = get_db()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, email, display_name, preferred_style, persona_sets, created_at, updated_at "
            "FROM student_profiles WHERE email = %s",
            (email,),
        )
        row = cur.fetchone()
        if row:
            cur.close()
            conn.close()
            return {
                "id": row[0],
                "email": row[1],
                "display_name": row[2] or "",
                "preferred_style": row[3] or "",
                "persona_sets": row[4] or [],
                "created_at": row[5].isoformat() if row[5] else None,
                "updated_at": row[6].isoformat() if row[6] else None,
            }
        # Auto-create
        cur.execute(
            "INSERT INTO student_profiles (email) VALUES (%s) RETURNING id, created_at",
            (email,),
        )
        new = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return {
            "id": new[0],
            "email": email,
            "display_name": "",
            "preferred_style": "",
            "persona_sets": [],
            "created_at": new[1].isoformat() if new[1] else None,
            "updated_at": None,
        }
    except Exception as e:
        print(f"[profile] get_or_create error: {e}")
        conn.close()
        return None


@profile_bp.route("/api/profile", methods=["GET"])
def get_profile():
    """Return the student's profile. Auto-creates one if it doesn't exist."""
    email = request.headers.get("X-User-Email", "").strip()
    if not email:
        return jsonify({"error": "Missing X-User-Email header"}), 400

    profile = _get_or_create_profile(email)
    if profile is None:
        return jsonify({"error": "Database unavailable"}), 503
    return jsonify(profile), 200


@profile_bp.route("/api/profile", methods=["PUT"])
def update_profile():
    """Update display_name and/or preferred_style."""
    email = request.headers.get("X-User-Email", "").strip()
    if not email:
        return jsonify({"error": "Missing X-User-Email header"}), 400

    data = request.get_json(force=True)
    display_name = data.get("display_name")
    preferred_style = data.get("preferred_style")

    # Validate preferred_style
    valid_styles = ("", "analogy", "steps", "narrative")
    if preferred_style is not None and preferred_style not in valid_styles:
        return jsonify({"error": f"preferred_style must be one of {valid_styles}"}), 400

    # Ensure profile exists
    _get_or_create_profile(email)

    conn = get_db()
    if not conn:
        return jsonify({"error": "Database unavailable"}), 503

    try:
        cur = conn.cursor()
        updates = []
        params = []
        if display_name is not None:
            updates.append("display_name = %s")
            params.append(display_name)
        if preferred_style is not None:
            updates.append("preferred_style = %s")
            params.append(preferred_style)
        if not updates:
            cur.close()
            conn.close()
            return jsonify({"status": "ok", "message": "Nothing to update"}), 200

        updates.append("updated_at = NOW()")
        params.append(email)
        cur.execute(
            f"UPDATE student_profiles SET {', '.join(updates)} WHERE email = %s",
            params,
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"status": "ok"}), 200
    except Exception as e:
        print(f"[profile] update error: {e}")
        conn.close()
        return jsonify({"error": str(e)}), 500


@profile_bp.route("/api/profile/courses", methods=["GET"])
def get_student_courses():
    """
    Return courses this student has interacted with
    (via feedback or annotations), plus basic mastery overview per course.
    """
    email = request.headers.get("X-User-Email", "").strip()
    if not email:
        return jsonify({"error": "Missing X-User-Email header"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Database unavailable"}), 503

    try:
        cur = conn.cursor()
        # Find courses from feedback + annotations, join with curricula for metadata
        cur.execute("""
            SELECT DISTINCT c.id, c.topic, c.course_code, c.module_count
            FROM curricula c
            WHERE c.id IN (
                SELECT DISTINCT course_id FROM student_feedback WHERE student_id = %s
                UNION
                SELECT DISTINCT course_id FROM concept_annotations WHERE student_id = %s
            )
            ORDER BY c.id
        """, (email, email))
        courses = []
        for row in cur.fetchall():
            course_id = row[0]
            # Get module-level mastery overview for color blocks
            cur.execute("""
                SELECT module_id, mastery_level
                FROM cohort_concept_mastery
                WHERE course_id = %s AND valid_to IS NULL
                ORDER BY module_id
            """, (course_id,))
            mastery_rows = cur.fetchall()
            # Aggregate: for each module, pick the "worst" mastery across concepts
            module_mastery = {}
            for m_row in mastery_rows:
                mod = m_row[0]
                level = m_row[1]
                # Priority: struggling > learning > mastered > not_started
                priority = {"struggling": 3, "learning": 2, "mastered": 1, "not_started": 0}
                current = module_mastery.get(mod, "not_started")
                if priority.get(level, 0) > priority.get(current, 0):
                    module_mastery[mod] = level

            courses.append({
                "id": course_id,
                "topic": row[1] or "",
                "course_code": row[2] or "",
                "module_count": row[3] or 0,
                "module_mastery": module_mastery,
            })

        cur.close()
        conn.close()
        return jsonify({"courses": courses}), 200
    except Exception as e:
        print(f"[profile] courses error: {e}")
        conn.close()
        return jsonify({"error": str(e)}), 500
