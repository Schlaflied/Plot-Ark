"""
Dynamic xAPI mock data generator.

Reads real course data from the curricula table, assigns virtual students with
behavioural profiles, generates realistic learning-record sequences per module,
and injects configurable noise (default 15%).
"""

import json
import random
import hashlib
from datetime import datetime, timedelta

from db import get_db

# ── Student pool ──────────────────────────────────────────────────────────────
FIRST_NAMES = [
    "Alice", "Bob", "Carol", "David", "Eve", "Frank", "Grace", "Henry",
    "Irene", "Jack", "Karen", "Leo", "Mia", "Noah", "Olivia", "Paul",
    "Quinn", "Rosa", "Sam", "Tina", "Uma", "Victor", "Wendy", "Xavier",
    "Yuki", "Zara", "Amir", "Bianca", "Chen", "Diego", "Elena", "Faisal",
    "Gina", "Hiro", "Ines", "Jorge", "Keiko", "Liam", "Mei", "Nadia",
    "Oscar", "Priya", "Raj", "Sofia", "Tariq", "Ursula", "Vlad", "Wanda",
    "Xiao", "Yara",
]
LAST_NAMES = [
    "Chen", "Kim", "Singh", "Park", "Garcia", "Mueller", "Tanaka", "Johnson",
    "Williams", "Brown", "Davis", "Miller", "Wilson", "Taylor", "Anderson",
    "Lee", "Wang", "Liu", "Nguyen", "Martinez", "Thompson", "White", "Harris",
    "Clark", "Lewis", "Robinson", "Walker", "Hall", "Young", "Allen",
    "King", "Wright", "Lopez", "Hill", "Scott", "Green", "Adams", "Baker",
    "Nelson", "Carter", "Mitchell", "Perez", "Roberts", "Turner", "Phillips",
    "Campbell", "Evans", "Edwards", "Collins", "Stewart",
]

PROFILES = ["high_performer", "average", "struggling", "disengaged"]
PROFILE_WEIGHTS = [0.25, 0.40, 0.25, 0.10]  # distribution

VERBS = [
    "experienced",   # viewed / accessed
    "attempted",     # tried
    "completed",     # finished
    "passed",        # passed assessment
    "failed",        # failed assessment
    "struggled",     # had difficulty
    "interacted",    # general interaction
    "asked",         # asked a question
]

# Verb distributions per profile (probabilities)
VERB_DIST = {
    "high_performer": {
        "experienced": 0.20, "attempted": 0.05, "completed": 0.35,
        "passed": 0.25, "failed": 0.02, "struggled": 0.03,
        "interacted": 0.07, "asked": 0.03,
    },
    "average": {
        "experienced": 0.25, "attempted": 0.15, "completed": 0.20,
        "passed": 0.12, "failed": 0.05, "struggled": 0.10,
        "interacted": 0.08, "asked": 0.05,
    },
    "struggling": {
        "experienced": 0.30, "attempted": 0.10, "completed": 0.08,
        "passed": 0.03, "failed": 0.12, "struggled": 0.25,
        "interacted": 0.05, "asked": 0.07,
    },
    "disengaged": {
        "experienced": 0.50, "attempted": 0.15, "completed": 0.05,
        "passed": 0.02, "failed": 0.03, "struggled": 0.05,
        "interacted": 0.15, "asked": 0.05,
    },
}

# ── Level → student count mapping ────────────────────────────────────────────
LEVEL_STUDENT_COUNTS = {
    # Large intro courses
    "undergraduate-year-1": (30, 50),
    "esl-beginner": (25, 40),
    "k12-elementary": (25, 35),
    "k12-middle": (25, 35),
    "k12-highschool": (25, 35),
    "professional-beginner": (20, 35),
    # Medium courses
    "undergraduate-year-2": (20, 35),
    "undergraduate-year-3": (15, 25),
    "esl-intermediate": (15, 25),
    "professional-intermediate": (15, 25),
    # Small advanced courses
    "undergraduate-year-4": (10, 18),
    "master-year-1": (10, 18),
    "master-year-2": (8, 15),
    "doctoral": (5, 12),
    "esl-advanced": (10, 18),
    "professional-advanced": (8, 15),
    "other-custom": (10, 20),
}


