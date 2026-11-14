"""Feedback triage: cluster open-text learner feedback into topics and propose
an escalation list for human review.

Pure module (no DB/Flask). Approach is deliberately simple and explainable:
  1. Comments that describe a *blocker* (cannot log in / cannot submit) are
     grouped by blocker type using fixed patterns.
  2. All other comments are grouped by TF-IDF cosine similarity (single pass,
     deterministic, stdlib only). Each topic label is its top weighted terms.
  3. Each topic counts DISTINCT learners, not comments. Repeat comments from
     one learner never inflate a count.

Privacy: output never contains learner ids. Topics with fewer distinct
learners than ``min_group_size`` are suppressed (only a count of suppressed
topics is reported). A blocker below that size is still escalated, as the
issue requires, but its example comments are withheld so one person cannot be
identified. No sentiment is scored; topics only.
"""

from __future__ import annotations

import csv
import io
import math
import re
from collections import Counter

DEFAULT_CONFIG = {
    "raise_now_min_learners": 3,   # distinct learners needed to "raise now"
    "min_group_size": 2,           # below this a (non-blocker) topic is hidden
    "similarity_threshold": 0.15,  # TF-IDF cosine needed to join a topic
    "max_examples": 3,
    "example_max_chars": 120,
}
MIN_GROUP_SIZE_FLOOR = 2  # privacy floor; config cannot go lower

RULE_BLOCKER = "blocker_single_report"
RULE_THRESHOLD = "min_distinct_learners"
RULE_MONITOR = "monitor"

BLOCKER_PATTERNS = {
    "cannot_log_in": (
        "Cannot log in",
        re.compile(
            r"\b(can(?:no|')?t|unable to|couldn'?t|could not|not able to|won'?t|"
            r"fail(?:s|ed|ing)? to|keeps? (?:logging|signing) me out)\b[^.!?\n]{0,30}"
            r"\b(log ?in|sign ?in|access (?:the )?(?:course|account|platform))\b"
            r"|\b(log ?in|sign ?in|password reset)\b[^.!?\n]{0,25}"
            r"\b(fail(?:s|ed)?|broken|not working|doesn'?t work|error)\b",
            re.I,
        ),
    ),
    "cannot_submit": (
        "Cannot submit work",
        re.compile(
            r"\b(can(?:no|')?t|unable to|couldn'?t|could not|not able to|won'?t)\b"
            r"[^.!?\n]{0,30}\b(submit|upload|turn in|hand in)\b"
            r"|\b(submit|submission|upload)\b[^.!?\n]{0,25}"
            r"\b(fail(?:s|ed)?|broken|not working|doesn'?t work|error|button (?:is )?(?:missing|disabled))\b",
            re.I,
        ),
    ),
}

_STOPWORDS = frozenset("""
a about after all also am an and any are as at be because been but by can could did do does
down for from get got had has have he her here him his how i if in into is it its just like
me more most my no not of off on one only or other our out over so some than that the their
them then there these they this those to too up us very was we were what when which while who
will with would you your really quite much many bit lot also still even though
""".split())

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
_PHONE = re.compile(r"\+?\d[\d\s().-]{7,}\d")
_TOKEN = re.compile(r"[a-z][a-z']+")


# ── Import ───────────────────────────────────────────────────────────────

def parse_feedback_csv(text: str) -> list[dict]:
    """Parse CSV text with columns learner_id, comment and optional course_ref
    (or activity_ref / activity / course). Empty input returns []."""
    if not text or not text.strip():
        return []
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    fields = {(f or "").strip().lower(): f for f in (reader.fieldnames or [])}
    if "learner_id" not in fields or "comment" not in fields:
        raise ValueError("CSV must have columns: learner_id, comment (course_ref optional)")
    ref_col = next((fields[k] for k in ("course_ref", "activity_ref", "activity", "course")
                    if k in fields), None)
    rows = []
    for row in reader:
        rows.append({
            "learner_id": row.get(fields["learner_id"]),
            "comment": row.get(fields["comment"]),
            "course_ref": row.get(ref_col) if ref_col else None,
        })
    return rows


