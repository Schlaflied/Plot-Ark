"""Evidence-first Enterprise L&D analysis using Plot Ark's shared patterns."""

from __future__ import annotations

import datetime as dt
import json
from decimal import Decimal


def _float(value, default=0.0) -> float:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def build_enterprise_report(
    program: dict,
    module_rows: list[dict],
    pulse_counts: dict[str, dict[str, int]],
    previous_report: dict | None = None,
) -> dict:
    """Build a deterministic report from normalized evidence.

    LLMs may later rewrite a suggestion, but evidence extraction and diagnosis
    remain inspectable and reproducible.
    """
    learner_refs: set[str] = set()
    completion_weighted = 0.0
    event_total = 0
    durations = []
    modules = []
    suggestions = []

    for row in module_rows:
        learners = int(row.get("learners", 0) or 0)
        events = int(row.get("events", 0) or 0)
        learner_refs.update(row.get("learner_refs", []))
        completion = _float(row.get("completion_rate"))
        score = _float(row.get("average_score"))
        duration = _float(row.get("median_duration_seconds"))
        attempts = _float(row.get("average_attempts"), 1.0)
        if duration:
            durations.append(duration)
        event_total += events
        completion_weighted += completion * max(events, 1)

        states = pulse_counts.get(str(row.get("module_id")), {})
        pulse_total = sum(states.values())
        unclear = states.get("unlocated", 0) + states.get("partial", 0)
        unclear_rate = unclear / pulse_total if pulse_total else 0
        low_score = max(0.0, (70.0 - score) / 70.0) if score else 0.0
        repeat_pressure = min(max(attempts - 1.0, 0.0) / 2.0, 1.0)
        friction_score = round(
            (1.0 - completion) * 0.45
            + low_score * 0.25
            + repeat_pressure * 0.20
            + unclear_rate * 0.10,
            3,
        )
        confidence_inputs = sum((events >= 10, score > 0, duration > 0, pulse_total >= 5))
        confidence = "strong" if confidence_inputs >= 3 else "medium" if confidence_inputs >= 2 else "limited"
        module = {
            "module_id": str(row.get("module_id")),
            "module_title": row.get("module_title") or str(row.get("module_id")),
            "learners": learners,
            "events": events,
            "completion_rate": round(completion, 3),
            "average_score": round(score, 1),
            "median_duration_minutes": round(duration / 60.0, 1),
            "average_attempts": round(attempts, 2),
            "pulse": states,
            "friction_score": friction_score,
            "evidence_confidence": confidence,
        }
        modules.append(module)

        if friction_score >= 0.25:
            reasons = []
            actions = []
            if completion < 0.75:
                reasons.append(f"completion is {completion:.0%}")
                actions.append("Review the point where learners stop or fail to complete")
            if score and score < 70:
                reasons.append(f"average score is {score:.0f}")
                actions.append("Add a worked example before the assessment checkpoint")
            if attempts > 1.4:
                reasons.append(f"average attempts are {attempts:.1f}")
                actions.append("Split the task into a short guided practice and final attempt")
            if unclear_rate >= 0.25:
                reasons.append(f"{unclear_rate:.0%} of pulse responses show partial or unlocated difficulty")
                actions.append("Clarify the prerequisite concept immediately before this module")
            suggestions.append({
                "module_id": module["module_id"],
                "title": f"Improve {module['module_title']}",
                "detail": actions[0] if actions else "Review this module with the available cohort evidence",
                "evidence": "; ".join(reasons) or f"friction score is {friction_score:.2f}",
                "impact": "High impact" if friction_score >= 0.5 else "Medium impact",
                "confidence": confidence,
                "friction_score": friction_score,
            })

    modules.sort(key=lambda item: item["friction_score"], reverse=True)
    suggestions.sort(key=lambda item: item["friction_score"], reverse=True)
    overall_completion = completion_weighted / event_total if event_total else 0.0
    median_duration = sorted(durations)[len(durations) // 2] / 60.0 if durations else 0.0
    evidence_points = sum(
        (
            bool(program.get("training_source_count")),
            bool(program.get("report_source_count")),
            event_total > 0,
            bool(pulse_counts),
        )
    )
    evidence_coverage = round(evidence_points / 4.0, 2)

    previous_completion = None
    if previous_report:
        previous_completion = previous_report.get("metrics", {}).get("completion_rate")
    comparison = {
        "has_previous": previous_completion is not None,
        "completion_delta": round(overall_completion - float(previous_completion), 3)
        if previous_completion is not None else None,
    }

    return {
        "program_id": program["id"],
        "engine_course_id": program["engine_course_id"],
        "organization": {"id": program["organization_id"], "slug": program["organization_slug"]},
        "program_name": program["name"],
        "cohort": {"id": program["cohort_id"], "label": program["cohort_label"]},
        "content_version": program["content_version"],
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "metrics": {
            "learners": len(learner_refs) or max((item["learners"] for item in modules), default=0),
            "completion_rate": round(overall_completion, 3),
            "median_duration_minutes": round(median_duration, 1),
            "content_issues": len(suggestions),
        },
        "evidence_coverage": evidence_coverage,
        "modules": modules,
        "suggestions": suggestions,
        "comparison": comparison,
        "privacy": {
            "aggregation": "cohort",
            "learner_identifiers_in_report": False,
        },
    }


def analyze_enterprise_program(conn, program_id: int, cohort_id: int | None = None) -> tuple[int, dict]:
    cur = conn.cursor()
    cur.execute("""
        SELECT p.id, p.name, p.engine_course_id, p.organization_id, o.slug,
               c.id, c.label,
               COUNT(DISTINCT s.id) FILTER (WHERE s.source_kind = 'training_content'),
               COUNT(DISTINCT s.id) FILTER (WHERE s.source_kind = 'lms_report')
        FROM enterprise_programs p
        JOIN organizations o ON o.id = p.organization_id
        JOIN enterprise_cohorts c ON c.program_id = p.id
        LEFT JOIN enterprise_sources s ON s.program_id = p.id
        WHERE p.id = %s AND (%s::integer IS NULL OR c.id = %s)
        GROUP BY p.id, o.id, c.id
        ORDER BY c.created_at DESC LIMIT 1
    """, (program_id, cohort_id, cohort_id))
    row = cur.fetchone()
    if not row:
        raise LookupError("Program or cohort not found")
    program = {
        "id": row[0], "name": row[1], "engine_course_id": row[2],
        "organization_id": row[3], "organization_slug": row[4],
        "cohort_id": row[5], "cohort_label": row[6],
        "training_source_count": row[7], "report_source_count": row[8],
    }
    cur.execute("""
        SELECT COUNT(*) FROM enterprise_sources
        WHERE program_id = %s AND source_kind = 'training_content'
    """, (program_id,))
    program["content_version"] = max(int(cur.fetchone()[0] or 0), 1)

    cur.execute("""
        SELECT module_id, MAX(module_title), COUNT(DISTINCT learner_ref), COUNT(*),
               AVG(CASE WHEN completion THEN 1.0 ELSE 0.0 END),
               AVG(NULLIF(score, 0)),
               percentile_cont(0.5) WITHIN GROUP (ORDER BY NULLIF(duration_seconds, 0)),
               AVG(attempts), ARRAY_AGG(DISTINCT learner_ref)
        FROM enterprise_learning_events
        WHERE program_id = %s AND cohort_id = %s
        GROUP BY module_id ORDER BY module_id
    """, (program_id, program["cohort_id"]))
    module_rows = [
        {
            "module_id": item[0], "module_title": item[1], "learners": item[2],
            "events": item[3], "completion_rate": item[4], "average_score": item[5],
            "median_duration_seconds": item[6], "average_attempts": item[7],
            "learner_refs": item[8] or [],
        }
        for item in cur.fetchall()
    ]
    cur.execute("""
        SELECT module_id, state, COUNT(*) FROM enterprise_pulses
        WHERE program_id = %s AND cohort_id = %s GROUP BY module_id, state
    """, (program_id, program["cohort_id"]))
    pulse_counts: dict[str, dict[str, int]] = {}
    for module_id, state, count in cur.fetchall():
        pulse_counts.setdefault(module_id, {})[state] = count

    cur.execute("""
        SELECT id, report FROM enterprise_analysis_runs
        WHERE program_id = %s AND cohort_id = %s ORDER BY created_at DESC LIMIT 1
    """, (program_id, program["cohort_id"]))
    previous = cur.fetchone()
    previous_run_id = previous[0] if previous else None
    previous_report = previous[1] if previous else None

    report = build_enterprise_report(program, module_rows, pulse_counts, previous_report)
    cur.execute("""
        INSERT INTO enterprise_analysis_runs
            (organization_id, program_id, cohort_id, content_version, previous_run_id, report)
        VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
    """, (
        program["organization_id"], program_id, program["cohort_id"],
        program["content_version"], previous_run_id, json.dumps(report),
    ))
    run_id = cur.fetchone()[0]
    persisted = []
    for suggestion in report["suggestions"]:
        cur.execute("""
            INSERT INTO enterprise_suggestions
                (analysis_run_id, program_id, cohort_id, module_id, title, detail,
                 evidence, impact, confidence, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending')
            RETURNING id
        """, (
            run_id, program_id, program["cohort_id"], suggestion["module_id"],
            suggestion["title"], suggestion["detail"], suggestion["evidence"],
            suggestion["impact"], suggestion["confidence"],
        ))
        persisted.append({**suggestion, "id": cur.fetchone()[0], "status": "pending"})
    report["suggestions"] = persisted
    report["run_id"] = run_id
    cur.execute("UPDATE enterprise_analysis_runs SET report = %s WHERE id = %s", (json.dumps(report), run_id))
    return run_id, report
