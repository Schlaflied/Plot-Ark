"""Mastery Tracker — derives per-concept mastery from feedback + xAPI data.

Given a course's KG mapping (module → concepts) and student signals
(four-button feedback + xAPI verbs), computes a mastery level for each
KG concept and persists it to `cohort_concept_mastery`.

Mastery levels:
  - mastered:    feedback="got_it"  OR xAPI verb in (passed, completed)
  - learning:    feedback="mostly"  OR xAPI verb="attempted"
  - struggling:  feedback="off"    OR xAPI verb in (struggled, failed)
  - not_started: no data (default)
"""

import json
import re
from datetime import datetime
from db import get_db


# ── Mastery derivation logic ────────────────────────────────────────────────

VERB_MASTERY = {
    "passed":     "mastered",
    "completed":  "mastered",
    "attempted":  "learning",
    "experienced": "learning",
    "interacted": "learning",
    "asked":      "learning",
    "struggled":  "struggling",
    "failed":     "struggling",
}

FEEDBACK_MASTERY = {
    "got_it":   "mastered",
    "mostly":   "learning",
    "off":      "struggling",
    "not_read": "not_started",
}

# Priority: mastered > learning > struggling > not_started
MASTERY_PRIORITY = {
    "mastered": 3,
    "learning": 2,
    "struggling": 1,
    "not_started": 0,
}


def _best_mastery(a: str, b: str) -> str:
    """Return whichever mastery level is higher priority."""
    return a if MASTERY_PRIORITY.get(a, 0) >= MASTERY_PRIORITY.get(b, 0) else b


def compute_module_mastery(course_id: int, semester: str = "") -> dict:
    """Compute per-module mastery from xAPI verbs and feedback.

    Returns: {module_id: mastery_level}
    """
    conn = get_db()
    if not conn:
        return {}

    module_mastery: dict[str, str] = {}

    try:
        cur = conn.cursor()

        # 1. Aggregate xAPI verbs per module
        cur.execute("""
            SELECT object_id, verb, COUNT(*) as cnt
            FROM xapi_statements
            WHERE course_id = %s
            GROUP BY object_id, verb
        """, (course_id,))

        module_verb_counts: dict[str, dict[str, int]] = {}
        for row in cur.fetchall():
            obj_id, verb, cnt = row[0], row[1], row[2]
            # Normalize to "module_N" (1-based): xAPI stores "course/X/module/N" (0-indexed path)
            m = re.search(r'module/(\d+)', obj_id)
            if m:
                obj_id = f"module_{int(m.group(1)) + 1}"
            elif not obj_id.startswith('module_'):
                continue  # skip non-module xAPI statements
            if obj_id not in module_verb_counts:
                module_verb_counts[obj_id] = {}
            module_verb_counts[obj_id][verb] = module_verb_counts[obj_id].get(verb, 0) + int(cnt)

        # Derive mastery from verb distribution
        for mod_id, verbs in module_verb_counts.items():
            total = sum(verbs.values())
            if total == 0:
                continue

            # Use dominant verb pattern
            positive = verbs.get("passed", 0) + verbs.get("completed", 0)
            negative = verbs.get("struggled", 0) + verbs.get("failed", 0)

            if positive > negative * 2:
                module_mastery[mod_id] = "mastered"
            elif positive > negative:
                module_mastery[mod_id] = "learning"
            elif negative > 0:
                module_mastery[mod_id] = "struggling"

        # 2. Overlay feedback (feedback is more direct signal, takes priority)
        cur.execute("""
            SELECT module_index, sentiment, COUNT(*) as cnt
            FROM student_feedback
            WHERE course_id = %s
            GROUP BY module_index, sentiment
            ORDER BY module_index
        """, (course_id,))

        module_feedback: dict[str, dict[str, int]] = {}
        for row in cur.fetchall():
            # Convert 0-based module_index (from UI) to 1-based "module_N" to match kg_mapping keys
            mod_key = f"module_{row[0] + 1}"
            if mod_key not in module_feedback:
                module_feedback[mod_key] = {}
            module_feedback[mod_key][row[1]] = row[2]

        for mod_id, sentiments in module_feedback.items():
            total = sum(sentiments.values())
            if total == 0:
                continue

            # Normalize: frontend sends 'got-it'/'not-read' (hyphens), handle both forms
            got_it = sentiments.get("got_it", 0) + sentiments.get("got-it", 0)
            mostly = sentiments.get("mostly", 0)
            off = sentiments.get("off", 0)

            # Majority vote from feedback
            if got_it >= mostly and got_it >= off:
                fb_level = "mastered"
            elif mostly >= off:
                fb_level = "learning"
            else:
                fb_level = "struggling"

            # Feedback overrides or combines with xAPI
            existing = module_mastery.get(mod_id, "not_started")
            module_mastery[mod_id] = _best_mastery(existing, fb_level)

        cur.close()
        conn.close()
    except Exception as e:
        print(f"[MasteryTracker] Error computing module mastery: {e}")
        try:
            conn.close()
        except Exception:
            pass

    return module_mastery


