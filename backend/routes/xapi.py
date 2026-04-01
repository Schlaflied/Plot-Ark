"""xAPI statement routes and analytics."""

import json
import random
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from db import get_db
from config import redis_client

xapi_bp = Blueprint("xapi", __name__)


@xapi_bp.route("/api/xapi/statement", methods=["POST"])
def receive_xapi():
    statement = request.get_json()
    actor = statement.get("actor", {}).get("name", "unknown")
    verb = statement.get("verb", {}).get("display", {}).get("en-US", "unknown")
    obj = statement.get("object", {}).get("definition", {}).get("name", {}).get("en-US", "unknown")
    print(f"xAPI: {actor} {verb} {obj}")
    return {"status": "received"}, 200


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


@xapi_bp.route("/xapi/analytics", methods=["GET"])
def get_xapi_analytics():
    """Return aggregated learner analytics."""
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
        WHERE object_id LIKE 'module/%' AND object_id NOT LIKE 'module/%/%'
        GROUP BY object_id
        ORDER BY object_id
    """)
    modules = [{"module_id": r[0], "completed": r[1], "total": r[2]} for r in cur.fetchall()]

    conn.close()
    return jsonify({"students": students, "struggling_concepts": struggling_concepts, "modules": modules})


def seed_mock_xapi():
    """Seed mock xAPI statements if table is empty."""
    conn = get_db()
    if not conn:
        return
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM xapi_statements")
    count = cur.fetchone()[0]
    if count > 0:
        conn.close()
        return

    statements = [
        ("alice@test.com", "Alice Chen", "completed", "module/1", "Introduction to the Course"),
        ("alice@test.com", "Alice Chen", "passed", "module/1/reading/0", "Week 1 Reading"),
        ("alice@test.com", "Alice Chen", "completed", "module/2", "Core Concepts"),
        ("alice@test.com", "Alice Chen", "attempted", "module/3", "Applied Theory"),
        ("alice@test.com", "Alice Chen", "passed", "module/3/quiz", "Module 3 Quiz"),
        ("bob@test.com", "Bob Kim", "completed", "module/1", "Introduction to the Course"),
        ("bob@test.com", "Bob Kim", "experienced", "module/2/reading/0", "Core Reading"),
        ("bob@test.com", "Bob Kim", "struggled", "module/3", "Applied Theory"),
        ("bob@test.com", "Bob Kim", "struggled", "module/3/concept/theory", "Theoretical Framework"),
        ("bob@test.com", "Bob Kim", "attempted", "module/3/quiz", "Module 3 Quiz"),
        ("carol@test.com", "Carol Singh", "experienced", "module/1", "Introduction to the Course"),
        ("carol@test.com", "Carol Singh", "completed", "module/1", "Introduction to the Course"),
        ("carol@test.com", "Carol Singh", "experienced", "module/2", "Core Concepts"),
        ("carol@test.com", "Carol Singh", "struggled", "module/2/concept/advanced", "Advanced Core Concept"),
        ("david@test.com", "David Park", "completed", "module/1", "Introduction to the Course"),
        ("david@test.com", "David Park", "completed", "module/2", "Core Concepts"),
        ("david@test.com", "David Park", "passed", "module/2/quiz", "Module 2 Quiz"),
        ("david@test.com", "David Park", "attempted", "module/3", "Applied Theory"),
        ("david@test.com", "David Park", "experienced", "module/4", "Case Studies"),
        ("david@test.com", "David Park", "struggled", "module/4/concept/integration", "Integration Concept"),
    ]

    base_time = datetime.now() - timedelta(days=7)
    for i, (email, name, verb, obj_id, obj_name) in enumerate(statements):
        ts = base_time + timedelta(hours=i * 3 + random.randint(0, 2))
        cur.execute(
            "INSERT INTO xapi_statements (actor_email, actor_name, verb, object_id, object_name, timestamp, curriculum_topic) VALUES (%s, %s, %s, %s, %s, %s, %s)",
            (email, name, verb, obj_id, obj_name, ts, "Mock Course")
        )
    conn.commit()
    conn.close()
    print("Mock xAPI statements seeded.")