def _get_student_count(level: str) -> int:
    """Return a random student count based on course level."""
    lo, hi = LEVEL_STUDENT_COUNTS.get(level, (10, 20))
    return random.randint(lo, hi)


def _generate_students(count: int, course_id: int) -> list[dict]:
    """Generate a list of virtual students with profiles."""
    # Use course_id as part of seed for reproducible-ish but varied pools
    rng = random.Random(course_id * 1000 + count)
    students = []
    used_names = set()
    for i in range(count):
        # Generate unique name
        attempts = 0
        while attempts < 100:
            first = rng.choice(FIRST_NAMES)
            last = rng.choice(LAST_NAMES)
            full = f"{first} {last}"
            if full not in used_names:
                used_names.add(full)
                break
            attempts += 1
        email = f"{first.lower()}.{last.lower()}@plotark.edu"
        profile = rng.choices(PROFILES, weights=PROFILE_WEIGHTS, k=1)[0]
        students.append({
            "name": full,
            "email": email,
            "profile": profile,
        })
    return students


def _pick_verb(profile: str) -> str:
    """Choose a verb based on profile distribution."""
    dist = VERB_DIST[profile]
    return random.choices(list(dist.keys()), weights=list(dist.values()), k=1)[0]


def _extract_objects(modules: list, course_id: int, topic: str) -> list[dict]:
    """
    Extract xAPI objects from a course's module list.
    Returns a flat list of {object_id, object_name, object_type} dicts.
    """
    objects = []
    for i, mod in enumerate(modules):
        title = mod.get("title", f"Module {i + 1}")
        mod_id = f"course/{course_id}/module/{i}"
        objects.append({
            "object_id": mod_id,
            "object_name": title,
            "object_type": "module",
            "module_index": i,
        })

        # Extract readings
        readings = mod.get("readings", []) or mod.get("required_readings", [])
        if isinstance(readings, list):
            for j, reading in enumerate(readings):
                r_title = reading if isinstance(reading, str) else reading.get("title", f"Reading {j+1}")
                # Truncate if needed
                if len(r_title) > 80:
                    r_title = r_title[:77] + "..."
                objects.append({
                    "object_id": f"{mod_id}/reading/{j}",
                    "object_name": r_title,
                    "object_type": "reading",
                    "module_index": i,
                })

        # Extract assignments / assessments
        assessments = mod.get("assessments", []) or mod.get("assessment", [])
        if isinstance(assessments, list):
            for j, assess in enumerate(assessments):
                a_title = assess if isinstance(assess, str) else assess.get("title", assess.get("name", f"Assessment {j+1}"))
                if isinstance(a_title, str) and len(a_title) > 80:
                    a_title = a_title[:77] + "..."
                objects.append({
                    "object_id": f"{mod_id}/assessment/{j}",
                    "object_name": a_title if isinstance(a_title, str) else f"Assessment {j+1}",
                    "object_type": "assessment",
                    "module_index": i,
                })
        elif isinstance(assessments, str) and assessments:
            objects.append({
                "object_id": f"{mod_id}/assessment/0",
                "object_name": assessments[:80],
                "object_type": "assessment",
                "module_index": i,
            })

        # Extract learning objectives as "concepts" for struggled verbs
        objectives = mod.get("learning_objectives", []) or mod.get("objectives", [])
        if isinstance(objectives, list):
            for j, obj in enumerate(objectives):
                obj_text = obj if isinstance(obj, str) else str(obj)
                # Create short concept name from objective
                concept_name = obj_text[:60] + "..." if len(obj_text) > 60 else obj_text
                objects.append({
                    "object_id": f"{mod_id}/concept/{j}",
                    "object_name": concept_name,
                    "object_type": "concept",
                    "module_index": i,
                })

    return objects


