"""xAPI statement routes, analytics, and mock data seeding."""

import json
import random
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from db import get_db
from extensions import redis_client

xapi_bp = Blueprint("xapi", __name__)


# ── Receive statements ────────────────────────────────────────────────────────

@xapi_bp.route("/api/xapi/statement", methods=["POST"])
def receive_xapi():
    """Receive a single xAPI statement (e.g. student self-assessment) and store it."""
    statement = request.get_json()
    actor = statement.get("actor", {})
    verb = statement.get("verb", {})
    obj = statement.get("object", {})

    email = actor.get("mbox", "").replace("mailto:", "") or actor.get("email", "")
    name = actor.get("name", email)
    verb_id = verb.get("id", "").split("/")[-1] if verb.get("id") else verb.get("display", {}).get("en-US", "unknown")
    obj_id = obj.get("id", "")
    obj_name = obj.get("definition", {}).get("name", {}).get("en-US", obj_id)
    curriculum_topic = statement.get("context", {}).get("extensions", {}).get("curriculum_topic", "")
    course_id = statement.get("context", {}).get("extensions", {}).get("course_id")

    # Persist to DB
    conn = get_db()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO xapi_statements (actor_email, actor_name, verb, object_id, object_name, curriculum_topic, course_id) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (email, name, verb_id, obj_id, obj_name, curriculum_topic, course_id)
            )
            conn.commit()
            cur.close()
            conn.close()
        except Exception as e:
            print(f"xAPI statement save error: {e}")
            try:
                conn.close()
            except Exception:
                pass
            return {"error": "Failed to save statement"}, 500

    print(f"xAPI: {name} {verb_id} {obj_name}")
    return {"status": "stored"}, 200


