"""Assessment design analysis (advisory only).

Classifies assessment items by the kind of thinking they require and proposes
alternatives for items that mainly test recall. This changes assessment design
only: it does not monitor students and does not detect AI use.

The analysis is invoked by ContentOptimizerNode; instructor decisions are
stored in change_log (change_type='assessment_design') so they flow into the
same LTM snapshots as other recommendations.
"""

import re

THINKING_TYPES = ("recall", "application", "analysis", "reflection")

_THINKING_CUES = {
    "reflection": [
        "reflect", "journal", "your own experience", "your experience",
        "your own practice", "personal", "what did you learn", "self-assess",
        "lessons learned", "your perspective",
    ],
    "analysis": [
        "analy", "compare", "contrast", "evaluate", "critique", "justify", "argue",
        "differentiate", "examine", "distinguish", "debate", "why does",
    ],
    "application": [
        "apply", "design", "build", "develop", "solve", "implement", "create",
        "case study", "simulate", "scenario", "project", "prototype",
        "demonstrate", "real-world", "in your workplace", "propose",
    ],
    "recall": [
        "define", "list", "state", "identify", "recall", "name the", "label",
        "multiple choice", "multiple-choice", "true/false", "true or false",
        "fill in the blank", "short answer", "short-answer", "quiz", "memoriz",
        "what is", "who was", "when did", "match the",
    ],
}

# Format cues are strong recall signals on their own, so they count double.
_RECALL_FORMAT_CUES = ("multiple choice", "multiple-choice", "true/false", "true or false",
                       "fill in the blank", "match the", "quiz")

_WORD_RE = re.compile(r"[a-z]{4,}")


def classify_assessment_item(item: dict) -> dict:
    """Classify one item. Returns {"thinking_type", "reason", "confidence"}.

    Higher-order cues win ties, so an item is only called recall when recall
    evidence dominates (or nothing else is found, with low confidence).
    """
    title = (item.get("title") or item.get("name") or "").strip()
    desc = (item.get("task_description") or item.get("description") or "").strip()
    text = f"{title} {desc}".lower()

    hits = {t: [c for c in cues if c in text] for t, cues in _THINKING_CUES.items()}
    scores = {t: len(h) for t, h in hits.items()}
    scores["recall"] += sum(1 for c in _RECALL_FORMAT_CUES if c in text)

    if not any(scores.values()):
        return {
            "thinking_type": "recall",
            "reason": "No analysis, application or reflection cues found in the item wording; "
                      "treated as recall by default.",
            "confidence": "low",
        }

    best = max(scores.values())
    chosen = next(t for t in ("reflection", "analysis", "application", "recall") if scores[t] == best)
    cues = ", ".join(f'"{c}"' for c in hits[chosen][:3]) or "format cues"
    reasons = {
        "recall": f"Wording asks students to retrieve or restate known information ({cues}).",
        "application": f"Wording asks students to use concepts in a task or scenario ({cues}).",
        "analysis": f"Wording asks students to break down, compare or judge ideas ({cues}).",
        "reflection": f"Wording asks students to connect the material to their own experience ({cues}).",
    }
    return {
        "thinking_type": chosen,
        "reason": reasons[chosen],
        "confidence": "high" if best >= 2 else "medium",
    }


def _best_objective(item: dict, objectives: list) -> str:
    """Pick the learning objective sharing the most words with the item."""
    if not objectives:
        return ""
    text = f"{item.get('title') or ''} {item.get('task_description') or ''}".lower()
    words = set(_WORD_RE.findall(text))
    overlaps = [len(words & set(_WORD_RE.findall(str(o).lower()))) for o in objectives]
    return str(objectives[overlaps.index(max(overlaps))])


def suggest_alternatives(item: dict, objective: str) -> list:
    """Propose alternatives for a recall-only item, each tied to the objective."""
    title = item.get("title") or item.get("name") or "this assessment"
    goal = objective or "the module's learning objectives"
    return [
        {
            "kind": "reflection_prompt",
            "suggestion": f'Replace "{title}" with a short written reflection connecting the '
                          "concepts to a situation the student has actually faced.",
            "rationale": f"Reflection asks for personal interpretation, which supports: {goal}",
        },
        {
            "kind": "application_task",
            "suggestion": f'Turn "{title}" into a scenario-based task where students apply the '
                          "concepts to a realistic case and justify their choices.",
            "rationale": f"Applying ideas to a case shows whether students can use them: {goal}",
        },
        {
            "kind": "scaffolded_submission",
            "suggestion": f'Split "{title}" into staged submissions (outline, draft, final) '
                          "with feedback between stages.",
            "rationale": f"Staged work makes the reasoning visible and supports: {goal}",
        },
        {
            "kind": "oral_component",
            "suggestion": f'Add a brief oral check-in to "{title}" where students explain and '
                          "defend their answers to the instructor.",
            "rationale": f"Talking through an answer shows understanding of: {goal}",
        },
    ]


def analyze_assessment_design(modules) -> dict:
    """Classify every assessment item and propose alternatives for recall-only ones.

    `modules` is the curricula.modules list; items live in each module's "assignments".
    A course with no assessments yields empty lists and zeroed counts.
    """
    items, suggestions = [], []
    for m_idx, mod in enumerate(modules if isinstance(modules, list) else []):
        if not isinstance(mod, dict):
            continue
        module_id = f"module_{m_idx + 1}"
        module_name = mod.get("title") or mod.get("name") or module_id
        objectives = mod.get("learning_objectives") or []
        for a_idx, a in enumerate(mod.get("assignments") or []):
            if not isinstance(a, dict):
                continue
            cls = classify_assessment_item(a)
            objective = _best_objective(a, objectives)
            title = a.get("title") or a.get("name") or f"Assessment {a_idx + 1}"
            flagged = cls["thinking_type"] == "recall"
            items.append({
                "module_id": module_id,
                "module_name": module_name,
                "item_index": a_idx,
                "item_title": title,
                "objective": objective,
                **cls,
                "flagged": flagged,
            })
            if flagged:
                suggestions.append({
                    "module_id": module_id,
                    "item_index": a_idx,
                    "item_title": title,
                    "classification": cls["thinking_type"],
                    "reason": cls["reason"],
                    "objective": objective,
                    "alternatives": suggest_alternatives(a, objective),
                })

    by_type = {t: sum(1 for i in items if i["thinking_type"] == t) for t in THINKING_TYPES}
    return {
        "items": items,
        "suggestions": suggestions,
        "summary": {"total_items": len(items), "recall_flagged": len(suggestions), "by_type": by_type},
    }
