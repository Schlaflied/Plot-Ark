"""Pre/post confidence pulse — response-quality scoring and cohort aggregation.

Mirrors the Academic workspace idea (cross-validate self-report against
behavioural signals, e.g. "fast_but_unsure" in behavior_analyst, fake-completion
detection) for the Enterprise workspace.

Privacy boundaries (by design):
  * Flags describe *responses*, never people. Nothing here returns learner ids,
    per-learner scores, rankings or per-learner flags.
  * Output is cohort-level only; groups smaller than MIN_GROUP_SIZE are
    suppressed so an individual cannot be inferred.
  * Flags are advisory for the L&D owner, never for performance decisions.
  * Flagged responses are reported separately, never deleted.

All functions are pure (no DB) so they are easy to test.
"""

from __future__ import annotations

from statistics import mean

SCALE_MIN, SCALE_MAX = 1, 5

MIN_SECONDS_PER_ITEM = 1.5        # faster than this on average => "very fast"
MIN_ITEMS_FOR_STRAIGHTLINE = 3    # identical answers only meaningful with >=3 items
MISMATCH_DELTA = 1.5              # mean confidence jump (scale points) considered "sharp"
MIN_CONTENT_SECONDS = 60          # less time-on-content than this can't justify a jump
LOW_SCORE = 50                    # assessment score considered "not improved"
MIN_GROUP_SIZE = 5                # suppress cohort stats below this many responses
MAX_TRUSTED_FLAG_SHARE = 0.30     # above this the change should not be trusted

FLAG_STRAIGHT_LINING = "straight_lining"
FLAG_VERY_FAST = "very_fast_completion"
FLAG_BEHAVIOR_MISMATCH = "confidence_behavior_mismatch"
FLAG_INVALID = "invalid_answers"

DISCLAIMER = (
    "Flags describe response quality, not people. They are advisory for the "
    "L&D owner and must not be used for performance decisions."
)


def _valid(answers) -> bool:
    return (
        isinstance(answers, (list, tuple))
        and len(answers) > 0
        and all(isinstance(a, (int, float)) and not isinstance(a, bool)
                and SCALE_MIN <= a <= SCALE_MAX for a in answers)
    )


def response_flags(answers, duration_seconds=None) -> list[str]:
    """Quality flags for one response that need no other data."""
    if not _valid(answers):
        return [FLAG_INVALID]
    flags = []
    if len(answers) >= MIN_ITEMS_FOR_STRAIGHTLINE and len(set(answers)) == 1:
        flags.append(FLAG_STRAIGHT_LINING)
    if duration_seconds is not None and duration_seconds < MIN_SECONDS_PER_ITEM * len(answers):
        flags.append(FLAG_VERY_FAST)
    return flags


def mismatch_flag(pre_answers, post_answers, behavior) -> bool:
    """Confidence moved sharply while behaviour/assessment did not.

    ``behavior`` is the learner's aggregate from enterprise_learning_events:
    {"content_seconds": float|None, "avg_score": float|None}. Missing data
    (None) is never treated as evidence of a mismatch.
    """
    if not behavior or not _valid(pre_answers) or not _valid(post_answers):
        return False
    if mean(post_answers) - mean(pre_answers) < MISMATCH_DELTA:
        return False
    seconds = behavior.get("content_seconds")
    score = behavior.get("avg_score")
    little_time = seconds is not None and seconds < MIN_CONTENT_SECONDS
    low_result = score is not None and score < LOW_SCORE
    return little_time or low_result


def _round(value):
    return None if value is None else round(value, 2)


def _stats(pairs):
    """pairs: list of (pre_mean, post_mean). Returns suppressed-safe stats."""
    n = len(pairs)
    if n < MIN_GROUP_SIZE:
        return {"n": n, "pre_mean": None, "post_mean": None, "change": None,
                "suppressed": n > 0}
    pre = mean(p for p, _ in pairs)
    post = mean(q for _, q in pairs)
    return {"n": n, "pre_mean": _round(pre), "post_mean": _round(post),
            "change": _round(post - pre), "suppressed": False}


def build_cohort_report(responses, behavior_by_learner=None) -> dict:
    """Aggregate a cohort's confidence pulse.

    responses: iterable of dicts {learner (opaque key), phase 'pre'|'post',
               answers [1-5...], duration_seconds}.
    behavior_by_learner: optional {learner: {content_seconds, avg_score}}.

    Returns cohort-level data only; learner keys never leave this function.
    """
    behavior_by_learner = behavior_by_learner or {}
    by_learner: dict = {}
    total = {"pre": 0, "post": 0}
    flagged = {"pre": 0, "post": 0}
    reason_counts: dict[str, int] = {}

    for r in responses:
        phase = r.get("phase")
        if phase not in ("pre", "post"):
            continue
        by_learner.setdefault(r["learner"], {})[phase] = r  # latest wins

    # Per-response flags (each response counted once per reason).
    learner_flags: dict = {}
    for learner, phases in by_learner.items():
        flags_for_learner = set()
        for phase, r in phases.items():
            total[phase] += 1
            flags = response_flags(r.get("answers"), r.get("duration_seconds"))
            if phase == "post" and "pre" in phases and mismatch_flag(
                phases["pre"].get("answers"), r.get("answers"),
                behavior_by_learner.get(learner),
            ):
                flags.append(FLAG_BEHAVIOR_MISMATCH)
            if flags:
                flagged[phase] += 1
                flags_for_learner.add(phase)
                for f in flags:
                    reason_counts[f] = reason_counts.get(f, 0) + 1
        learner_flags[learner] = flags_for_learner

    all_pairs, clean_pairs, flagged_pairs = [], [], []
    for learner, phases in by_learner.items():
        if "pre" in phases and "post" in phases and _valid(phases["pre"].get("answers")) \
                and _valid(phases["post"].get("answers")):
            pair = (mean(phases["pre"]["answers"]), mean(phases["post"]["answers"]))
            all_pairs.append(pair)
            (flagged_pairs if learner_flags[learner] else clean_pairs).append(pair)

    n_responses = total["pre"] + total["post"]
    n_flagged = flagged["pre"] + flagged["post"]
    share = (n_flagged / n_responses) if n_responses else 0.0
    trusted = share <= MAX_TRUSTED_FLAG_SHARE

    notes = [DISCLAIMER]
    if not trusted:
        notes.append(
            f"{share:.0%} of responses are flagged (limit {MAX_TRUSTED_FLAG_SHARE:.0%}); "
            "the confidence change should not be trusted."
        )
    if all_pairs and len(all_pairs) < MIN_GROUP_SIZE:
        notes.append(f"Fewer than {MIN_GROUP_SIZE} matched pre/post responses; averages are withheld.")

    return {
        "has_data": n_responses > 0,
        "matched_pairs": len(all_pairs),
        "responses": {"pre": total["pre"], "post": total["post"], "total": n_responses},
        "all_responses": _stats(all_pairs),
        "unflagged_responses": _stats(clean_pairs),
        "flagged_responses": _stats(flagged_pairs),  # shown separately, not deleted
        "flagged": {
            "count": n_flagged,
            "share": round(share, 3),
            "by_reason": dict(sorted(reason_counts.items())),
        },
        "change_trusted": trusted,
        "notes": notes,
    }