@xapi_bp.route("/api/xapi/need-help/<int:course_id>", methods=["GET"])
def get_need_help_events(course_id):
    """Return all 'requested-help' xAPI events for a course, grouped by module."""
    conn = get_db()
    if not conn:
        return jsonify({"events": [], "by_module": []}), 200
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT actor_name, actor_email, object_id, object_name, timestamp
            FROM xapi_statements
            WHERE verb = 'requested-help' AND course_id = %s
            ORDER BY timestamp DESC
        """, (course_id,))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        events = []
        module_counts: dict = {}
        for name, email, obj_id, obj_name, ts in rows:
            mod_id = obj_id.split("/")[0] if "/" in (obj_id or "") else (obj_id or "")
            events.append({
                "student_name": name,
                "student_email": email,
                "module_id": mod_id,
                "module_name": obj_name,
                "timestamp": ts.isoformat() if ts else None,
            })
            module_counts[mod_id] = module_counts.get(mod_id, {"module_id": mod_id, "module_name": obj_name, "count": 0})
            module_counts[mod_id]["count"] += 1

        by_module = sorted(module_counts.values(), key=lambda x: -x["count"])
        return jsonify({"course_id": course_id, "total": len(events), "events": events, "by_module": by_module})
    except Exception as e:
        return jsonify({"events": [], "by_module": [], "error": str(e)}), 500


@xapi_bp.route("/xapi/statements", methods=["POST"])
def receive_xapi_statement():
    """Receive a single xAPI statement and store it."""
    data = request.get_json()
    actor = data.get("actor", {})
    verb = data.get("verb", {})
    obj = data.get("object", {})

    email = actor.get("mbox", "").replace("mailto:", "")
    name = actor.get("name", email)
    verb_id = verb.get("id", "").split("/")[-1]
    obj_id = obj.get("id", "")
    obj_name = obj.get("definition", {}).get("name", {}).get("en-US", obj_id)
    curriculum_topic = data.get("context", {}).get("extensions", {}).get("curriculum_topic", "")

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO xapi_statements (actor_email, actor_name, verb, object_id, object_name, curriculum_topic) VALUES (%s, %s, %s, %s, %s, %s)",
        (email, name, verb_id, obj_id, obj_name, curriculum_topic)
    )
    conn.commit()
    conn.close()

    if redis_client:
        key = f"learner:{email}"
        state = redis_client.get(key)
        state_data = json.loads(state) if state else {"viewed": [], "struggling": [], "mastered": []}
        if verb_id == "experienced" and obj_id not in state_data["viewed"]:
            state_data["viewed"].append(obj_id)
        elif verb_id == "struggled" and obj_id not in state_data["struggling"]:
            state_data["struggling"].append(obj_id)
        elif verb_id in ("completed", "passed") and obj_id not in state_data["mastered"]:
            state_data["mastered"].append(obj_id)
        redis_client.set(key, json.dumps(state_data))

    return jsonify({"status": "stored"})


# ── Read statements ───────────────────────────────────────────────────────────

@xapi_bp.route("/xapi/statements", methods=["GET"])
def get_xapi_statements():
    """Return recent xAPI statements (last 50)."""
    conn = get_db()
    if not conn:
        return jsonify([])
    cur = conn.cursor()
    cur.execute(
        "SELECT actor_name, actor_email, verb, object_name, object_id, timestamp, curriculum_topic FROM xapi_statements ORDER BY timestamp DESC LIMIT 50"
    )
    rows = cur.fetchall()
    conn.close()
    statements = [
        {"actor_name": r[0], "actor_email": r[1], "verb": r[2], "object_name": r[3], "object_id": r[4], "timestamp": r[5].isoformat(), "curriculum_topic": r[6]}
        for r in rows
    ]
    return jsonify(statements)


# ── Global analytics ──────────────────────────────────────────────────────────

@xapi_bp.route("/xapi/analytics", methods=["GET"])
def get_xapi_analytics():
    """Return aggregated learner analytics across all courses."""
    conn = get_db()
    if not conn:
        return jsonify({"students": [], "struggling_concepts": [], "modules": []})
    cur = conn.cursor()

    cur.execute("""
        SELECT actor_name, actor_email,
            COUNT(*) FILTER (WHERE verb IN ('completed', 'passed')) as mastered,
            COUNT(*) FILTER (WHERE verb = 'struggled') as struggling,
            COUNT(*) FILTER (WHERE verb = 'experienced') as viewed,
            MAX(timestamp) as last_seen
        FROM xapi_statements
        GROUP BY actor_name, actor_email
        ORDER BY last_seen DESC
    """)
    students = [
        {"name": r[0], "email": r[1], "mastered": r[2], "struggling": r[3], "viewed": r[4], "last_seen": r[5].isoformat()}
        for r in cur.fetchall()
    ]

    cur.execute("""
        SELECT object_name, COUNT(*) as struggle_count
        FROM xapi_statements
        WHERE verb = 'struggled'
        GROUP BY object_name
        ORDER BY struggle_count DESC
        LIMIT 5
    """)
    struggling_concepts = [{"concept": r[0], "count": r[1]} for r in cur.fetchall()]

    cur.execute("""
        SELECT object_id,
            COUNT(DISTINCT actor_email) FILTER (WHERE verb IN ('completed', 'passed')) as completed,
            COUNT(DISTINCT actor_email) as total_interacted
        FROM xapi_statements
        WHERE object_id LIKE 'course/%/module/%'
          AND object_id NOT LIKE 'course/%/module/%/%'
        GROUP BY object_id
        ORDER BY object_id
    """)
    modules = [{"module_id": r[0], "completed": r[1], "total": r[2]} for r in cur.fetchall()]

    conn.close()
    return jsonify({"students": students, "struggling_concepts": struggling_concepts, "modules": modules})


# ── Per-course analytics ──────────────────────────────────────────────────────

@xapi_bp.route("/xapi/analytics/<int:course_id>", methods=["GET"])
def get_course_xapi_analytics(course_id):
    """Return xAPI analytics scoped to a specific course."""
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()
        prefix = f"course/{course_id}/%"

        # Students in this course
        cur.execute("""
            SELECT actor_name, actor_email,
                COUNT(*) as total_actions,
                COUNT(*) FILTER (WHERE verb IN ('completed', 'passed')) as mastered,
                COUNT(*) FILTER (WHERE verb = 'struggled') as struggling,
                COUNT(*) FILTER (WHERE verb = 'experienced') as viewed,
                COUNT(*) FILTER (WHERE verb = 'failed') as failed,
                MAX(timestamp) as last_seen
            FROM xapi_statements
            WHERE object_id LIKE %s
            GROUP BY actor_name, actor_email
            ORDER BY last_seen DESC
        """, (prefix,))
        students = [
            {
                "name": r[0], "email": r[1], "total_actions": r[2],
                "mastered": r[3], "struggling": r[4], "viewed": r[5],
                "failed": r[6], "last_seen": r[7].isoformat() if r[7] else None,
            }
            for r in cur.fetchall()
        ]

        # Module completion rates
        module_prefix = f"course/{course_id}/module/%"
        cur.execute("""
            SELECT object_id, object_name,
                COUNT(DISTINCT actor_email) FILTER (WHERE verb IN ('completed', 'passed')) as completed,
                COUNT(DISTINCT actor_email) FILTER (WHERE verb = 'struggled') as struggled,
                COUNT(DISTINCT actor_email) as total_interacted
            FROM xapi_statements
            WHERE object_id LIKE %s
              AND object_id NOT LIKE %s
            GROUP BY object_id, object_name
            ORDER BY object_id
        """, (module_prefix, f"course/{course_id}/module/%/%"))
        modules = [
            {
                "module_id": r[0], "module_name": r[1],
                "completed": r[2], "struggled": r[3], "total": r[4],
            }
            for r in cur.fetchall()
        ]

        # Struggling concepts for this course
        cur.execute("""
            SELECT object_name, COUNT(*) as count
            FROM xapi_statements
            WHERE object_id LIKE %s AND verb = 'struggled'
            GROUP BY object_name
            ORDER BY count DESC
            LIMIT 10
        """, (prefix,))
        struggling = [{"concept": r[0], "count": r[1]} for r in cur.fetchall()]

        # Verb distribution
        cur.execute("""
            SELECT verb, COUNT(*) as count
            FROM xapi_statements
            WHERE object_id LIKE %s
            GROUP BY verb
            ORDER BY count DESC
        """, (prefix,))
        verb_dist = {r[0]: r[1] for r in cur.fetchall()}

        # Daily activity — no hard cut-off so mock data (generated 14 days ago)
        # is fully included.  We order by day and return the last 30 days.
        cur.execute("""
            SELECT DATE(timestamp) as day, COUNT(*) as count
            FROM xapi_statements
            WHERE object_id LIKE %s
            GROUP BY DATE(timestamp)
            ORDER BY day
            LIMIT 30
        """, (prefix,))
        daily_activity = [
            {"date": r[0].isoformat(), "count": r[1]}
            for r in cur.fetchall()
        ]

        cur.close()
        conn.close()

        return jsonify({
            "course_id": course_id,
            "students": students,
            "modules": modules,
            "struggling_concepts": struggling,
            "verb_distribution": verb_dist,
            "daily_activity": daily_activity,
            "total_students": len(students),
            "total_statements": sum(s["total_actions"] for s in students),
        })
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


# ── Manual seed endpoint ─────────────────────────────────────────────────────

@xapi_bp.route("/api/xapi/seed", methods=["POST"])
def trigger_seed():
    """
    Manually trigger xAPI mock data generation for all courses.
    Query params:
      - noise: float (0.0 to 1.0, default 0.15)
      - force: bool (if true, clear existing data first)
    """
    from services.xapi_generator import generate_all_courses

    noise = float(request.args.get("noise", 0.08))
    force = request.args.get("force", "false").lower() == "true"

    if force:
        conn = get_db()
        if conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM xapi_statements")
            cur.execute("DELETE FROM student_feedback WHERE student_id LIKE 'seed_%'")
            conn.commit()
            cur.close()
            conn.close()
            print("Cleared existing xAPI statements and seeded feedback.")

    result = generate_all_courses(noise_ratio=noise)

    # Seed feedback after xAPI so student counts are available
    from services.xapi_generator import seed_all_feedback
    fb_result = seed_all_feedback(noise_ratio=noise)
    result["feedback_rows"] = fb_result.get("total_rows", 0)
    try:
        from extensions import redis_client
        if redis_client:
            redis_client.set("plotark:current_noise", str(noise))
    except Exception:
        pass
    return jsonify(result)


@xapi_bp.route("/api/xapi/seed-history", methods=["POST"])
def seed_history():
    """
    Insert before/after analysis snapshots into course_analysis_snapshots for all courses.
    By default clears and reseeds all snapshots (force=true).
    Pass ?force=false to only seed courses that have <2 snapshots.
    """
    from services.xapi_generator import seed_history_snapshots
    force = request.args.get("force", "true").lower() != "false"
    result = seed_history_snapshots(force=force)
    return jsonify(result)


@xapi_bp.route("/api/xapi/reseed-all", methods=["POST"])
def reseed_all_courses():
    """
    Reseed xAPI + feedback for every course individually, respecting each course's
    current change_log (applied curriculum changes get improved distributions).
    Runs in a background thread — returns immediately.
    """
    import threading
    from services.xapi_generator import reseed_course
    from db import get_db as _get_db
    noise = float(request.args.get("noise", 0.08))

    def _run():
        conn = _get_db()
        if not conn:
            return
        try:
            cur = conn.cursor()
            cur.execute("SELECT id FROM curricula ORDER BY id")
            ids = [r[0] for r in cur.fetchall()]
            cur.close()
            conn.close()
        except Exception as e:
            conn.close()
            print(f"[reseed-all] Failed to fetch course IDs: {e}")
            return
        for cid in ids:
            reseed_course(cid, noise)

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return jsonify({"status": "reseeding", "message": "All courses are being reseeded in the background."})


@xapi_bp.route("/api/xapi/stats", methods=["GET"])
def xapi_stats():
    """Quick stats on xAPI data in the database."""
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM xapi_statements")
        total = cur.fetchone()[0]
        cur.execute("SELECT COUNT(DISTINCT actor_email) FROM xapi_statements")
        unique_students = cur.fetchone()[0]
        cur.execute("SELECT COUNT(DISTINCT curriculum_topic) FROM xapi_statements")
        unique_courses = cur.fetchone()[0]
        cur.execute("SELECT verb, COUNT(*) FROM xapi_statements GROUP BY verb ORDER BY COUNT(*) DESC")
        verb_counts = {r[0]: r[1] for r in cur.fetchall()}
        cur.close()
        conn.close()
        return jsonify({
            "total_statements": total,
            "unique_students": unique_students,
            "unique_courses": unique_courses,
            "verb_distribution": verb_counts,
        })
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


# ── Auto-seed on startup ─────────────────────────────────────────────────────

def seed_mock_xapi():
    """Seed xAPI data if table is empty. Uses new dynamic generator."""
    conn = get_db()
    if not conn:
        return
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM xapi_statements")
    count = cur.fetchone()[0]
    cur.close()
    conn.close()

    if count > 0:
        print(f"xAPI table already has {count} statements, skipping xAPI seed.")
        # Still seed feedback if that table is empty
        from services.xapi_generator import seed_all_feedback
        conn2 = get_db()
        if conn2:
            cur2 = conn2.cursor()
            cur2.execute("SELECT COUNT(*) FROM student_feedback WHERE student_id LIKE 'seed_%'")
            fb_count = cur2.fetchone()[0]
            cur2.close()
            conn2.close()
            if fb_count == 0:
                print("Feedback table empty — seeding feedback data...")
                fb_result = seed_all_feedback()
                print(f"Feedback seed complete: {fb_result.get('total_rows', 0)} rows.")
        return

    print("Seeding xAPI mock data for all courses (8% noise)...")
    from services.xapi_generator import generate_all_courses, seed_all_feedback
    result = generate_all_courses(noise_ratio=0.08)
    print(f"xAPI seed complete: {result.get('total_statements', 0)} statements across {result.get('courses_processed', 0)} courses.")
    fb_result = seed_all_feedback()
    print(f"Feedback seed complete: {fb_result.get('total_rows', 0)} rows.")