def sync_concept_mastery(course_id: int, kg_mapping: dict, semester: str = ""):
    """Write concept-level mastery to DB.

    Args:
        course_id: The course ID.
        kg_mapping: Output of kg_mapper.get_course_kg_mapping() —
                    {"module_concepts": {mod_num: [concepts]}, ...}
        semester: Semester label.
    """
    module_mastery = compute_module_mastery(course_id, semester)
    module_concepts = kg_mapping.get("module_concepts", {})

    conn = get_db()
    if not conn:
        return

    try:
        cur = conn.cursor()
        now = datetime.utcnow()

        for mod_num, concepts in module_concepts.items():
            mod_id = f"module_{mod_num}"
            mastery = module_mastery.get(mod_id, "not_started")

            for concept in concepts:
                concept_id = concept.get("id", "")
                concept_label = concept.get("label", "")
                if not concept_id:
                    continue

                # Upsert: update if exists, insert if not
                cur.execute("""
                    INSERT INTO cohort_concept_mastery
                        (course_id, semester, module_id, concept_id, concept_label,
                         mastery_level, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (course_id, semester, module_id, concept_id, valid_from)
                    DO UPDATE SET
                        mastery_level = EXCLUDED.mastery_level,
                        concept_label = EXCLUDED.concept_label,
                        updated_at = EXCLUDED.updated_at
                """, (course_id, semester, mod_id, concept_id, concept_label,
                      mastery, now))

        conn.commit()
        cur.close()
        conn.close()
        print(f"[MasteryTracker] Synced concept mastery for course {course_id}")
    except Exception as e:
        print(f"[MasteryTracker] Error syncing: {e}")
        try:
            conn.close()
        except Exception:
            pass


def get_concept_mastery_map(course_id: int, semester: str = "") -> dict[str, str]:
    """Return {concept_id: mastery_level} for current valid records.

    Used by frontend to overlay mastery colors on KG nodes.
    """
    conn = get_db()
    if not conn:
        return {}

    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT concept_id, concept_label, mastery_level
            FROM cohort_concept_mastery
            WHERE course_id = %s AND valid_to IS NULL
            ORDER BY updated_at DESC
        """, (course_id,))

        result: dict[str, str] = {}
        for row in cur.fetchall():
            cid, label, level = row
            # A concept can appear across multiple modules; keep highest mastery level
            if MASTERY_PRIORITY.get(level, 0) >= MASTERY_PRIORITY.get(result.get(cid, ""), 0):
                result[cid] = level
            if label:
                lk = label.lower()
                if MASTERY_PRIORITY.get(level, 0) >= MASTERY_PRIORITY.get(result.get(lk, ""), 0):
                    result[lk] = level

        cur.close()
        conn.close()
        return result
    except Exception as e:
        print(f"[MasteryTracker] Error reading mastery: {e}")
        try:
            conn.close()
        except Exception:
            pass
        return {}
"""
B2: mastery_tracker.py — derives per-concept mastery from feedback + xAPI.
"""
