"""Student diagnosis engine — template-driven, warm-toned feedback.

Reads cohort_concept_mastery + module_flags for a given course and generates
a one-sentence diagnosis with actionable suggestions.

RED-LINE COMPLIANCE:
  R1 — No numerical scores exposed to student
  R5 — Wording uses "might help" / "could try" / "you're making progress"
"""

import random
from db import get_db


# ─── Warm wording templates ───────────────────────────────────────────────────

_STRUGGLING_OPENERS = [
    "It looks like {concept_area} might need a bit more attention.",
    "Some concepts in {concept_area} seem tricky — that's totally normal!",
    "{concept_area} can be challenging. A quick review might help.",
    "You're making progress, but {concept_area} could use another look.",
]

_LEARNING_OPENERS = [
    "You're getting there with {concept_area} — keep it up!",
    "{concept_area} is coming along. A bit more practice could solidify things.",
    "Nice progress on {concept_area}! Revisiting a few points might help.",
]

_SUGGESTION_TEMPLATES = [
    "Try re-reading the key sections in {module_title} — sometimes a second pass clicks.",
    "The concepts in {module_title} build on each other; reviewing the basics first might help.",
    "Consider looking at {module_title} from a different angle — try the analogies or examples.",
    "If {module_title} feels dense, break it into smaller chunks over a few sessions.",
    "The practice questions in {module_title} are a great way to test your understanding.",
]

_ALL_GOOD = [
    "You're doing great across all modules — keep up the momentum!",
    "Everything looks solid so far. Keep exploring and stay curious!",
    "Nice work! Your progress across this course is looking strong.",
]


# ─── Core diagnosis function ─────────────────────────────────────────────────

def generate_diagnosis(course_id: int, email: str = "") -> dict:
    """Generate a one-sentence diagnosis for a student in a specific course.

    Returns:
        {
            "has_diagnosis": bool,
            "message": str,           # warm main message
            "suggestions": list[str], # 1-2 actionable tips
            "related_modules": list[dict],  # [{module_id, module_title}]
            "tone": "encouragement" | "gentle_nudge" | "none"
        }
    """
    conn = get_db()
    if not conn:
        return _no_diagnosis()

    try:
        cur = conn.cursor()

        # ── 1. Get module titles from curricula ──────────────────────────
        cur.execute("SELECT modules FROM curricula WHERE id = %s", (course_id,))
        row = cur.fetchone()
        if not row or not row[0]:
            cur.close()
            conn.close()
            return _no_diagnosis()

        raw_modules = row[0]
        if isinstance(raw_modules, str):
            import json
            raw_modules = json.loads(raw_modules)

        module_titles = {}
        for i, m in enumerate(raw_modules):
            mod_id = f"module_{i + 1}"
            title = m.get("title", f"Module {i + 1}") if isinstance(m, dict) else f"Module {i + 1}"
            module_titles[mod_id] = title

        # ── 2. Get mastery data ──────────────────────────────────────────
        cur.execute("""
            SELECT module_id, concept_label, mastery_level,
                   struggled_count, failed_count, completed_count
            FROM cohort_concept_mastery
            WHERE course_id = %s
            ORDER BY module_id
        """, (course_id,))
        mastery_rows = cur.fetchall()

        # ── 3. Get flagged modules (from module_flags) ───────────────────
        cur.execute("""
            SELECT module_id, flag_level
            FROM module_flags
            WHERE course_id = %s AND NOT dismissed
        """, (course_id,))
        flag_rows = cur.fetchall()
        flagged_modules = {r[0]: r[1] for r in flag_rows}

        cur.close()
        conn.close()

        if not mastery_rows:
            return _no_diagnosis()

        # ── 4. Aggregate per-module struggle score ───────────────────────
        module_scores = {}  # module_id → { struggling, learning, total }
        for mod_id, concept, level, struggled, failed, completed in mastery_rows:
            if mod_id not in module_scores:
                module_scores[mod_id] = {"struggling": 0, "learning": 0, "mastered": 0, "total": 0, "concepts": []}
            module_scores[mod_id]["total"] += 1
            if level == "struggling":
                module_scores[mod_id]["struggling"] += 1
                module_scores[mod_id]["concepts"].append(concept)
            elif level == "learning":
                module_scores[mod_id]["learning"] += 1
            elif level == "mastered":
                module_scores[mod_id]["mastered"] += 1

        # ── 5. Find the weakest module(s) ────────────────────────────────
        # Priority: flagged + high struggle count
        scored = []
        for mod_id, data in module_scores.items():
            if data["total"] == 0:
                continue
            struggle_ratio = data["struggling"] / data["total"]
            learning_ratio = data["learning"] / data["total"]
            # Boost score if module is also flagged by the analytics engine
            flag_boost = 0.3 if mod_id in flagged_modules else 0
            score = struggle_ratio * 2 + learning_ratio * 0.5 + flag_boost
            scored.append({
                "module_id": mod_id,
                "title": module_titles.get(mod_id, mod_id),
                "score": score,
                "struggle_ratio": struggle_ratio,
                "learning_ratio": learning_ratio,
                "concepts": data["concepts"][:3],  # top 3 struggling concepts
                "is_flagged": mod_id in flagged_modules,
            })

        scored.sort(key=lambda x: x["score"], reverse=True)

        if not scored:
            return _no_diagnosis()

        top = scored[0]

        # ── 6. Generate message based on severity ────────────────────────

        # All good — no module has significant struggle
        if top["score"] < 0.15:
            return {
                "has_diagnosis": True,
                "message": random.choice(_ALL_GOOD),
                "suggestions": [],
                "related_modules": [],
                "tone": "encouragement",
            }

        # Determine concept area description
        if top["concepts"]:
            concept_area = _format_concept_list(top["concepts"])
        else:
            concept_area = top["title"]

        # Pick appropriate opener based on severity
        if top["struggle_ratio"] > 0.3:
            message = random.choice(_STRUGGLING_OPENERS).format(concept_area=concept_area)
            tone = "gentle_nudge"
        else:
            message = random.choice(_LEARNING_OPENERS).format(concept_area=concept_area)
            tone = "encouragement"

        # Generate 1-2 suggestions
        suggestions = []
        suggestions.append(
            random.choice(_SUGGESTION_TEMPLATES).format(module_title=top["title"])
        )
        # If there's a second weak module, add a hint
        if len(scored) > 1 and scored[1]["score"] > 0.2:
            second = scored[1]
            suggestions.append(
                f"After that, {second['title']} could also use a quick review."
            )

        related = [{"module_id": top["module_id"], "module_title": top["title"]}]
        if len(scored) > 1 and scored[1]["score"] > 0.2:
            related.append({"module_id": scored[1]["module_id"], "module_title": scored[1]["title"]})

        return {
            "has_diagnosis": True,
            "message": message,
            "suggestions": suggestions,
            "related_modules": related,
            "tone": tone,
        }

    except Exception as e:
        print(f"[diagnosis] Error generating diagnosis: {e}")
        if conn:
            conn.close()
        return _no_diagnosis()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _no_diagnosis() -> dict:
    return {
        "has_diagnosis": False,
        "message": "",
        "suggestions": [],
        "related_modules": [],
        "tone": "none",
    }


def _format_concept_list(concepts: list[str]) -> str:
    """Format a list of concept labels into readable text, max 2."""
    # Clean up labels
    cleaned = [c.strip().title() if len(c) < 40 else c.strip()[:37] + "..." for c in concepts if c]
    if not cleaned:
        return "some concepts"
    if len(cleaned) == 1:
        return cleaned[0]
    return f"{cleaned[0]} and {cleaned[1]}"
