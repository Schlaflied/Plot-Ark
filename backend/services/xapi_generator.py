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

# Improved verb distributions for modules that have been curriculum-optimized.
# Key change: struggling students do better (less struggle/fail, more complete/pass).
# High performers and average students see marginal improvement.
# Disengaged students are slightly more engaged.
IMPROVED_VERB_DIST = {
    "high_performer": {
        "experienced": 0.15, "attempted": 0.03, "completed": 0.40,
        "passed": 0.30, "failed": 0.01, "struggled": 0.01,
        "interacted": 0.06, "asked": 0.04,
    },
    "average": {
        "experienced": 0.18, "attempted": 0.08, "completed": 0.30,
        "passed": 0.22, "failed": 0.02, "struggled": 0.04,
        "interacted": 0.10, "asked": 0.06,
    },
    "struggling": {
        "experienced": 0.20, "attempted": 0.12, "completed": 0.22,
        "passed": 0.15, "failed": 0.05, "struggled": 0.08,
        "interacted": 0.10, "asked": 0.08,
    },
    "disengaged": {
        "experienced": 0.35, "attempted": 0.15, "completed": 0.15,
        "passed": 0.08, "failed": 0.02, "struggled": 0.03,
        "interacted": 0.17, "asked": 0.05,
    },
}

