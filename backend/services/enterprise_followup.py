"""Manager Follow-up Pulse: pure validation and cohort-level aggregation.

Evidence source for post-training behaviour. Managers answer one fixed-choice
question about their team at configurable intervals (default 30 / 90 days).

Privacy rules enforced here, not in the UI:
  * only cohort-level aggregates leave this module (never per-manager answers),
  * no breakdown is returned below ``min_group_size`` responses,
  * ``no_opportunity`` is its own state and is excluded from the "applying"
    denominator, so it is never read as "not applying" (mirrors the Learner
    Pulse separation of "not reviewed" vs "did not understand").
"""

from __future__ import annotations

import datetime
from collections import Counter

DEFAULT_INTERVALS = [30, 90]
DEFAULT_MIN_GROUP_SIZE = 5
MIN_COVERAGE = 0.5
MAX_INTERVALS = 6
MAX_INTERVAL_DAYS = 730
MAX_COMMENT_CHARS = 500

STATUSES = ("applying", "partly_applying", "not_yet", "no_opportunity")
STATUS_LABELS = {
    "applying": "Applying the skill",
    "partly_applying": "Partly applying",
    "not_yet": "Not yet applying",
    "no_opportunity": "No opportunity to apply",
}
# States where the team had a chance to apply the skill.
OPPORTUNITY_STATUSES = ("applying", "partly_applying", "not_yet")


def validate_intervals(raw) -> list[int]:
    """Return sorted unique positive day offsets, or raise ValueError."""
    if raw is None:
        return list(DEFAULT_INTERVALS)
    if not isinstance(raw, list) or not raw:
        raise ValueError("intervals_days must be a non-empty list of days")
    days = []
    for value in raw:
        if isinstance(value, bool) or not isinstance(value, int):
            raise ValueError("intervals_days must contain whole numbers")
        if value < 1 or value > MAX_INTERVAL_DAYS:
            raise ValueError(f"each interval must be between 1 and {MAX_INTERVAL_DAYS} days")
        days.append(value)
    days = sorted(set(days))
    if len(days) > MAX_INTERVALS:
        raise ValueError(f"at most {MAX_INTERVALS} follow-up intervals are allowed")
    return days


def validate_min_group_size(raw) -> int:
    if raw is None:
        return DEFAULT_MIN_GROUP_SIZE
    if isinstance(raw, bool) or not isinstance(raw, int) or raw < 2:
        raise ValueError("min_group_size must be a whole number of at least 2")
    return raw


def validate_response(status, comment) -> tuple[str, str]:
    if status not in STATUSES:
        raise ValueError(f"status must be one of: {', '.join(STATUSES)}")
    text = str(comment or "").strip()
    if len(text) > MAX_COMMENT_CHARS:
        raise ValueError(f"comment is limited to {MAX_COMMENT_CHARS} characters")
    return status, text


def is_due(anchor: datetime.date, interval_days: int, today: datetime.date | None = None) -> bool:
    today = today or datetime.date.today()
    return anchor + datetime.timedelta(days=interval_days) <= today


def aggregate_followup(
    invited: int,
    statuses: list[str],
    min_group_size: int = DEFAULT_MIN_GROUP_SIZE,
    min_coverage: float = MIN_COVERAGE,
) -> dict:
    """Cohort-level aggregate for one interval.

    ``invited`` is the number of managers asked; ``statuses`` holds one status
    per responding manager. Counts are withheld (``counts`` is None) while the
    number of responses is below ``min_group_size``.
    """
    responded = len(statuses)
    coverage = round(responded / invited, 3) if invited else 0.0
    suppressed = responded < min_group_size
    insufficient = suppressed or coverage < min_coverage

    result = {
        "invited": invited,
        "responded": responded,
        "coverage": coverage,
        "min_group_size": min_group_size,
        "breakdown_suppressed": suppressed,
        "evidence_status": "insufficient_data" if insufficient else "sufficient",
        "counts": None,
        "applying_share": None,
        "no_opportunity_share": None,
    }
    if suppressed:
        return result

    tally = Counter(statuses)
    result["counts"] = {status: tally.get(status, 0) for status in STATUSES}
    with_opportunity = sum(tally.get(status, 0) for status in OPPORTUNITY_STATUSES)
    # no_opportunity is excluded from this denominator on purpose.
    result["applying_share"] = (
        round(tally.get("applying", 0) / with_opportunity, 3) if with_opportunity else None
    )
    result["no_opportunity_share"] = round(tally.get("no_opportunity", 0) / responded, 3)
    return result


def evidence_card(program_name: str, cohort_label: str, interval_days: int, aggregate: dict) -> dict:
    """Diagnosis-console card citing manager follow-up evidence with coverage."""
    coverage_pct = round(aggregate["coverage"] * 100)
    base = {
        "type": "manager_follow_up",
        "title": "Manager follow-up",
        "program": program_name,
        "cohort": cohort_label,
        "interval_days": interval_days,
        "coverage": aggregate["coverage"],
        "invited": aggregate["invited"],
        "responded": aggregate["responded"],
        "evidence_status": aggregate["evidence_status"],
        "counts": aggregate["counts"],
        "applying_share": aggregate["applying_share"],
        "no_opportunity_share": aggregate["no_opportunity_share"],
    }
    if aggregate["evidence_status"] == "insufficient_data":
        if aggregate["breakdown_suppressed"]:
            reason = (
                f"Only {aggregate['responded']} of {aggregate['invited']} managers responded "
                f"({coverage_pct}% coverage); no breakdown is shown below {aggregate['min_group_size']} responses."
            )
        else:
            reason = (
                f"Coverage is {coverage_pct}% ({aggregate['responded']} of {aggregate['invited']} managers), "
                f"below the {round(MIN_COVERAGE * 100)}% needed to cite this evidence."
            )
        base["summary"] = f"Insufficient data at {interval_days} days. {reason}"
        return base

    counts = aggregate["counts"]
    share = aggregate["applying_share"]
    parts = [
        f"At {interval_days} days, {aggregate['responded']} of {aggregate['invited']} managers "
        f"responded ({coverage_pct}% coverage)."
    ]
    if share is not None:
        parts.append(
            f"Among teams with an opportunity to apply, {round(share * 100)}% are applying the skill."
        )
    if counts["no_opportunity"]:
        parts.append(
            f"{counts['no_opportunity']} reported no opportunity to apply; this is not counted as not applying."
        )
    base["summary"] = " ".join(parts)
    return base
