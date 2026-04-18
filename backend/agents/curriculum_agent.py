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
        kg_context = sm.get("kg_context", {})

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
            # Layer 1: objective update (AI applies directly)
            rec = _generate_structural_recommendation(mod)
            recommendations.append(rec)
            # Layer 3: assignment alert (professor must update manually)
            recommendations.append(_generate_assignment_alert(mod))

        for mod in occasional_modules:
            # Layer 2: reference suggestion (Tavily search, professor selects)
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
                "change_type": "reference_suggestion",
                "recommendation": "This module was flagged for the first time. "
                                  "Monitor it in the next analysis run to determine if this is an isolated incident "
                                  "or the beginning of a trend.",
                "actions": ["Monitor in next run", "Review student feedback for this module"],
            })

        # ── 5b. KG-aware recommendations (mapped to existing 3 layers) ────
        kg_insights = []
        if kg_context.get("available") and kg_context.get("flagged_with_concepts"):
            for fc in kg_context["flagged_with_concepts"]:
                mod_id = fc.get("module_id", "")
                mod_name = fc.get("module_name", mod_id)
                concepts = fc.get("concepts", [])
                prereq_gaps = fc.get("prerequisite_gaps", [])

                concept_names = [c["label"] for c in concepts[:3]]
                concept_str = ", ".join(concept_names)

                # Layer 1 — objective_update: prerequisite gaps need objective changes
                if prereq_gaps:
                    gap_strs = []
                    for gap in prereq_gaps[:2]:
                        gap_strs.append(
                            f"{gap['from_concept']} (Module {gap['from_module']}) "
                            f"→ {gap['to_concept']} (Module {gap['to_module']})"
                        )
                    rec_l1 = {
                        "module_id": mod_id,
                        "module_name": mod_name,
                        "severity": "high",
                        "classification": "kg_analysis",
                        "change_type": "objective_update",
                        "recommendation": (
                            f"Knowledge Graph prerequisite gap detected: {'; '.join(gap_strs)}. "
                            f"Consider adding a review objective for {concept_str} "
                            f"at the beginning of this module to bridge the prerequisite gap."
                        ),
                        "actions": [
                            f"KG prerequisite gap: {concept_str}",
                            "Add bridging objective for prerequisite concepts",
                        ],
                    }
                    kg_insights.append(rec_l1)
                    recommendations.append(rec_l1)

                # Layer 2 — reference_suggestion: concepts need supporting materials
                if concepts:
                    rec_l2 = {
                        "module_id": mod_id,
                        "module_name": mod_name,
                        "severity": "medium",
                        "classification": "kg_analysis",
                        "change_type": "reference_suggestion",
                        "recommendation": (
                            f"Knowledge Graph shows this module covers: {concept_str}. "
                            f"Search for supplementary readings on these concepts "
                            f"to reinforce student understanding."
                        ),
                        "actions": [
                            f"KG concepts: {concept_str}",
                            "Search for concept-aligned references",
                        ],
                    }
                    kg_insights.append(rec_l2)
                    recommendations.append(rec_l2)

                # Layer 3 — assignment_alert: if prereqs are weak, assignments may need review
                if prereq_gaps:
                    rec_l3 = {
                        "module_id": mod_id,
                        "module_name": mod_name,
                        "severity": "medium",
                        "classification": "kg_analysis",
                        "change_type": "assignment_alert",
                        "recommendation": (
                            f"Prerequisite concepts ({concept_str}) have been identified as gaps. "
                            f"Review assignments for this module to ensure they don't assume "
                            f"mastery of prerequisite material that students may not have."
                        ),
                        "actions": [
                            f"KG prerequisite review: {concept_str}",
                            "Check assignment prerequisites alignment",
                        ],
                    }
                    kg_insights.append(rec_l3)
                    recommendations.append(rec_l3)

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
            "kg_insights_count": len(kg_insights),
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
    """Generate Layer 1 recommendation: AI updates learning objectives directly (3+ flags)."""
    mod_id = mod["module_id"]
    count = mod["flag_count"]

    return {
        "module_id": mod_id,
        "module_name": mod_id,
        "severity": "high",
        "classification": "structural",
        "change_type": "objective_update",
        "recommendation": (
            f"This module has been flagged in {count} consecutive analysis runs, "
            f"indicating a structural issue. Learning objectives have been updated "
            f"to introduce scaffolding and reduce prerequisite gaps."
        ),
        "actions": [
            "Review module content complexity and prerequisites",
            "Consider breaking the module into smaller sub-modules",
            "Consult with subject matter expert on content accuracy",
        ],
    }