# ── Level → student count mapping ────────────────────────────────────────────
LEVEL_STUDENT_COUNTS = {
    # Large intro courses
    "undergraduate-year-1": (300, 400),
    "esl-beginner": (200, 300),
    "k12-elementary": (150, 250),
    "k12-middle": (150, 250),
    "k12-highschool": (150, 250),
    "professional-beginner": (100, 200),
    # Medium courses
    "undergraduate-year-2": (150, 250),
    "undergraduate-year-3": (80, 150),
    "esl-intermediate": (80, 150),
    "professional-intermediate": (60, 120),
    # Small advanced courses
    "undergraduate-year-4": (40, 80),
    "master-year-1": (80, 120),
    "master-year-2": (30, 60),
    "doctoral": (10, 25),
    "esl-advanced": (40, 80),
    "professional-advanced": (30, 60),
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


def _get_applied_module_ids(course_id: int) -> set[str]:
    """Query change_log for modules that have been curriculum-optimized.
    Returns a set of module_id strings like {'module_1', 'module_6'}."""
    try:
        conn = get_db()
        if not conn:
            print(f"  [xAPI] No DB connection for applied modules check")
            return set()
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT module_id FROM change_log
            WHERE course_id = %s AND status = 'applied'
        """, (str(course_id),))
        ids = {row[0] for row in cur.fetchall()}
        cur.close()
        conn.close()
        if ids:
            print(f"  [xAPI] Course {course_id}: found applied modules: {ids}")
        else:
            print(f"  [xAPI] Course {course_id}: no applied changes in change_log")
        return ids
    except Exception as e:
        print(f"  [xAPI] Error checking applied modules: {e}")
        return set()


def _pick_verb(profile: str, improved: bool = False) -> str:
    """Choose a verb based on profile distribution.
    If improved=True, use the post-curriculum-change distributions."""
    dist_table = IMPROVED_VERB_DIST if improved else VERB_DIST
    dist = dist_table[profile]
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
    days_span: int = 42,
    improved_module_indices: set[int] | None = None,
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
    # Students enter at different points in the course based on their profile
    # High performers start early, disengaged students start late or drop in randomly
    profile_start_ranges = {
        "high_performer": (0, 7),
        "average": (3, 21),
        "struggling": (7, 35),
        "disengaged": (14, 42),
    }
    lo, hi = profile_start_ranges.get(profile, (0, 42))
    start_day = random.uniform(lo, hi)

    # Realistic hour-of-day: weighted toward 9am-11pm (index = hour 0-23)
    HOUR_WEIGHTS = [1,1,1,1,1,1,2,3,5,8,9,9,8,7,8,9,8,7,6,5,4,3,2,1]
    start_hour = random.choices(range(24), weights=HOUR_WEIGHTS)[0]
    time_cursor = base_time + timedelta(days=start_day, hours=start_hour, minutes=random.randint(0, 59))

    for mod_idx in range(modules_reached):
        if mod_idx not in objects_by_module:
            continue

        # Jump forward by 1-5 days between modules (simulate weekly/bi-weekly pacing)
        if mod_idx > 0:
            days_between = random.uniform(1, 5)
            next_hour = random.choices(range(24), weights=HOUR_WEIGHTS)[0]
            time_cursor = time_cursor + timedelta(days=days_between, hours=next_hour - time_cursor.hour, minutes=random.randint(0, 59))

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

        # Check if this module has been curriculum-optimized
        is_improved = improved_module_indices and mod_idx in improved_module_indices

        for _ in range(num_interactions):
            obj = random.choice(mod_objects)
            verb = _pick_verb(profile, improved=is_improved)

            # Apply logical constraints
            if obj["object_type"] == "assessment":
                if is_improved:
                    # Post-optimization: struggling students pass more often
                    if profile == "high_performer":
                        verb = random.choices(["passed", "attempted", "failed"], weights=[0.75, 0.18, 0.07])[0]
                    elif profile == "struggling":
                        verb = random.choices(["failed", "attempted", "passed"], weights=[0.30, 0.35, 0.35])[0]
                    else:
                        verb = random.choices(["passed", "attempted", "failed"], weights=[0.5, 0.3, 0.2])[0]
                else:
                    verb = random.choice(["attempted", "passed", "failed"])
                    if profile == "high_performer":
                        verb = random.choices(["passed", "attempted", "failed"], weights=[0.7, 0.2, 0.1])[0]
                    elif profile == "struggling":
                        verb = random.choices(["failed", "attempted", "passed"], weights=[0.5, 0.3, 0.2])[0]
            elif obj["object_type"] == "concept":
                if is_improved:
                    # Post-optimization: less struggle with concepts
                    verb = random.choices(
                        ["struggled", "experienced", "interacted"],
                        weights=[0.25, 0.45, 0.30]
                    )[0]
                else:
                    verb = random.choices(
                        ["struggled", "experienced", "interacted"],
                        weights=[0.5, 0.3, 0.2]
                    )[0]

            ts = time_cursor + timedelta(
                minutes=random.randint(5, 90),
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

    If modules have been curriculum-optimized (via Apply in curriculum agent),
    the generator produces improved verb distributions for those modules,
    simulating the real-world effect of better course design.

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

    # ── Check which modules have been curriculum-optimized ────────────────
    applied_ids = _get_applied_module_ids(course_id)
    improved_indices: set[int] = set()
    if applied_ids:
        # Convert module_id ("module_3") → module_index (2)
        for mid in applied_ids:
            match = mid.replace("module_", "")
            try:
                idx = int(match) - 1  # module_1 → index 0
                if 0 <= idx < num_modules:
                    improved_indices.add(idx)
            except ValueError:
                pass
        if improved_indices:
            names = [modules[i].get('title', f'Module {i+1}') for i in improved_indices]
            print(f"  📈 Course {course_id}: {len(improved_indices)} module(s) optimized → improved data for: {', '.join(names)}")

    # Base time: 42 days ago
    base_time = datetime.now() - timedelta(days=42)

    # Generate statements for each student
    all_statements = []
    for student in students:
        stmts = _generate_statements_for_student(
            student, objects, course_id, topic, num_modules, base_time,
            improved_module_indices=improved_indices if improved_indices else None,
        )
        all_statements.extend(stmts)

    # Inject noise
    all_statements = _inject_noise(all_statements, noise_ratio)

    # Shuffle to mix everything up
    random.shuffle(all_statements)

    return all_statements


# ── Feedback seed helpers ─────────────────────────────────────────────────────

# Module type → (got-it, mostly, off/confused, not-read) weight lists
_FB_PRE = {
    "engaging":         [0.38, 0.34, 0.17, 0.11],
    "challenging":      [0.18, 0.28, 0.37, 0.17],
    "dry":              [0.22, 0.28, 0.22, 0.28],
    "assessment_heavy": [0.28, 0.34, 0.27, 0.11],
}
_FB_POST = {
    "engaging":         [0.54, 0.32, 0.11, 0.03],
    "challenging":      [0.34, 0.38, 0.22, 0.06],
    "dry":              [0.44, 0.37, 0.14, 0.05],
    "assessment_heavy": [0.44, 0.38, 0.14, 0.04],
}
_MODULE_TYPES = list(_FB_PRE.keys())

_COMMENTS = {
    "got-it":   [
        "Very clear and well-structured!",
        "Great examples, understood immediately.",
        "Excellent pacing — loved this module.",
        "This was the clearest explanation I've seen.",
        "Well done. Everything clicked.",
    ],
    "mostly":   [
        "Mostly clear but the last section needs more detail.",
        "Good content — a couple of concepts still fuzzy.",
        "Almost there. More examples would help.",
        "Pretty good overall, minor gaps in explanation.",
    ],
    "off":      [
        "The pacing is too fast for a beginner.",
        "Needs more examples and worked problems.",
        "Confusing — not sure what I'm supposed to take away.",
        "The diagrams don't match the text explanations.",
        "Too much jargon without definitions.",
    ],
    "not-read": [
        "Didn't have time this week.",
        "Skimmed through — will revisit.",
        "Couldn't find the reading material.",
    ],
}

_SENTIMENT_KEYS = ["got-it", "mostly", "off", "not-read"]


def seed_feedback_for_course(
    course_id: int,
    modules: list,
    total_students: int,
    applied_module_indices: set,
) -> int:
    """
    Generate and insert mock student_feedback rows for one course.

    Each module gets:
    - A randomly-seeded "difficulty type" (engaging/challenging/dry/assessment_heavy)
    - A participation rate (30-60% pre-opt, 45-70% post-opt)
    - Sentiment distribution that reflects pre vs post curriculum optimization
    - A small fraction of text comments (~8% of respondents)

    Returns the number of rows inserted.
    """
    conn = get_db()
    if not conn:
        return 0

    rng = random.Random(course_id * 7919)  # deterministic per course
    rows = []

    for mod_idx, mod in enumerate(modules):
        mod_title = mod.get("title", f"Module {mod_idx + 1}")
        is_improved = mod_idx in applied_module_indices

        # Pick a module difficulty type (seeded, so stable across runs)
        mod_type = rng.choice(_MODULE_TYPES)

        # Participation rate
        if is_improved:
            participation = rng.uniform(0.45, 0.70)
        else:
            participation = rng.uniform(0.28, 0.58)

        num_respondents = max(1, int(total_students * participation))

        # Sentiment weights for this module
        weights = _FB_POST[mod_type] if is_improved else _FB_PRE[mod_type]

        # Add per-module noise so no two modules look identical
        noisy_weights = [max(0.01, w + rng.uniform(-0.05, 0.05)) for w in weights]
        total_w = sum(noisy_weights)
        noisy_weights = [w / total_w for w in noisy_weights]

        sentiments = rng.choices(_SENTIMENT_KEYS, weights=noisy_weights, k=num_respondents)

        for i, sentiment in enumerate(sentiments):
            student_id = f"seed_{course_id}_{mod_idx}_{i}"
            # ~8% of respondents leave a comment
            comment = ""
            if rng.random() < 0.08:
                comment = rng.choice(_COMMENTS[sentiment])
            rows.append((course_id, mod_idx, mod_title, sentiment, comment, student_id))

    if not rows:
        conn.close()
        return 0

    try:
        cur = conn.cursor()
        cur.executemany(
            """INSERT INTO student_feedback
               (course_id, module_index, module_title, sentiment, comment, student_id)
               VALUES (%s, %s, %s, %s, %s, %s)""",
            rows,
        )
        conn.commit()
        cur.close()
        conn.close()
        return len(rows)
    except Exception as e:
        print(f"  [feedback seed] Error for course {course_id}: {e}")
        conn.close()
        return 0


def reseed_course(course_id: int, noise_ratio: float = 0.08) -> dict:
    """
    Delete and regenerate xAPI statements + student feedback for a single course.

    Called automatically after a curriculum agent suggestion is applied or undone,
    so the analytics data reflects the current optimization state.

    Returns a stats dict.
    """
    conn = get_db()
    if not conn:
        return {"error": "Database unavailable"}

    # ── 1. Fetch course data ───────────────────────────────────────────────
    try:
        cur = conn.cursor()
        cur.execute("SELECT topic, level, modules FROM curricula WHERE id = %s", (course_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
    except Exception as e:
        conn.close()
        return {"error": str(e)}

    if not row:
        return {"error": f"Course {course_id} not found"}

    topic, level, modules_json = row
    modules = modules_json if isinstance(modules_json, list) else json.loads(modules_json or "[]")
    if not modules:
        return {"error": "No modules found"}

    # ── 2. Delete existing data for this course ────────────────────────────
    conn2 = get_db()
    if not conn2:
        return {"error": "Database unavailable for delete"}
    try:
        cur2 = conn2.cursor()
        cur2.execute(
            "DELETE FROM xapi_statements WHERE object_id LIKE %s",
            (f"course/{course_id}/%",),
        )
        cur2.execute(
            "DELETE FROM student_feedback WHERE course_id = %s AND student_id LIKE 'seed_%%'",
            (course_id,),
        )
        conn2.commit()
        cur2.close()
        conn2.close()
        print(f"  [reseed] Cleared xAPI + feedback for course {course_id}")
    except Exception as e:
        conn2.close()
        return {"error": f"Delete failed: {e}"}

    # ── 3. Regenerate xAPI statements ──────────────────────────────────────
    course_data = {"topic": topic, "level": level or "other-custom", "modules": modules}
    statements = generate_for_course(course_id, course_data, noise_ratio)

    if statements:
        conn3 = get_db()
        if conn3:
            try:
                cur3 = conn3.cursor()
                cur3.executemany(
                    """INSERT INTO xapi_statements
                       (actor_email, actor_name, verb, object_id, object_name, timestamp, curriculum_topic)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    statements,
                )
                conn3.commit()
                cur3.close()
                conn3.close()
            except Exception as e:
                conn3.close()
                return {"error": f"xAPI insert failed: {e}"}

    # ── 4. Regenerate feedback ─────────────────────────────────────────────
    student_count = _get_student_count(level or "other-custom")
    applied_ids = _get_applied_module_ids(course_id)
    improved: set[int] = set()
    for mid in applied_ids:
        try:
            improved.add(int(mid.replace("module_", "")) - 1)
        except ValueError:
            pass

    fb_rows = seed_feedback_for_course(course_id, modules, student_count, improved)

    print(
        f"  [reseed] Course {course_id} ({topic}): "
        f"{len(statements)} xAPI statements, {fb_rows} feedback rows"
    )
    return {
        "course_id": course_id,
        "topic": topic,
        "xapi_statements": len(statements),
        "feedback_rows": fb_rows,
        "optimized_modules": list(improved),
    }


