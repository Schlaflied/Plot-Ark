"""KG annotation routes — bidirectional concept marking.

Student: mark concept as 'confused' or 'important' (anonymous).
Professor: mark concept as 'exam_focus'.
Aggregated confusion count feeds professor dashboard.
"""

from flask import Blueprint, request, jsonify
from db import get_db

annotations_bp = Blueprint("annotations", __name__)

_DDL = """
CREATE TABLE IF NOT EXISTS concept_annotations (
    id SERIAL PRIMARY KEY,
    course_id INTEGER,
    concept_id TEXT NOT NULL,
    concept_label TEXT,
    role TEXT NOT NULL,
    annotation_type TEXT NOT NULL,
    session_id TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT now(),
    UNIQUE(course_id, concept_id, role, session_id, annotation_type)
);
"""


def _ensure_table(conn):
    cur = conn.cursor()
    cur.execute(_DDL)
    conn.commit()
    cur.close()


@annotations_bp.route("/api/kg/annotate", methods=["POST"])
def annotate_concept():
    """Toggle an annotation on a concept node.

    Body: { course_id, concept_id, concept_label, role, annotation_type, session_id }
    role: 'student' | 'professor'
    annotation_type: 'confused' | 'important' (student) | 'exam_focus' (professor)
    Returns: { action: 'added' | 'removed', annotation_type }
    """
    data = request.get_json() or {}
    course_id = data.get("course_id")
    concept_id = str(data.get("concept_id", "")).strip()
    concept_label = str(data.get("concept_label", "")).strip()
    role = data.get("role", "student")
    annotation_type = data.get("annotation_type", "confused")
    session_id = str(data.get("session_id", "anonymous")).strip()

    if not concept_id or role not in ("student", "professor"):
        return jsonify({"error": "Missing required fields"}), 400
    if role == "student" and annotation_type not in ("confused", "important"):
        return jsonify({"error": "Invalid annotation_type for student"}), 400
    if role == "professor" and annotation_type != "exam_focus":
        return jsonify({"error": "Invalid annotation_type for professor"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        _ensure_table(conn)
        cur = conn.cursor()

        # Toggle: if exists → remove, else → add
        cur.execute("""
            SELECT id FROM concept_annotations
            WHERE course_id IS NOT DISTINCT FROM %s
              AND concept_id = %s AND role = %s
              AND annotation_type = %s AND session_id = %s
        """, (course_id, concept_id, role, annotation_type, session_id))
        existing = cur.fetchone()

        if existing:
            cur.execute("DELETE FROM concept_annotations WHERE id = %s", (existing[0],))
            conn.commit()
            cur.close()
            conn.close()
            return jsonify({"action": "removed", "annotation_type": annotation_type})
        else:
            cur.execute("""
                INSERT INTO concept_annotations
                    (course_id, concept_id, concept_label, role, annotation_type, session_id)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT DO NOTHING
            """, (course_id, concept_id, concept_label, role, annotation_type, session_id))
            conn.commit()
            cur.close()
            conn.close()
            return jsonify({"action": "added", "annotation_type": annotation_type})

    except Exception as e:
        print(f"Annotation error: {e}")
        return jsonify({"error": str(e)}), 500


@annotations_bp.route("/api/kg/annotations/<int:course_id>", methods=["GET"])
def get_annotations(course_id):
    """Get aggregated annotations for a course.

    Returns:
      confusion_counts: { concept_id: { count, pct, label } }  (student confused, deduplicated by session)
      exam_focus: [concept_id, ...]  (professor-marked)
      important_counts: { concept_id: count }  (student-marked important)
      total_students: int  (unique sessions who annotated anything)
    """
    conn = get_db()
    if not conn:
        return jsonify({"confusion_counts": {}, "exam_focus": [], "important_counts": {}, "total_students": 0})
    try:
        _ensure_table(conn)
        cur = conn.cursor()

        # Total unique student sessions for this course (denominator for %)
        cur.execute("""
            SELECT COUNT(DISTINCT session_id) FROM concept_annotations
            WHERE course_id = %s AND role = 'student'
        """, (course_id,))
        total_students = cur.fetchone()[0] or 1

        # Confusion counts (unique sessions per concept)
        cur.execute("""
            SELECT concept_id, concept_label, COUNT(DISTINCT session_id) as cnt
            FROM concept_annotations
            WHERE course_id = %s AND role = 'student' AND annotation_type = 'confused'
            GROUP BY concept_id, concept_label
        """, (course_id,))
        confusion_counts = {}
        for row in cur.fetchall():
            concept_id, label, cnt = row
            confusion_counts[concept_id] = {
                "count": cnt,
                "pct": round(cnt / total_students * 100),
                "label": label or concept_id,
            }

        # Important counts
        cur.execute("""
            SELECT concept_id, COUNT(DISTINCT session_id) as cnt
            FROM concept_annotations
            WHERE course_id = %s AND role = 'student' AND annotation_type = 'important'
            GROUP BY concept_id
        """, (course_id,))
        important_counts = {row[0]: row[1] for row in cur.fetchall()}

        # Professor exam_focus marks
        cur.execute("""
            SELECT DISTINCT concept_id FROM concept_annotations
            WHERE course_id = %s AND role = 'professor' AND annotation_type = 'exam_focus'
        """, (course_id,))
        exam_focus = [row[0] for row in cur.fetchall()]

        cur.close()
        conn.close()
        return jsonify({
            "confusion_counts": confusion_counts,
            "exam_focus": exam_focus,
            "important_counts": important_counts,
            "total_students": total_students,
        })

    except Exception as e:
        print(f"Get annotations error: {e}")
        return jsonify({"confusion_counts": {}, "exam_focus": [], "important_counts": {}, "total_students": 0})


@annotations_bp.route("/api/kg/annotations/global", methods=["GET"])
def get_annotations_global():
    """Get aggregated annotations across all courses (for /graph standalone page)."""
    conn = get_db()
    if not conn:
        return jsonify({"confusion_counts": {}, "exam_focus": [], "important_counts": {}, "total_students": 0})
    try:
        _ensure_table(conn)
        cur = conn.cursor()

        cur.execute("SELECT COUNT(DISTINCT session_id) FROM concept_annotations WHERE role = 'student'")
        total_students = cur.fetchone()[0] or 1

        cur.execute("""
            SELECT concept_id, concept_label, COUNT(DISTINCT session_id) as cnt
            FROM concept_annotations WHERE role = 'student' AND annotation_type = 'confused'
            GROUP BY concept_id, concept_label
        """)
        confusion_counts = {}
        for row in cur.fetchall():
            confusion_counts[row[0]] = {"count": row[1], "pct": round(row[1] / total_students * 100), "label": row[2] or row[0]}

        cur.execute("""
            SELECT concept_id, COUNT(DISTINCT session_id) FROM concept_annotations
            WHERE role = 'student' AND annotation_type = 'important' GROUP BY concept_id
        """)
        important_counts = {row[0]: row[1] for row in cur.fetchall()}

        cur.execute("SELECT DISTINCT concept_id FROM concept_annotations WHERE role = 'professor' AND annotation_type = 'exam_focus'")
        exam_focus = [row[0] for row in cur.fetchall()]

        cur.close()
        conn.close()
        return jsonify({"confusion_counts": confusion_counts, "exam_focus": exam_focus, "important_counts": important_counts, "total_students": total_students})

    except Exception as e:
        return jsonify({"confusion_counts": {}, "exam_focus": [], "important_counts": {}, "total_students": 0})