def normalize_config(raw: dict | None) -> dict:
    """Merge user config over defaults and validate. Raises ValueError."""
    cfg = dict(DEFAULT_CONFIG)
    if raw is None:
        return cfg
    if not isinstance(raw, dict):
        raise ValueError("config must be an object")
    for key, value in raw.items():
        if key not in DEFAULT_CONFIG:
            raise ValueError(f"unknown config key: {key}")
        if key == "similarity_threshold":
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 < value <= 1:
                raise ValueError("similarity_threshold must be a number in (0, 1]")
        else:
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                raise ValueError(f"{key} must be a positive integer")
        cfg[key] = value
    cfg["min_group_size"] = max(cfg["min_group_size"], MIN_GROUP_SIZE_FLOOR)
    return cfg


# ── Text handling ────────────────────────────────────────────────────────

def _stem(tok: str) -> str:
    for suffix in ("ing", "ed", "es", "s"):
        if tok.endswith(suffix) and len(tok) - len(suffix) >= 4:
            return tok[: -len(suffix)]
    return tok


def _tokens(text: str) -> list[str]:
    toks = [_stem(t.strip("'")) for t in _TOKEN.findall(text.lower())]
    return [t for t in toks if len(t) > 2 and t not in _STOPWORDS]


def _shorten(text: str, limit: int) -> str:
    text = _EMAIL.sub("[email]", text)
    text = _PHONE.sub("[number]", text)
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1].rstrip() + "…"


def _blocker_type(comment: str) -> str | None:
    for key, (_, pattern) in BLOCKER_PATTERNS.items():
        if pattern.search(comment):
            return key
    return None


def _clean_rows(rows) -> list[dict]:
    """Drop blank/invalid rows and exact duplicates (same learner, same text)."""
    seen = set()
    out = []
    for r in rows or []:
        if not isinstance(r, dict):
            continue
        learner = str(r.get("learner_id") or "").strip()
        comment = " ".join(str(r.get("comment") or "").split())
        if not learner or not comment:
            continue
        ref = str(r.get("course_ref") or "").strip() or "general"
        key = (learner, ref, comment.lower())
        if key in seen:
            continue
        seen.add(key)
        out.append({"learner": learner, "comment": comment, "ref": ref})
    return out


# ── Clustering ───────────────────────────────────────────────────────────

def _cluster_by_similarity(items: list[dict], threshold: float) -> list[list[dict]]:
    """Single-pass TF-IDF cosine grouping. Items get a ``toks`` Counter."""
    n = len(items)
    df = Counter()
    for it in items:
        df.update(set(it["toks"]))

    def vec(counter):
        v = {t: c * (math.log((1 + n) / (1 + df[t])) + 1.0) for t, c in counter.items() if t in df}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        return {t: x / norm for t, x in v.items()}

    def cos(a, b):
        if len(a) > len(b):
            a, b = b, a
        return sum(x * b.get(t, 0.0) for t, x in a.items())

    clusters: list[dict] = []
    for it in items:
        v = vec(it["toks"])
        best, best_sim = None, 0.0
        for c in clusters:
            s = cos(v, c["centroid"])
            if s > best_sim:
                best, best_sim = c, s
        if best is not None and best_sim >= threshold:
            best["items"].append(it)
            best["sum"].update(it["toks"])
            best["centroid"] = vec(best["sum"])
        else:
            clusters.append({"items": [it], "sum": Counter(it["toks"]), "centroid": v})
    return [c["items"] for c in clusters]


def _label(items: list[dict], df_all: Counter, n_all: int) -> str:
    total = Counter()
    for it in items:
        total.update(set(it["toks"]))  # per-comment presence, not repetition
    scored = sorted(
        total,
        key=lambda t: (-(total[t] * (math.log((1 + n_all) / (1 + df_all[t])) + 1.0)), t),
    )
    words = scored[:3]
    return " / ".join(words) if words else "other"


