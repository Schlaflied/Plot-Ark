"""Threshold Checker — detects compound signals across agent outputs.

Signal logic (from architecture doc):
  - Single agent flags a module → yellow (badge, no modal)
  - Two agents flag the same module → orange (badge + modal popup)

Most reliable combination:
  - content_optimizer flags underperforming module
  - AND risk_detector sees >25% at-risk students in that module
"""

import json
import re
from db import get_db


# ── Year-based need-help thresholds ──────────────────────────────────────────
# Year 1-2 large-enrollment courses: human intervention when >50 students flag a module
# Year 3-4 small-enrollment courses: review triggered at >10
_NEED_HELP_THRESHOLDS = {1: 50, 2: 50, 3: 10, 4: 10}
_DEFAULT_NEED_HELP_THRESHOLD = 20


def _extract_year_from_course(course_id: int) -> int:
    """Derive academic year (1-4) from the course_code stored in curricula.

    Heuristic: first digit of the numeric part of the course code.
    E.g. ACCT 101 → 1, PSYCH 301 → 3.  Fallback → 2.
    """
    conn = get_db()
    if not conn:
        return 2
    try:
        cur = conn.cursor()
        cur.execute("SELECT course_code, level FROM curricula WHERE id = %s", (course_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return 2
        code, level = row
        # Try course code first: grab first digit of embedded number
        if code:
            m = re.search(r'(\d)', code)
            if m:
                d = int(m.group(1))
                return max(1, min(4, d))
        # Fall back to level field ("100-level", "undergraduate year 2", etc.)
        if level:
            m = re.search(r'(\d)', level)
            if m:
                d = int(m.group(1))
                if 1 <= d <= 4:
                    return d
        return 2
    except Exception:
        return 2


def _get_need_help_counts(course_id: int) -> dict[str, int]:
    """Return {module_id: count} of 'requested-help' xAPI events for this course."""
    conn = get_db()
    if not conn:
        return {}
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT object_id, COUNT(*) as cnt
            FROM xapi_statements
            WHERE verb = 'requested-help'
              AND course_id = %s
            GROUP BY object_id
        """, (course_id,))
        result = {}
        for row in cur.fetchall():
            obj_id, cnt = row
            # object_id format: "module_{n}" or "module_1/Title"
            mod_key = obj_id.split("/")[0] if "/" in obj_id else obj_id
            result[mod_key] = result.get(mod_key, 0) + int(cnt)
        cur.close()
        conn.close()
        return result
    except Exception:
        return {}


def check_thresholds(report: dict) -> list[dict]:
    """Scan orchestrator report for compound signals, write flags to DB.

    Args:
        report: Full aggregated report dict.

    Returns:
        List of flag dicts: [{module_id, module_name, flag_level, signals}]
    """
    course_id = report.get("course_id")
    if not course_id:
        return []

    co = report.get("content_optimization", {})
    ra = report.get("risk_assessment", {})
    ba = report.get("behavior_analysis", {})

    # ── Build per-module signal map ───────────────────────────────────────
    module_signals: dict[str, list[dict]] = {}

    # Signal source 1: content_optimizer — underperforming modules
    for mod in co.get("underperforming_content", []):
        mod_id = mod.get("module_id", "")
        if not mod_id:
            continue
        if mod_id not in module_signals:
            module_signals[mod_id] = []
        module_signals[mod_id].append({
            "source": "content_optimizer",
            "detail": f"Struggle rate: {mod.get('struggle_rate', 0):.0%}, "
                      f"Failure rate: {mod.get('failure_rate', 0):.0%}",
            "struggle_rate": mod.get("struggle_rate", 0),
            "failure_rate": mod.get("failure_rate", 0),
        })

    # Signal source 2: behavior_analyst — low completion rate modules
    for mod in ba.get("module_engagement", []):
        mod_id = mod.get("module_id", "")
        if not mod_id:
            continue
        comp = mod.get("completion_rate", 1)
        if comp < 0.5:
            if mod_id not in module_signals:
                module_signals[mod_id] = []
            module_signals[mod_id].append({
                "source": "behavior_analyst",
                "detail": f"Completion rate: {comp:.0%}",
                "completion_rate": comp,
            })

    # Signal source 3: risk_detector — check at-risk % per module
    # The risk_detector doesn't break down by module directly, but we can
    # cross-reference at-risk students' signals with module-level engagement.
    total_students = ra.get("total_students_analyzed", 0)
    at_risk_students = ra.get("at_risk_students", [])
    at_risk_pct = len(at_risk_students) / max(total_students, 1)

    if at_risk_pct > 0.25:
        # If overall at-risk is >25%, any underperforming module gets a risk signal
        for mod_id in list(module_signals.keys()):
            has_risk_signal = any(s["source"] == "risk_detector" for s in module_signals[mod_id])
            if not has_risk_signal:
                module_signals[mod_id].append({
                    "source": "risk_detector",
                    "detail": f"Cohort at-risk: {at_risk_pct:.0%} "
                              f"({len(at_risk_students)} of {total_students} students)",
                    "at_risk_pct": round(at_risk_pct, 2),
                })

    # Signal source 4: need-help xAPI events — year-based thresholds
    year = _extract_year_from_course(course_id)
    threshold = _NEED_HELP_THRESHOLDS.get(year, _DEFAULT_NEED_HELP_THRESHOLD)
    need_help_counts = _get_need_help_counts(course_id)

    for mod_id, count in need_help_counts.items():
        if count >= threshold:
            if mod_id not in module_signals:
                module_signals[mod_id] = []
            module_signals[mod_id].append({
                "source": "need_help",
                "detail": f"{count} students requested help (Year {year} threshold: {threshold}). "
                          "Consider posting an announcement or redesigning this module.",
                "need_help_count": count,
                "threshold": threshold,
                "year": year,
            })

    # ── Determine flag level ──────────────────────────────────────────────
    flags = []
    # Build module name lookup from behavior_analyst
    mod_names = {m.get("module_id", ""): m.get("module_name", "") for m in ba.get("module_engagement", [])}

    for mod_id, signals in module_signals.items():
        unique_sources = set(s["source"] for s in signals)

        if len(unique_sources) >= 2:
            flag_level = "orange"  # Two+ agents → modal popup
        else:
            flag_level = "yellow"  # Single agent → badge only

        flag = {
            "module_id": mod_id,
            "module_name": mod_names.get(mod_id, mod_id),
            "flag_level": flag_level,
            "signals": signals,
        }
        flags.append(flag)

    # ── Persist flags to DB ───────────────────────────────────────────────
    if flags:
        _save_flags(course_id, flags)

    if flags:
        levels = {f["flag_level"] for f in flags}
        print(f"[ThresholdChecker] Course {course_id}: {len(flags)} modules flagged "
              f"({', '.join(levels)})")
    else:
        print(f"[ThresholdChecker] Course {course_id}: no flags triggered")

    return flags


def _save_flags(course_id: int, flags: list[dict]) -> None:
    """Write flags to module_flags table.

    Uses replace strategy: DELETE old non-dismissed flags for this course,
    then INSERT the fresh set. Each A2A run produces a complete snapshot
    of flags — old undismissed flags are stale.
    """
    conn = get_db()
    if not conn:
        return
    try:
        cur = conn.cursor()
        # Clear stale flags (user-dismissed flags are preserved)
        cur.execute("""
            DELETE FROM module_flags
            WHERE course_id = %s AND dismissed = FALSE
        """, (course_id,))
        for flag in flags:
            cur.execute("""
                INSERT INTO module_flags (course_id, module_id, flag_level, signals)
                VALUES (%s, %s, %s, %s)
            """, (
                course_id,
                flag["module_id"],
                flag["flag_level"],
                json.dumps(flag["signals"], default=str),
            ))
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"[ThresholdChecker] DB save error: {e}")
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass
