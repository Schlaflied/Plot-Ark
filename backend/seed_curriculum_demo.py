"""Seed sample data into module_flags + change_log for ALL courses.

Automatically reads course IDs and module titles from the curricula table.
Seeds both 'pending' (professor notification) and 'applied' (student banner) entries.

Run:  python seed_curriculum_demo.py
"""

import json
import random
from db import get_db


def seed():
    conn = get_db()
    if not conn:
        print("ERROR: Could not connect to DB")
        return

    cur = conn.cursor()

    # ── Discover all courses + modules from curricula table ────────────────
    cur.execute("SELECT id, topic, modules FROM curricula ORDER BY id")
    rows = cur.fetchall()
    if not rows:
        print("No courses found in curricula table.")
        return

    all_courses = {}
    for r in rows:
        course_id = r[0]
        topic = r[1]
        raw_modules = r[2]
        if isinstance(raw_modules, str):
            modules = json.loads(raw_modules)
        elif raw_modules is not None:
            modules = raw_modules
        else:
            modules = []

        module_list = []
        for i, m in enumerate(modules):
            mod_id = f"module_{i + 1}"
            mod_title = m.get("title", f"Module {i + 1}") if isinstance(m, dict) else f"Module {i + 1}"
            module_list.append((mod_id, mod_title))

        if module_list:
            all_courses[course_id] = {"topic": topic, "modules": module_list}

    print(f"Found {len(all_courses)} courses with modules.\n")

    # ── Clear old demo data ────────────────────────────────────────────────
    cur.execute("DELETE FROM module_flags")
    cur.execute("DELETE FROM change_log")

    recommendation_templates = [
        "Consider reducing the complexity level of this module. Students are spending {time}x the expected time, suggesting the content may be too dense for this stage of the course.",
        "Add an introductory reading or video before the current materials. {pct}% of students are struggling with foundational concepts that this module assumes as prerequisites.",
        "Break the current assessment into two smaller checkpoints. The all-or-nothing structure is causing a {pct}% failure rate, which could be reduced with incremental evaluation.",
        "Supplement the academic reading with a practical case study or news article. Student engagement data shows a significant drop-off during the theoretical sections.",
        "Consider adding a peer discussion activity before the main assignment. Modules with collaborative pre-work show 23% higher completion rates in comparable courses.",
        "The current reading load ({count} sources) exceeds the recommended maximum for this complexity level. Consider marking {remove} source(s) as optional.",
    ]

    for course_id, info in all_courses.items():
        modules = info["modules"]
        topic = info["topic"]
        print(f"[Course {course_id}] {topic} ({len(modules)} modules)")

        # ── Seed module_flags (pick 2-3 modules per course) ────────────────
        flag_count = min(random.randint(2, 3), len(modules))
        flagged = random.sample(modules, flag_count)

        for mod_id, mod_name in flagged:
            flag_level = random.choice(["yellow", "orange"])
            signals = []

            if random.random() > 0.35:
                signals.append({
                    "source": "content_optimizer",
                    "detail": f"{mod_name} has a high struggle rate ({random.randint(28, 52)}%) — students are spending significantly more time than expected.",
                    "metric": "struggle_rate",
                    "value": round(random.uniform(0.28, 0.52), 2),
                })
            if random.random() > 0.45:
                signals.append({
                    "source": "risk_detector",
                    "detail": f"{random.randint(25, 45)}% of students are at-risk in {mod_name}, concentrated around assessment tasks.",
                    "metric": "at_risk_pct",
                    "value": round(random.uniform(0.25, 0.45), 2),
                })
            if random.random() > 0.55:
                signals.append({
                    "source": "behavior_analyst",
                    "detail": f"Low completion rate ({random.randint(35, 55)}%) detected in {mod_name} — many students drop off before the reading section.",
                    "metric": "completion_rate",
                    "value": round(random.uniform(0.35, 0.55), 2),
                })

            if not signals:
                signals.append({
                    "source": "content_optimizer",
                    "detail": f"Multiple negative feedback signals received for {mod_name}.",
                    "metric": "negative_feedback",
                    "value": random.randint(3, 7),
                })

            cur.execute("""
                INSERT INTO module_flags (course_id, module_id, flag_level, signals, dismissed)
                VALUES (%s, %s, %s, %s, FALSE)
            """, (course_id, mod_id, flag_level, json.dumps(signals)))

            print(f"  [FLAG] {mod_id} ({mod_name})  level={flag_level}  signals={len(signals)}")

        # ── Seed change_log (2 pending + 1 applied per course) ─────────────
        for idx, (mod_id, mod_name) in enumerate(flagged[:3]):
            template = random.choice(recommendation_templates)
            recommendation = template.format(
                time=round(random.uniform(2.1, 3.8), 1),
                pct=random.randint(28, 48),
                count=random.randint(3, 6),
                remove=random.randint(1, 2),
            )

            flag_reasons = random.sample([
                "high_struggle_rate", "at_risk_concentration",
                "low_completion_rate", "negative_feedback",
                "time_on_task_anomaly",
            ], random.randint(1, 3))

            # First entry per course → applied (for student banner)
            # Rest → pending (for professor notification)
            status = "applied" if idx == 0 else "pending"

            # For applied entries, store original module as backup so Redo works
            backup_data = None
            if status == "applied":
                mod_idx = int(mod_id.replace("module_", "")) - 1
                cur.execute("SELECT modules FROM curricula WHERE id = %s", (course_id,))
                curr_row = cur.fetchone()
                if curr_row:
                    curr_modules = curr_row[0]
                    if isinstance(curr_modules, str):
                        curr_modules = json.loads(curr_modules)
                    if curr_modules and 0 <= mod_idx < len(curr_modules):
                        backup_data = json.dumps(curr_modules[mod_idx])

            cur.execute("""
                INSERT INTO change_log (course_id, module_id, flag_reason, recommendation, agent, status, backup_data)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                str(course_id),
                mod_id,
                flag_reasons,
                recommendation,
                "curriculum_agent",
                status,
                backup_data,
            ))

            print(f"  [CHANGE_LOG] {mod_id}  status={status}  reasons={flag_reasons}{' (with backup)' if backup_data else ''}")

        print()

    conn.commit()
    cur.close()
    conn.close()
    print("✅ Demo data seeded for ALL courses!")


if __name__ == "__main__":
    seed()