def _generate_statements_for_student(
    student: dict,
    objects: list[dict],
    course_id: int,
    topic: str,
    num_modules: int,
    base_time: datetime,
    days_span: int = 14,
) -> list[tuple]:
    """Generate a sequence of xAPI statements for one student."""
    profile = student["profile"]
    statements = []

    # Determine how many modules this student interacts with
    if profile == "high_performer":
        modules_reached = num_modules
    elif profile == "average":
        modules_reached = max(1, int(num_modules * random.uniform(0.5, 0.85)))
    elif profile == "struggling":
        modules_reached = max(1, int(num_modules * random.uniform(0.3, 0.6)))
    else:  # disengaged
        modules_reached = max(1, int(num_modules * random.uniform(0.1, 0.3)))

    # Group objects by module_index
    objects_by_module = {}
    for obj in objects:
        mi = obj["module_index"]
        if mi not in objects_by_module:
            objects_by_module[mi] = []
        objects_by_module[mi].append(obj)

    # Generate learning path
    time_cursor = base_time + timedelta(hours=random.uniform(0, 48))
    for mod_idx in range(modules_reached):
        if mod_idx not in objects_by_module:
            continue
        mod_objects = objects_by_module[mod_idx]

        # Number of interactions per module varies by profile
        if profile == "high_performer":
            num_interactions = random.randint(3, 6)
        elif profile == "average":
            num_interactions = random.randint(2, 4)
        elif profile == "struggling":
            num_interactions = random.randint(2, 5)
        else:
            num_interactions = random.randint(1, 2)

        for _ in range(num_interactions):
            obj = random.choice(mod_objects)
            verb = _pick_verb(profile)

            # Apply logical constraints
            if obj["object_type"] == "assessment":
                verb = random.choice(["attempted", "passed", "failed"])
                if profile == "high_performer":
                    verb = random.choices(["passed", "attempted", "failed"], weights=[0.7, 0.2, 0.1])[0]
                elif profile == "struggling":
                    verb = random.choices(["failed", "attempted", "passed"], weights=[0.5, 0.3, 0.2])[0]
            elif obj["object_type"] == "concept":
                verb = random.choices(
                    ["struggled", "experienced", "interacted"],
                    weights=[0.5, 0.3, 0.2]
                )[0]

            ts = time_cursor + timedelta(
                minutes=random.randint(5, 180),
                seconds=random.randint(0, 59),
            )
            time_cursor = ts

            statements.append((
                student["email"],
                student["name"],
                verb,
                obj["object_id"],
                obj["object_name"],
                ts,
                topic,
            ))

    return statements


def _inject_noise(statements: list[tuple], noise_ratio: float = 0.08) -> list[tuple]:
    """
    Inject noise into the statement list (irreversible, no denoising).
    Types of noise:
    - Time anomalies: activity at 2-5 AM
    - Speed anomalies: completing a reading in 5 seconds
    - Repetition: same module viewed 10 times
    - Future timestamps: activity dated in the future
    """
    noise_count = max(1, int(len(statements) * noise_ratio))
    noisy = list(statements)

    for _ in range(noise_count):
        noise_type = random.choice([
            "time_anomaly",
            "speed_anomaly",
            "repetition",
            "future_timestamp",
        ])

        if not noisy:
            break

        idx = random.randint(0, len(noisy) - 1)
        email, name, verb, obj_id, obj_name, ts, topic = noisy[idx]

        if noise_type == "time_anomaly":
            # Activity at 2-5 AM
            weird_hour = random.randint(2, 4)
            new_ts = ts.replace(hour=weird_hour, minute=random.randint(0, 59))
            noisy.append((email, name, verb, obj_id, obj_name, new_ts, topic))

        elif noise_type == "speed_anomaly":
            # Complete something impossibly fast — add a "completed" right after "experienced"
            fast_ts = ts + timedelta(seconds=random.randint(3, 10))
            noisy.append((email, name, "completed", obj_id, obj_name, fast_ts, topic))

        elif noise_type == "repetition":
            # Same action repeated 3-5 times (reduced from 3-8)
            for rep in range(random.randint(3, 5)):
                rep_ts = ts + timedelta(minutes=rep * random.randint(1, 5))
                noisy.append((email, name, "experienced", obj_id, obj_name, rep_ts, topic))

        elif noise_type == "future_timestamp":
            # Timestamp in the future
            future_ts = datetime.now() + timedelta(days=random.randint(1, 30))
            noisy.append((email, name, verb, obj_id, obj_name, future_ts, topic))

    # Ghost students — very few, and they get 2-3 interactions (not 0-1)
    # so they don't automatically trigger low-volume risk signals.
    ghost_count = max(1, int(noise_count * 0.05))
    _ghost_rng = random.Random(len(statements) + 42)  # deterministic sub-seed
    for g in range(ghost_count):
        ghost_first = _ghost_rng.choice(FIRST_NAMES)
        ghost_last = _ghost_rng.choice(LAST_NAMES)
        ghost_name = f"{ghost_first} {ghost_last}"
        ghost_email = f"{ghost_first.lower()}.{ghost_last.lower()}.g{g}@plotark.edu"
        # Give ghost students 2-3 interactions so they aren't instant high-risk
        if noisy:
            for _ in range(random.randint(2, 3)):
                ref = noisy[random.randint(0, len(noisy) - 1)]
                ghost_verb = random.choice(["experienced", "attempted", "interacted"])
                noisy.append((
                    ghost_email, ghost_name, ghost_verb,
                    ref[3], ref[4],
                    ref[5] + timedelta(hours=random.randint(1, 72)),
                    ref[6],
                ))

    return noisy