def _examples(items: list[dict], cfg: dict) -> list[str]:
    """One shortened example per distinct learner, in stable order."""
    seen, out = set(), []
    for it in sorted(items, key=lambda i: (i["learner"], i["comment"])):
        if it["learner"] in seen:
            continue
        seen.add(it["learner"])
        out.append(_shorten(it["comment"], cfg["example_max_chars"]))
        if len(out) >= cfg["max_examples"]:
            break
    return out


# ── Triage ───────────────────────────────────────────────────────────────

def triage_feedback(rows, config: dict | None = None) -> dict:
    """Cluster comments into topics and classify them.

    Returns {"config", "summary", "escalations", "monitor"}. ``escalations``
    holds "raise_now" and blocker topics; ``monitor`` the rest that meet the
    minimum group size. No learner ids appear anywhere in the result.
    """
    cfg = normalize_config(config)
    clean = _clean_rows(rows)

    by_ref: dict[str, list[dict]] = {}
    for it in clean:
        it["toks"] = Counter(_tokens(it["comment"]))
        it["blocker"] = _blocker_type(it["comment"])
        by_ref.setdefault(it["ref"], []).append(it)

    topics = []
    for ref in sorted(by_ref):
        items = by_ref[ref]
        groups = []  # (blocker_key | None, items)
        for key in BLOCKER_PATTERNS:
            members = [i for i in items if i["blocker"] == key]
            if members:
                groups.append((key, members))
        rest = [i for i in items if i["blocker"] is None]
        df_all = Counter()
        for i in rest:
            df_all.update(set(i["toks"]))
        for members in _cluster_by_similarity(rest, cfg["similarity_threshold"]):
            groups.append((None, members))

        for key, members in groups:
            learners = {m["learner"] for m in members}
            label = (BLOCKER_PATTERNS[key][0] if key
                     else _label(members, df_all, len(rest)))
            topics.append({
                "course_ref": ref,
                "label": label,
                "distinct_learners": len(learners),
                "comment_count": len(members),
                "is_blocker": key is not None,
                "_members": members,
            })

    escalations, monitor, suppressed = [], [], 0
    for t in topics:
        members = t.pop("_members")
        n = t["distinct_learners"]
        small = n < cfg["min_group_size"]
        if t["is_blocker"]:
            t["triggered_rule"] = RULE_BLOCKER
            t["rule_detail"] = (
                "Blocker report (login/submission failure) is escalated regardless of count"
                f" (distinct learners: {n})"
            )
            t["level"] = "blocker"
            # Small group: withhold examples so one learner cannot be identified.
            t["examples"] = [] if small else _examples(members, cfg)
            t["examples_withheld"] = small
            escalations.append(t)
        elif small:
            suppressed += 1
        elif n >= cfg["raise_now_min_learners"]:
            t["triggered_rule"] = RULE_THRESHOLD
            t["rule_detail"] = (
                f"{n} distinct learners raised this (threshold {cfg['raise_now_min_learners']})"
            )
            t["level"] = "raise_now"
            t["examples"] = _examples(members, cfg)
            t["examples_withheld"] = False
            escalations.append(t)
        else:
            t["triggered_rule"] = RULE_MONITOR
            t["rule_detail"] = (
                f"{n} distinct learners, below raise-now threshold {cfg['raise_now_min_learners']}"
            )
            t["level"] = "monitor"
            t["examples"] = _examples(members, cfg)
            t["examples_withheld"] = False
            monitor.append(t)

    order = lambda t: (0 if t["level"] == "blocker" else 1, -t["distinct_learners"], t["course_ref"], t["label"])
    escalations.sort(key=order)
    monitor.sort(key=order)
    return {
        "config": cfg,
        "summary": {
            "comments_used": len(clean),
            "topics_found": len(topics),
            "raise_now": sum(1 for t in escalations if t["level"] == "raise_now"),
            "blockers": sum(1 for t in escalations if t["level"] == "blocker"),
            "monitor": len(monitor),
            "suppressed_small_topics": suppressed,
        },
        "escalations": escalations,
        "monitor": monitor,
    }