def seed_all_feedback(noise_ratio: float = 0.08) -> dict:
    """
    Seed student_feedback for all courses.
    Uses the same student-count logic as the xAPI generator.
    Applied module indices are read from change_log.
    """
    conn = get_db()
    if not conn:
        return {"error": "Database unavailable", "total_rows": 0}

    try:
        cur = conn.cursor()
        cur.execute("SELECT id, topic, level, modules FROM curricula ORDER BY id")
        courses = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        conn.close()
        return {"error": str(e), "total_rows": 0}

    total = 0
    for cid, topic, level, modules_json in courses:
        modules = modules_json if isinstance(modules_json, list) else json.loads(modules_json or "[]")
        if not modules:
            continue
        student_count = _get_student_count(level or "other-custom")
        applied_ids = _get_applied_module_ids(cid)
        improved: set[int] = set()
        for mid in applied_ids:
            try:
                improved.add(int(mid.replace("module_", "")) - 1)
            except ValueError:
                pass
        inserted = seed_feedback_for_course(cid, modules, student_count, improved)
        total += inserted
        print(f"  ✓ Feedback course {cid} ({topic}): {inserted} rows")

    return {"total_rows": total}


def _compute_course_metrics(course_id: int, conn) -> dict | None:
    """
    Compute real analysis metrics for a course from xAPI + feedback data.
    Returns a dict suitable for inserting into course_analysis_snapshots, or None on failure.
    """
    cur = conn.cursor()
    prefix = f"course/{course_id}/%"
    mod_prefix = f"course/{course_id}/module/%"

    # Total unique students
    cur.execute(
        "SELECT COUNT(DISTINCT actor_email) FROM xapi_statements WHERE object_id LIKE %s",
        (prefix,)
    )
    total = cur.fetchone()[0] or 0
    if total == 0:
        cur.close()
        return None

    # Verb distribution
    cur.execute(
        "SELECT verb, COUNT(*) FROM xapi_statements WHERE object_id LIKE %s GROUP BY verb",
        (prefix,)
    )
    verb_dist = {r[0]: r[1] for r in cur.fetchall()}

    # Module engagement summary
    cur.execute("""
        SELECT object_id, object_name,
               COUNT(DISTINCT actor_email) FILTER (WHERE verb IN ('completed','passed')) as comps,
               COUNT(DISTINCT actor_email) as total_interacted
        FROM xapi_statements
        WHERE object_id LIKE %s AND object_id NOT LIKE %s
        GROUP BY object_id, object_name
        ORDER BY object_id
    """, (mod_prefix, f"course/{course_id}/module/%/%"))
    mod_rows = cur.fetchall()
    mod_summary = []
    for r in mod_rows:
        comp_rate = round(min(r[2] / max(r[3], 1), 1.0), 3)
        mod_summary.append({"name": r[1] or r[0], "completion_rate": comp_rate})

    # At-risk calculation matching risk_detector logic:
    # use attempt_base (mastered+failed+attempted) denominator, not raw total
    cur.execute("""
        SELECT actor_email,
               COUNT(*) FILTER (WHERE verb IN ('completed','passed')) as mastered,
               COUNT(*) FILTER (WHERE verb = 'failed') as failed,
               COUNT(*) FILTER (WHERE verb = 'attempted') as attempted,
               COUNT(*) FILTER (WHERE verb = 'struggled') as struggled,
               COUNT(*) as total_actions
        FROM xapi_statements WHERE object_id LIKE %s
        GROUP BY actor_email
    """, (prefix,))
    at_risk = 0
    high_risk = 0
    low_risk = 0
    medium_risk = 0
    for r in cur.fetchall():
        mastered, failed, attempted, struggled, total_actions = r[1], r[2], r[3], r[4], r[5]
        attempt_base = mastered + failed + attempted
        comp_rate = mastered / max(attempt_base, 1) if attempt_base > 0 else 0.5
        struggle_rate = struggled / max(total_actions, 1)

        risk_score = 0
        if struggle_rate > 0.40:
            risk_score += 3
        elif struggle_rate > 0.20:
            risk_score += 1
        if comp_rate < 0.10:
            risk_score += 3
        elif comp_rate < 0.25:
            risk_score += 1
        if failed > 2:
            risk_score += 2

        if risk_score >= 7:
            at_risk += 1
            high_risk += 1
        elif risk_score >= 4:
            at_risk += 1
            medium_risk += 1
        else:
            low_risk += 1

    # Cap at-risk to realistic demo range (max 35% of cohort)
    # The xAPI mock data has elevated struggle rates; without real inactivity data
    # the calculator over-counts — hard-cap keeps TrendChart readable.
    cap = max(1, int(total * 0.35))
    if at_risk > cap:
        excess = at_risk - cap
        # Move excess from at-risk into low-risk
        at_risk = cap
        high_risk = min(high_risk, cap)
        medium_risk = at_risk - high_risk
        low_risk += excess

    cur.close()
    return {
        "total": total,
        "at_risk": at_risk,
        "high_risk": high_risk,
        "risk_dist": {"low": low_risk, "medium": medium_risk, "high": high_risk},
        "verb_dist": verb_dist,
        "mod_summary": mod_summary,
    }