def _generate_occasional_recommendation(mod: dict) -> dict:
    """Generate Layer 2 recommendation: search for supporting references via Tavily (1-2 flags)."""
    mod_id = mod["module_id"]
    count = mod["flag_count"]

    return {
        "module_id": mod_id,
        "module_name": mod_id,
        "severity": "medium",
        "classification": "occasional",
        "change_type": "reference_suggestion",
        "recommendation": (
            f"This module has been flagged {count} time(s). "
            f"Current references may not fully support the learning objectives. "
            f"Search for additional references to supplement the content."
        ),
        "actions": [
            "Review recent student feedback",
            "Search for updated references aligned with learning objectives",
            "Monitor in next 1-2 analysis runs",
        ],
    }


def _generate_assignment_alert(mod: dict) -> dict:
    """Generate Layer 3 recommendation: alert professor to manually review assignments."""
    mod_id = mod["module_id"]

    return {
        "module_id": mod_id,
        "module_name": mod_id,
        "severity": "info",
        "classification": "structural",
        "change_type": "assignment_alert",
        "recommendation": (
            f"Learning objectives for this module have been updated. "
            f"Review the existing assignments to ensure they still align with the revised objectives."
        ),
        "actions": [
            "Check that assignment deliverables match updated objectives",
            "Update rubric criteria if scope has changed",
        ],
    }


def _normalize_module_id(raw_id: str) -> str:
    """Normalize module_id to 'module_N' (1-indexed) format.

    Handles:
      - 'course/27/module/0' → 'module_1'  (xAPI format, 0-indexed)
      - 'module_1' → 'module_1'  (already correct)
      - 'module/0' → 'module_1'  (partial xAPI format)
    """
    import re
    # xAPI format: course/X/module/N or module/N
    m = re.search(r'module/(\d+)', raw_id)
    if m:
        zero_idx = int(m.group(1))
        return f"module_{zero_idx + 1}"
    # Already in module_N format
    if raw_id.startswith('module_'):
        return raw_id
    return raw_id


def _write_change_log(course_id: int, recommendations: list[dict]) -> None:
    """Write recommendations to the change_log table.

    Uses replace strategy: DELETE old pending entries for this course,
    then INSERT the fresh set. Each analysis run produces a complete
    snapshot of suggestions — old pending entries are stale.
    Applied entries are preserved.
    """
    conn = get_db()
    if not conn:
        return
    try:
        cur = conn.cursor()
        # Clear stale pending entries (applied entries are preserved)
        cur.execute("""
            DELETE FROM change_log
            WHERE course_id = %s AND status = 'pending'
        """, (course_id,))
        for rec in recommendations:
            flag_reasons = rec.get("actions", [])
            change_type = rec.get("change_type", "objective_update")
            module_id = _normalize_module_id(rec.get("module_id", "unknown"))
            cur.execute("""
                INSERT INTO change_log (course_id, module_id, flag_reason, recommendation, change_type)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                course_id,
                module_id,
                flag_reasons,
                rec.get("recommendation", ""),
                change_type,
            ))
        conn.commit()
        cur.close()
        conn.close()
        print(f"[CurriculumAgent] Wrote {len(recommendations)} entries to change_log (replaced pending)")
    except Exception as e:
        print(f"[CurriculumAgent] change_log write error: {e}")
        try:
            conn.close()
        except Exception:
            pass