def generate_for_course(course_id: int, course_data: dict, noise_ratio: float = 0.08) -> list[tuple]:
    """
    Generate xAPI mock statements for a single course.

    Args:
        course_id: DB id of the course
        course_data: dict with keys: topic, level, modules (list)
        noise_ratio: fraction of noise to inject (default 15%)

    Returns:
        list of tuples: (email, name, verb, object_id, object_name, timestamp, curriculum_topic)
    """
    topic = course_data.get("topic", "Unknown Course")
    level = course_data.get("level", "other-custom")
    modules = course_data.get("modules", [])

    if not modules:
        return []

    num_modules = len(modules)
    student_count = _get_student_count(level)
    students = _generate_students(student_count, course_id)

    # Extract xAPI objects from real module data
    objects = _extract_objects(modules, course_id, topic)
    if not objects:
        return []

    # Base time: 14 days ago
    base_time = datetime.now() - timedelta(days=14)

    # Generate statements for each student
    all_statements = []
    for student in students:
        stmts = _generate_statements_for_student(
            student, objects, course_id, topic, num_modules, base_time
        )
        all_statements.extend(stmts)

    # Inject noise
    all_statements = _inject_noise(all_statements, noise_ratio)

    # Shuffle to mix everything up
    random.shuffle(all_statements)

    return all_statements


def generate_all_courses(noise_ratio: float = 0.08) -> dict:
    """
    Generate xAPI mock data for ALL courses in the database.

    Returns:
        dict with stats: {total_statements, courses_processed, per_course: [...]}
    """
    conn = get_db()
    if not conn:
        return {"error": "Database unavailable", "total_statements": 0}

    try:
        cur = conn.cursor()
        cur.execute("SELECT id, topic, level, modules FROM curricula ORDER BY id")
        courses = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        conn.close()
        return {"error": str(e), "total_statements": 0}

    if not courses:
        return {"error": "No courses found in database", "total_statements": 0}

    total = 0
    per_course = []

    for cid, topic, level, modules_json in courses:
        modules = modules_json if isinstance(modules_json, list) else json.loads(modules_json or "[]")
        course_data = {"topic": topic, "level": level or "other-custom", "modules": modules}

        statements = generate_for_course(cid, course_data, noise_ratio)
        count = len(statements)

        if count > 0:
            # Batch insert
            conn = get_db()
            if conn:
                try:
                    cur = conn.cursor()
                    # Use executemany for efficiency
                    insert_sql = """
                        INSERT INTO xapi_statements
                        (actor_email, actor_name, verb, object_id, object_name, timestamp, curriculum_topic)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """
                    cur.executemany(insert_sql, statements)
                    conn.commit()
                    cur.close()
                    conn.close()
                    total += count
                except Exception as e:
                    print(f"Error inserting xAPI for course {cid}: {e}")
                    conn.close()

        per_course.append({
            "course_id": cid,
            "topic": topic,
            "level": level,
            "students": _get_student_count(level or "other-custom"),
            "statements": count,
        })
        print(f"  ✓ Course {cid} ({topic}): {count} statements")

    return {
        "total_statements": total,
        "courses_processed": len(courses),
        "noise_ratio": noise_ratio,
        "per_course": per_course,
    }