def seed_history_snapshots(force: bool = True) -> dict:
    """
    Insert before + after analysis snapshots into course_analysis_snapshots for all courses.

    With force=True (default): clears all existing seeded snapshots first, then inserts fresh ones.

    Strategy for ALL courses (all have applied changes):
      - Snapshot 1 (~14 days ago, "baseline_pre_change"):
          * at_risk_pct:  20–30% of total (absolute range, not derived)
          * avg completion per module: applied modules 22–42%, others 42–62%
      - Snapshot 2 (~2 days ago, "post_curriculum_change"):
          * Uses real current metrics from xapi_statements
          * at_risk and completion reflect actual improved xAPI data

    Courses without applied changes get natural-drift 3-snapshot treatment.
    """
    import json as _json
    from datetime import datetime, timedelta

    conn = get_db()
    if not conn:
        return {"error": "Database unavailable"}

    try:
        cur = conn.cursor()
        cur.execute("SELECT id, level FROM curricula ORDER BY id")
        courses = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        conn.close()
        return {"error": str(e)}

    inserted = 0
    deleted_total = 0
    rng = random.Random(20260410)

    for cid, level in courses:
        conn2 = get_db()
        if not conn2:
            continue
        try:
            cur2 = conn2.cursor()

            if force:
                # Clear seeded snapshots (keep real analysis runs which have noise_label
                # matching the agent pipeline patterns: 'noise8pct', real runs have NULL or
                # numeric labels).  We clear everything and reseed cleanly.
                cur2.execute(
                    "DELETE FROM course_analysis_snapshots WHERE course_id = %s",
                    (cid,)
                )
                deleted_total += cur2.rowcount
            else:
                cur2.execute(
                    "SELECT COUNT(*) FROM course_analysis_snapshots WHERE course_id = %s",
                    (cid,)
                )
                existing_count = cur2.fetchone()[0]
                if existing_count >= 2:
                    cur2.close()
                    conn2.close()
                    print(f"  [history seed] Course {cid}: already has {existing_count} snapshots, skipping")
                    continue

            metrics = _compute_course_metrics(cid, conn2)
            if not metrics:
                cur2.close()
                conn2.close()
                print(f"  [history seed] Course {cid}: no xAPI data, skipping")
                continue

            applied_ids = _get_applied_module_ids(cid)
            has_applied = len(applied_ids) > 0

            now = datetime.now()
            total = metrics["total"]

            if has_applied:
                # ── "Before" snapshot: absolute ranges so differences are always visible ──
                # at_risk: 20–30% of cohort (clearly elevated)
                before_at_risk_pct = rng.uniform(0.20, 0.30)
                before_at_risk = max(1, round(total * before_at_risk_pct))
                before_high = max(0, round(before_at_risk * rng.uniform(0.35, 0.50)))
                before_med = max(0, round(before_at_risk * rng.uniform(0.30, 0.40)))
                before_low = max(0, total - before_at_risk)

                # Per-module completion: applied modules bad (22–42%), others moderate (42–62%)
                before_mod_summary = []
                for idx, m in enumerate(metrics["mod_summary"]):
                    is_applied = any(
                        str(idx) == mid.replace("module_", "").strip() or
                        str(idx + 1) == mid.replace("module_", "").strip()
                        for mid in applied_ids
                    )
                    if is_applied:
                        comp = round(rng.uniform(0.22, 0.42), 3)
                    else:
                        comp = round(rng.uniform(0.42, 0.62), 3)
                    before_mod_summary.append({"name": m["name"], "completion_rate": comp})

                # Before verb dist: inflate struggle/fail, deflate completed/passed
                before_verbs = dict(metrics["verb_dist"])
                before_verbs["struggled"] = int(before_verbs.get("struggled", 0) * rng.uniform(1.5, 1.8))
                before_verbs["failed"] = int(before_verbs.get("failed", 0) * rng.uniform(1.4, 1.7))
                before_verbs["completed"] = int(before_verbs.get("completed", 0) * rng.uniform(0.50, 0.65))
                before_verbs["passed"] = int(before_verbs.get("passed", 0) * rng.uniform(0.45, 0.60))

                # ── "After" snapshot: real current metrics (already improved by IMPROVED_VERB_DIST) ──
                # Ensure after at_risk_pct is clearly lower than before
                after_at_risk = metrics["at_risk"]
                after_at_risk_pct = after_at_risk / max(total, 1)
                # If after is somehow still high (edge case), cap it below before
                if after_at_risk_pct >= before_at_risk_pct - 0.05:
                    after_at_risk = max(1, round(total * rng.uniform(0.06, 0.14)))

                snapshots_to_insert = [
                    {
                        "run_at": now - timedelta(days=rng.uniform(12, 16)),
                        "total": total,
                        "at_risk": before_at_risk,
                        "high_risk": before_high,
                        "risk_dist": {"low": before_low, "medium": before_med, "high": before_high},
                        "mod_summary": before_mod_summary,
                        "verb_dist": before_verbs,
                        "noise_label": "baseline_pre_change",
                    },
                    {
                        "run_at": now - timedelta(days=rng.uniform(0.5, 2)),
                        "total": total,
                        "at_risk": after_at_risk,
                        "high_risk": metrics["high_risk"],
                        "risk_dist": metrics["risk_dist"],
                        "mod_summary": metrics["mod_summary"],
                        "verb_dist": metrics["verb_dist"],
                        "noise_label": "post_curriculum_change",
                    },
                ]
            else:
                # ── No applied changes: natural drift (3 snapshots) ──
                def _jitter(val, lo, hi):
                    return round(max(0.05, min(1.0, val * rng.uniform(lo, hi))), 3)

                s1_mod = [{"name": m["name"], "completion_rate": _jitter(m["completion_rate"], 0.80, 0.90)} for m in metrics["mod_summary"]]
                s2_mod = [{"name": m["name"], "completion_rate": _jitter(m["completion_rate"], 0.90, 0.97)} for m in metrics["mod_summary"]]

                s1_at_risk = min(max(1, round(total * rng.uniform(0.14, 0.22))), total)
                s2_at_risk = min(max(1, round(total * rng.uniform(0.10, 0.16))), total)

                snapshots_to_insert = [
                    {
                        "run_at": now - timedelta(days=rng.uniform(13, 17)),
                        "total": total,
                        "at_risk": s1_at_risk,
                        "high_risk": max(0, round(s1_at_risk * 0.4)),
                        "risk_dist": {"low": max(0, total - s1_at_risk), "medium": max(0, round(s1_at_risk * 0.6)), "high": max(0, round(s1_at_risk * 0.4))},
                        "mod_summary": s1_mod,
                        "verb_dist": metrics["verb_dist"],
                        "noise_label": "15pct",
                    },
                    {
                        "run_at": now - timedelta(days=rng.uniform(6, 9)),
                        "total": total,
                        "at_risk": s2_at_risk,
                        "high_risk": max(0, round(s2_at_risk * 0.38)),
                        "risk_dist": {"low": max(0, total - s2_at_risk), "medium": max(0, round(s2_at_risk * 0.62)), "high": max(0, round(s2_at_risk * 0.38))},
                        "mod_summary": s2_mod,
                        "verb_dist": metrics["verb_dist"],
                        "noise_label": "10pct",
                    },
                    {
                        "run_at": now - timedelta(days=rng.uniform(0.3, 1.5)),
                        "total": total,
                        "at_risk": metrics["at_risk"],
                        "high_risk": metrics["high_risk"],
                        "risk_dist": metrics["risk_dist"],
                        "mod_summary": metrics["mod_summary"],
                        "verb_dist": metrics["verb_dist"],
                        "noise_label": "8pct",
                    },
                ]

            for snap in snapshots_to_insert:
                cur2.execute("""
                    INSERT INTO course_analysis_snapshots
                        (course_id, run_at, risk_distribution, total_students, at_risk_count,
                         high_risk_count, top_signals, module_engagement_summary,
                         verb_distribution, cohort_groups, noise_label)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    cid,
                    snap["run_at"],
                    _json.dumps(snap["risk_dist"]),
                    snap["total"],
                    snap["at_risk"],
                    snap["high_risk"],
                    _json.dumps([]),
                    _json.dumps(snap["mod_summary"]),
                    _json.dumps(snap["verb_dist"]),
                    _json.dumps({}),
                    snap["noise_label"],
                ))
                inserted += 1

            conn2.commit()
            cur2.close()
            conn2.close()
            print(f"  [history seed] Course {cid} ({'applied' if has_applied else 'no-change'}): inserted {len(snapshots_to_insert)} snapshots")

        except Exception as e:
            try:
                conn2.rollback()
                conn2.close()
            except Exception:
                pass
            print(f"  [history seed] Error for course {cid}: {e}")
            import traceback
            traceback.print_exc()

    return {"snapshots_inserted": inserted, "snapshots_deleted": deleted_total}


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
