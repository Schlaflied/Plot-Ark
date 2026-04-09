"""Curriculum Agent — reads LTM Cold history and generates adjustment recommendations.

Phase 1: Static template-based recommendations (no LLM).
Phase 3: Will swap to real LLM calls for natural language suggestions.

Logic:
  1. Read recent Cold LTM .md files for the course
  2. Find modules flagged continuously (3+ consecutive runs = structural issue)
  3. Compare historical trend (improving / worsening / stable)
  4. Generate per-module recommendations
  5. Write change_log to PostgreSQL
"""

import json
from agents.base import BaseNode, SharedMemory
from db import get_db
from services.ltm_writer import read_cold_history


class CurriculumAgentNode(BaseNode):
    name = "curriculum_agent"
    description = "Analyzes historical trends and generates curriculum adjustment recommendations"
    model = "sql-only"  # Phase 1: no LLM
    required_output_keys = ["recommendations", "historical_trend"]

    def _run(self, sm: SharedMemory) -> dict:
        course_id = sm.get("course_id")
        flagged_modules = sm.get("flagged_modules", [])

        # ── 1. Read LTM Cold history ─────────────────────────────────────
        history = read_cold_history(course_id, max_files=10)

        # ── 2. Build per-module flag frequency ───────────────────────────
        module_flag_counts: dict[str, list[str]] = {}  # module_id → [date1, date2, ...]
        for snapshot in history:
            analysis_date = str(snapshot.get("analysis_date", "unknown"))
            for mod in snapshot.get("modules_flagged", []):
                mod_id = mod.get("module_id", "") if isinstance(mod, dict) else str(mod)
                if mod_id:
                    if mod_id not in module_flag_counts:
                        module_flag_counts[mod_id] = []
                    module_flag_counts[mod_id].append(analysis_date)

        # ── 3. Classify: structural vs occasional ────────────────────────
        structural_modules = []
        occasional_modules = []

        for mod_id, dates in module_flag_counts.items():
            if len(dates) >= 3:
                structural_modules.append({
                    "module_id": mod_id,
                    "flag_count": len(dates),
                    "dates": dates[:5],
                    "classification": "structural",
                })
            elif len(dates) >= 1:
                occasional_modules.append({
                    "module_id": mod_id,
                    "flag_count": len(dates),
                    "dates": dates[:5],
                    "classification": "occasional",
                })

        # ── 4. Historical trend (cohort at-risk %) ───────────────────────
        at_risk_trend = []
        completion_trend = []
        for snapshot in reversed(history):  # oldest first
            at_risk_trend.append({
                "date": str(snapshot.get("analysis_date", "")),
                "at_risk_pct": snapshot.get("cohort_at_risk_pct", 0),
            })
            completion_trend.append({
                "date": str(snapshot.get("analysis_date", "")),
                "completion_rate": snapshot.get("overall_completion_rate", 0),
            })

        trend_direction = _compute_trend_direction(at_risk_trend)

        # ── 5. Generate recommendations ──────────────────────────────────
        recommendations = []

        for mod in structural_modules:
            rec = _generate_structural_recommendation(mod)
            recommendations.append(rec)

        for mod in occasional_modules:
            rec = _generate_occasional_recommendation(mod)
            recommendations.append(rec)

        # Also generate recommendations for currently flagged modules not in history
        current_flag_ids = set()
        for flag in flagged_modules:
            mod_id = flag.get("module_id", "") if isinstance(flag, dict) else str(flag)
            current_flag_ids.add(mod_id)

        known_ids = set(module_flag_counts.keys())
        new_flags = current_flag_ids - known_ids
        for mod_id in new_flags:
            flag_data = next((f for f in flagged_modules
                              if (f.get("module_id") if isinstance(f, dict) else f) == mod_id),
                             {})
            recommendations.append({
                "module_id": mod_id,
                "module_name": flag_data.get("module_name", mod_id) if isinstance(flag_data, dict) else mod_id,
                "severity": "new",
                "classification": "first_occurrence",
                "recommendation": "This module was flagged for the first time. "
                                  "Monitor it in the next analysis run to determine if this is an isolated incident "
                                  "or the beginning of a trend.",
                "actions": ["Monitor in next run", "Review student feedback for this module"],
            })

        # ── 6. Write change_log ──────────────────────────────────────────
        if recommendations:
            _write_change_log(course_id, recommendations)

        return {
            "recommendations": recommendations,
            "historical_trend": {
                "at_risk_trend": at_risk_trend,
                "completion_trend": completion_trend,
                "trend_direction": trend_direction,
                "total_snapshots": len(history),
            },
            "structural_modules": structural_modules,
            "occasional_modules": occasional_modules,
        }

    def _fallback_sql(self, sm: SharedMemory) -> dict:
        return self._run(sm)


def _compute_trend_direction(at_risk_trend: list[dict]) -> str:
    """Determine if at-risk trend is improving, worsening, or stable."""
    if len(at_risk_trend) < 2:
        return "insufficient_data"

    recent = at_risk_trend[-1].get("at_risk_pct", 0)
    older = at_risk_trend[0].get("at_risk_pct", 0)

    diff = recent - older
    if isinstance(diff, (int, float)):
        if diff < -0.05:
            return "improving"
        elif diff > 0.05:
            return "worsening"
    return "stable"


def _generate_structural_recommendation(mod: dict) -> dict:
    """Generate recommendation for a structurally problematic module (3+ flags)."""
    mod_id = mod["module_id"]
    count = mod["flag_count"]

    return {
        "module_id": mod_id,
        "module_name": mod_id,  # Will be enriched with actual name when available
        "severity": "high",
        "classification": "structural",
        "recommendation": (
            f"This module has been flagged in {count} consecutive analysis runs, "
            f"indicating a structural issue rather than a one-off problem. "
            f"The content likely needs substantial revision."
        ),
        "actions": [
            "Review module content complexity and prerequisites",
            "Consider breaking the module into smaller sub-modules",
            "Add supplementary materials or video alternatives",
            "Consult with subject matter expert on content accuracy",
            "Review assessment alignment with learning objectives",
        ],
    }


def _generate_occasional_recommendation(mod: dict) -> dict:
    """Generate recommendation for an occasionally flagged module (1-2 flags)."""
    mod_id = mod["module_id"]
    count = mod["flag_count"]

    return {
        "module_id": mod_id,
        "module_name": mod_id,
        "severity": "medium",
        "classification": "occasional",
        "recommendation": (
            f"This module has been flagged {count} time(s). "
            f"This may be a situational issue. Continue monitoring — "
            f"if it persists for 3+ runs, it will be reclassified as structural."
        ),
        "actions": [
            "Review recent student feedback",
            "Check if recent cohort demographics changed",
            "Monitor in next 1-2 analysis runs",
        ],
    }


def _write_change_log(course_id: int, recommendations: list[dict]) -> None:
    """Append recommendations to the change_log table."""
    conn = get_db()
    if not conn:
        return
    try:
        cur = conn.cursor()
        for rec in recommendations:
            flag_reasons = rec.get("actions", [])
            cur.execute("""
                INSERT INTO change_log (course_id, module_id, flag_reason, recommendation)
                VALUES (%s, %s, %s, %s)
            """, (
                course_id,
                rec.get("module_id", "unknown"),
                flag_reasons,
                rec.get("recommendation", ""),
            ))
        conn.commit()
        cur.close()
        conn.close()
        print(f"[CurriculumAgent] Wrote {len(recommendations)} entries to change_log")
    except Exception as e:
        print(f"[CurriculumAgent] change_log write error: {e}")
        try:
            conn.close()
        except Exception:
            pass
