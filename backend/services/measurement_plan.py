"""Measurement plans for Enterprise L&D program versions.

A plan records, before launch, what evidence will show whether a program
worked. Plans are versioned per program, editable while ``draft`` and frozen
once ``approved``. This module is pure (no DB/Flask) so it is easy to test;
the routes and the LTM writer call into it.
"""

from __future__ import annotations

import copy

STATUS_DRAFT = "draft"
STATUS_APPROVED = "approved"

# Kirkpatrick levels: 1 reaction, 2 learning, 3 behavior, 4 results.
EVALUATION_LEVELS = (1, 2, 3, 4)

# Planned evidence sources and the enterprise_sources.source_kind values that
# count as collected evidence for each. "lms_report" is what the upload
# endpoint stores today; the other kinds are accepted so future ingestion of
# pulse / follow-up / metric data satisfies the plan without changes here.
EVIDENCE_SOURCES = {
    "lms_export": ("lms_report",),
    "learner_pulse": ("learner_pulse",),
    "manager_followup": ("manager_followup",),
    "business_metric": ("business_metric",),
}

_TEXT_FIELDS = ("intended_behavior_change", "timing", "reviewer")


def empty_plan() -> dict:
    return {
        "intended_behavior_change": "",
        "evaluation_levels": [],
        "evidence_sources": [],
        "timing": "",
        "reviewer": "",
    }


def normalize_plan(raw: dict | None) -> dict:
    """Validate and normalize user input into the stored plan shape.

    Raises ValueError with a user-facing message on invalid input.
    """
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise ValueError("plan must be an object")

    plan = empty_plan()
    for name in _TEXT_FIELDS:
        value = raw.get(name, "")
        if value is None:
            value = ""
        if not isinstance(value, str):
            raise ValueError(f"{name} must be text")
        plan[name] = value.strip()

    levels = raw.get("evaluation_levels", [])
    if not isinstance(levels, list):
        raise ValueError("evaluation_levels must be a list")
    clean_levels = set()
    for level in levels:
        if isinstance(level, bool) or not isinstance(level, int) or level not in EVALUATION_LEVELS:
            raise ValueError("evaluation_levels must contain only 1, 2, 3 or 4")
        clean_levels.add(level)
    plan["evaluation_levels"] = sorted(clean_levels)

    sources = raw.get("evidence_sources", [])
    if not isinstance(sources, list):
        raise ValueError("evidence_sources must be a list")
    clean_sources = []
    for source in sources:
        if source not in EVIDENCE_SOURCES:
            raise ValueError(
                "evidence_sources must be from: " + ", ".join(EVIDENCE_SOURCES)
            )
        if source not in clean_sources:
            clean_sources.append(source)
    plan["evidence_sources"] = clean_sources
    return plan


def can_edit(status: str) -> bool:
    return status == STATUS_DRAFT


def copy_plan_for_new_version(previous_plan: dict | None) -> dict:
    """Start a new version from a copy of the previous plan (or empty)."""
    if not previous_plan:
        return empty_plan()
    return normalize_plan(copy.deepcopy(previous_plan))


def collected_sources(source_kinds) -> list[str]:
    """Map stored enterprise_sources.source_kind values to plan source names."""
    kinds = set(source_kinds or [])
    return [name for name, stored in EVIDENCE_SOURCES.items() if kinds.intersection(stored)]


def compare_plan_to_evidence(plan: dict | None, source_kinds) -> dict:
    """Compare planned evidence sources with what has actually been collected.

    ``gaps`` lists planned sources with no collected evidence. ``unplanned``
    lists evidence that arrived without being planned. With no plan the
    result has ``has_plan: False`` and empty gap lists, so callers can leave
    behavior for plan-less versions untouched.
    """
    if not plan:
        return {"has_plan": False, "planned": [], "collected": [], "gaps": [], "unplanned": []}
    planned = list(plan.get("evidence_sources", []))
    collected = collected_sources(source_kinds)
    return {
        "has_plan": True,
        "planned": planned,
        "collected": [s for s in planned if s in collected],
        "gaps": [s for s in planned if s not in collected],
        "unplanned": [s for s in collected if s not in planned],
    }


def snapshot_frontmatter_lines(plan: dict | None, version: int | None, status: str | None) -> list[str]:
    """Flat scalar frontmatter keys for the LTM snapshot (empty without a plan).

    Kept flat because ``ltm_writer._parse_frontmatter`` is a lightweight
    line parser; the full plan is rendered in the markdown body.
    """
    if not plan:
        return []
    return [
        f"measurement_plan_version: {version}",
        f"measurement_plan_status: {status}",
        "measurement_plan_levels: [" + ", ".join(str(l) for l in plan.get("evaluation_levels", [])) + "]",
        "measurement_plan_sources: [" + ", ".join(plan.get("evidence_sources", [])) + "]",
    ]


def snapshot_markdown_lines(plan: dict | None, version: int | None, status: str | None,
                            source_kinds=None) -> list[str]:
    """Markdown section describing the plan and, if known, its evidence gaps."""
    if not plan:
        return []
    lines = [f"## Measurement Plan (v{version}, {status})", ""]
    lines.append(f"- **Intended behavior change**: {plan.get('intended_behavior_change') or '—'}")
    levels = ", ".join(f"L{l}" for l in plan.get("evaluation_levels", [])) or "—"
    lines.append(f"- **Evaluation levels**: {levels}")
    lines.append(f"- **Planned evidence**: {', '.join(plan.get('evidence_sources', [])) or '—'}")
    lines.append(f"- **Timing**: {plan.get('timing') or '—'}")
    lines.append(f"- **Reviewer**: {plan.get('reviewer') or '—'}")
    if source_kinds is not None:
        comparison = compare_plan_to_evidence(plan, source_kinds)
        lines.append(
            "- **Planned evidence not yet collected**: "
            + (", ".join(comparison["gaps"]) or "none")
        )
    lines.append("")
    return lines
