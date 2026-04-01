"""Student feedback routes — saves sentiment + comments to PostgreSQL & Redis."""

import json
from flask import Blueprint, request, jsonify
from db import get_db
from config import redis_client

feedback_bp = Blueprint("feedback", __name__)


@feedback_bp.route("/api/feedback", methods=["POST"])
def submit_feedback():
    """
    Accept student module feedback.
    Body JSON:
      {
        "course_id": int,
        "module_index": int,
        "module_title": str,
        "sentiment": str,        # "got-it" | "mostly" | "off" | "not-read"
        "comment": str (optional),
        "student_id": str
      }

    Stores into:
      1. PostgreSQL  →  student_feedback table  (persistent)
      2. Redis       →  feedback:<course_id>:<module_index>  (real-time cache)
    """
    data = request.get_json(force=True)
    course_id = data.get("course_id")
    module_index = data.get("module_index")
    module_title = data.get("module_title", "")
    sentiment = data.get("sentiment")
    comment = data.get("comment", "")
    student_id = data.get("student_id", "anonymous")

    if course_id is None or module_index is None or not sentiment:
        return jsonify({"error": "Missing required fields: course_id, module_index, sentiment"}), 400

    # ── 1. Save to PostgreSQL ──────────────────────────────────────────────
    conn = get_db()
    row_id = None
    if conn:
        try:
            cur = conn.cursor()
            cur.execute(
                """INSERT INTO student_feedback
                   (course_id, module_index, module_title, sentiment, comment, student_id)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   RETURNING id""",
                (course_id, module_index, module_title, sentiment, comment, student_id),
            )
            row_id = cur.fetchone()[0]
            conn.commit()
            cur.close()
            conn.close()
        except Exception as e:
            print(f"Feedback DB save error: {e}")
            if conn:
                conn.close()
    else:
        print("No DB connection — feedback not persisted to PostgreSQL.")

    # ── 2. Save / update in Redis ──────────────────────────────────────────
    if redis_client:
        try:
            redis_key = f"feedback:{course_id}:{module_index}:{student_id}"
            redis_client.set(
                redis_key,
                json.dumps({
                    "course_id": course_id,
                    "module_index": module_index,
                    "module_title": module_title,
                    "sentiment": sentiment,
                    "comment": comment,
                    "student_id": student_id,
                }),
                ex=60 * 60 * 24 * 7,  # expire after 7 days
            )

            # Also maintain a per-module counter for quick aggregation
            counter_key = f"feedback_count:{course_id}:{module_index}:{sentiment}"
            redis_client.incr(counter_key)
            redis_client.expire(counter_key, 60 * 60 * 24 * 30)  # 30 days
        except Exception as e:
            print(f"Redis feedback cache error: {e}")

    return jsonify({
        "status": "ok",
        "id": row_id,
        "message": "Feedback recorded",
    }), 201


@feedback_bp.route("/api/feedback/<int:course_id>", methods=["GET"])
def get_course_feedback(course_id):
    """Retrieve all feedback for a given course (for professor analytics)."""
    conn = get_db()
    if not conn:
        return jsonify({"error": "Database unavailable"}), 503

    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT id, course_id, module_index, module_title, sentiment, comment,
                      student_id, created_at
               FROM student_feedback
               WHERE course_id = %s
               ORDER BY created_at DESC""",
            (course_id,),
        )
        cols = [desc[0] for desc in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]
        cur.close()
        conn.close()

        # Convert timestamps to ISO strings
        for r in rows:
            if r.get("created_at"):
                r["created_at"] = r["created_at"].isoformat()

        return jsonify(rows), 200
    except Exception as e:
        print(f"Feedback fetch error: {e}")
        conn.close()
        return jsonify({"error": str(e)}), 500


@feedback_bp.route("/api/feedback/<int:course_id>/summary", methods=["GET"])
def get_feedback_summary(course_id):
    """Aggregate feedback counts per module per sentiment (for dashboard charts)."""
    # Try Redis first for fast aggregation
    if redis_client:
        try:
            pattern = f"feedback_count:{course_id}:*"
            keys = redis_client.keys(pattern)
            summary = {}
            for key in keys:
                parts = key.split(":")
                mod_idx = parts[2]
                sentiment = parts[3]
                count = int(redis_client.get(key) or 0)
                if mod_idx not in summary:
                    summary[mod_idx] = {}
                summary[mod_idx][sentiment] = count
            if summary:
                return jsonify(summary), 200
        except Exception as e:
            print(f"Redis summary error: {e}")

    # Fallback to PostgreSQL
    conn = get_db()
    if not conn:
        return jsonify({"error": "Database unavailable"}), 503

    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT module_index, sentiment, COUNT(*) as count
               FROM student_feedback
               WHERE course_id = %s
               GROUP BY module_index, sentiment
               ORDER BY module_index""",
            (course_id,),
        )
        summary = {}
        for row in cur.fetchall():
            mod_idx = str(row[0])
            if mod_idx not in summary:
                summary[mod_idx] = {}
            summary[mod_idx][row[1]] = row[2]
        cur.close()
        conn.close()
        return jsonify(summary), 200
    except Exception as e:
        print(f"Feedback summary error: {e}")
        conn.close()
        return jsonify({"error": str(e)}), 500
