"""Evaluation-level summary report for an Enterprise L&D program.

Groups tagged evidence by Kirkpatrick level (reaction, learning, behavior,
results) and states plainly what each level shows, how strong it is and what
is missing. Pure module (no DB/Flask).

Boundaries: describes evidence only. It never claims the program caused a
result, and it reports program-level counts only, never individuals.

NOTE: ``normalize_level`` / ``LEVELS`` are a minimal stand-in for the
evidence-level tagging proposed in issue #13. If #13 lands with its own
schema, reconcile these.
"""

from __future__ import annotations

LEVELS = ("reaction", "learning", "behavior", "results")
LEVEL_LABEL = {
    "reaction": "Level 1 - Reaction",
    "learning": "Level 2 - Learning",
    "behavior": "Level 3 - Behavior",
    "results": "Level 4 - Results",
}

SMALL_SAMPLE_THRESHOLD = 10

FLAG_SMALL_SAMPLE = "small_sample"
FLAG_SINGLE_SOURCE = "single_source"
FLAG_SELF_REPORT_ONLY = "self_report_only"
FLAG_TEXT = {
    FLAG_SMALL_SAMPLE: f"Small sample (fewer than {SMALL_SAMPLE_THRESHOLD} respondents or records).",
    FLAG_SINGLE_SOURCE: "Single source: only one evidence source at this level.",
    FLAG_SELF_REPORT_ONLY: "Self-report only: all evidence at this level is reported by the learners themselves.",
}

# What each level's evidence can support (descriptive, non-causal).
SUPPORTS = {
    "reaction": "how participants reported experiencing the program.",
    "learning": "what participants knew, could do or felt able to do at the time of measurement.",
    "behavior": "whether on-the-job application was observed or reported at the time of follow-up.",
    "results": "organisational or business measures recorded alongside the program period.",
}

# Where to collect missing evidence (pulse surveys from #11 and #12).
NEXT_EVIDENCE = {
    "reaction": "Collect a short learner pulse right after the program.",
    "learning": "Run the pre/post confidence pulse (confidence_quality) and add assessment scores from the LMS export.",
    "behavior": "Enable the Manager Follow-up Pulse (enterprise_followup) at 30/60/90 days.",
    "results": "Add a business metric agreed in the measurement plan; no pulse survey covers this level.",
}

# Phrases the report text must never contain (tests enforce this).
BANNED_PHRASES = (
    "caused", "cause of", "because of the program", "resulted in", "led to",
    "leads to", "due to the program", "thanks to the program", "proves",
    "proved", "as a result of", "improved performance by", "was responsible for",
    "impact of the program on", "drove",
)

REVIEW_BANNER = "DRAFT - wording must be reviewed by a human before sharing."


def normalize_level(value):
    """Return a level name, or None if untagged. Raises ValueError if invalid.

    Accepts the names or 1-4 (matching measurement-plan levels).
    """
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError("evaluation_level must be one of: " + ", ".join(LEVELS))
    if isinstance(value, int) and 1 <= value <= 4:
        return LEVELS[value - 1]
    if isinstance(value, str):
        v = value.strip().lower()
        if v in LEVELS:
            return v
        if v == "":
            return None
    raise ValueError("evaluation_level must be one of: " + ", ".join(LEVELS))


def build_summary(records) -> dict:
    """Build the report from evidence records.

    records: iterable of dicts {source: str, evaluation_level: tag or None,
    count: int (respondents/records), self_report: bool}.
    Missing or invalid tags are counted separately, never guessed into a level.
    """
    by_level = {name: [] for name in LEVELS}
    untagged = 0
    invalid = 0
    for rec in records or []:
        try:
            level = normalize_level(rec.get("evaluation_level"))
        except ValueError:
            invalid += 1
            continue
        if level is None:
            untagged += 1
            continue
        by_level[level].append(rec)

    levels = []
    gaps = []
    for name in LEVELS:
        recs = by_level[name]
        entry = {"level": name, "label": LEVEL_LABEL[name], "has_evidence": bool(recs)}
        if not recs:
            entry.update({
                "sources": [], "total_count": 0, "flags": [],
                "statement": f"No evidence collected at {name} level.",
            })
            gaps.append({"level": name, "next_evidence": NEXT_EVIDENCE[name]})
            levels.append(entry)
            continue
        sources: dict[str, int] = {}
        for r in recs:
            key = r.get("source", "unknown")
            sources[key] = sources.get(key, 0) + int(r.get("count") or 0)
        total = sum(sources.values())
        flags = []
        if total < SMALL_SAMPLE_THRESHOLD:
            flags.append(FLAG_SMALL_SAMPLE)
        if len(sources) == 1:
            flags.append(FLAG_SINGLE_SOURCE)
        if all(r.get("self_report") for r in recs):
            flags.append(FLAG_SELF_REPORT_ONLY)
        entry.update({
            "sources": [{"source": s, "count": c} for s, c in sorted(sources.items())],
            "total_count": total,
            "flags": flags,
            "statement": (
                f"{total} record(s) from {len(sources)} source(s) describe {SUPPORTS[name]} "
                "This describes the evidence only; it does not show what the program produced."
            ),
        })
        if flags:
            gaps.append({"level": name, "next_evidence": NEXT_EVIDENCE[name]})
        levels.append(entry)

    return {
        "status": "draft_pending_review",
        "review_banner": REVIEW_BANNER,
        "levels": levels,
        "untagged_records": untagged,
        "invalid_tag_records": invalid,
        "gaps": gaps,
    }


def render_markdown(summary: dict, program_name: str = "Program") -> str:
    """Readable export of the report's descriptive text."""
    lines = [f"# Evaluation-level evidence summary: {program_name}", "", f"> {summary['review_banner']}", ""]
    for lv in summary["levels"]:
        lines.append(f"## {lv['label']}")
        lines.append(lv["statement"])
        for s in lv["sources"]:
            lines.append(f"- Source: {s['source']} ({s['count']})")
        for f in lv["flags"]:
            lines.append(f"- Data quality: {FLAG_TEXT[f]}")
        lines.append("")
    if summary["untagged_records"] or summary["invalid_tag_records"]:
        lines.append("## Records not counted")
        lines.append(
            f"- {summary['untagged_records']} record(s) have no evaluation level and "
            f"{summary['invalid_tag_records']} have an invalid tag; they are not assigned to any level."
        )
        lines.append("")
    lines.append("## Gaps and next evidence to collect")
    if not summary["gaps"]:
        lines.append("- No gaps flagged.")
    for g in summary["gaps"]:
        lines.append(f"- {LEVEL_LABEL[g['level']]}: {g['next_evidence']}")
    lines.append("")
    return "\n".join(lines)
