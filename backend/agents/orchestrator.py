"""
Orchestrator Agent — coordinates all analysis agents with SSE streaming.

Hive-style flow:
  Orchestrator → anonymise → dispatch (parallel) → [BA, RA, CO, CC] → aggregate → de-anonymise → report
  → LTM Cold write → threshold check → flags
"""

import json
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

from agents.base import BaseNode, SharedMemory, NodeResult
from agents.behavior_analyst import BehaviorAnalystNode
from agents.risk_detector import RiskDetectorNode
from agents.content_optimizer import ContentOptimizerNode
from agents.cohort_comparator import CohortComparatorNode
from agents.kg_context_analyst import KGContextAnalystNode
from extensions import redis_client
from services.ltm_writer import write_cold_snapshot
from services.threshold_checker import check_thresholds


def _build_anon_map(course_id: int) -> dict:
    """
    Fetch all (actor_name, actor_email) pairs for the course, sorted by email
    for deterministic ordering, and return a mapping:

        { "Student_001": {"name": "Real Name", "email": "real@email.com"}, ... }

    Also returns a reverse lookup keyed by real email for fast substitution:
        { "real@email.com": {"anon_name": "Student_001", "anon_email": "student_001@anon.local"} }
    """
    try:
        from db import get_db
        conn = get_db()
        if not conn:
            return {}, {}
        cur = conn.cursor()
        prefix = f"course/{course_id}/%"
        cur.execute("""
            SELECT DISTINCT actor_name, actor_email
            FROM xapi_statements
            WHERE object_id LIKE %s
            ORDER BY actor_email
        """, (prefix,))
        rows = cur.fetchall()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"[orchestrator] anon_map build error: {e}")
        return {}, {}

    anon_map = {}       # "Student_001" → {"name": ..., "email": ...}
    reverse_map = {}    # "real@email.com" → {"anon_name": ..., "anon_email": ...}

    for idx, (real_name, real_email) in enumerate(rows, start=1):
        anon_id = f"Student_{idx:03d}"
        anon_email = f"student_{idx:03d}@anon.local"
        anon_map[anon_id] = {"name": real_name or "", "email": real_email or ""}
        if real_email:
            reverse_map[real_email] = {
                "anon_name": anon_id,
                "anon_email": anon_email,
                "real_name": real_name or "",  # needed for cohort name-string substitution
            }

    return anon_map, reverse_map


def _anonymise_agent_data(data: dict, reverse_map: dict) -> dict:
    """
    Replace real names/emails with anon IDs in any agent output that carries PII.

    Handles two output shapes:
      - risk_detector:     data["at_risk_students"] list with "name"/"email" keys
      - cohort_comparator: data["groups"][group_name]["students"] list of name strings

    All other data is returned unchanged.
    The reverse_map is keyed by real email; cohort student lists contain names,
    so we also build a name-keyed lookup from reverse_map for cohort substitution.
    """
    if not data or not reverse_map:
        return data

    import copy
    data = copy.deepcopy(data)

    # ── risk_detector: at_risk_students list ──────────────────────────────
    at_risk = data.get("at_risk_students")
    if isinstance(at_risk, list):
        for student in at_risk:
            real_email = student.get("email", "")
            mapping = reverse_map.get(real_email)
            if mapping:
                student["name"] = mapping["anon_name"]
                student["email"] = mapping["anon_email"]

    # ── cohort_comparator: groups.*.students lists (contain real names) ───
    # reverse_map values carry "real_name" (set in _build_anon_map).
    groups = data.get("groups")
    if isinstance(groups, dict):
        for group_data in groups.values():
            if not isinstance(group_data, dict):
                continue
            students_list = group_data.get("students")
            if not isinstance(students_list, list):
                continue
            group_data["students"] = [
                _anon_name_from_name(name, reverse_map) for name in students_list
            ]

    return data


def _anon_name_from_name(real_name: str, reverse_map: dict) -> str:
    """
    Look up the anon ID for a real name by scanning reverse_map values.
    reverse_map values carry "real_name" after the _build_anon_map fix below.
    Falls back to the original string if not found (safe default).
    """
    for v in reverse_map.values():
        if v.get("real_name") == real_name:
            return v["anon_name"]
    return real_name


def _deanonymise_at_risk(at_risk_students: list, anon_map: dict) -> list:
    """
    Restore real names/emails in the at_risk_students list using anon_map.
    Called only in _aggregate_report, right before building the final output.
    """
    if not at_risk_students or not anon_map:
        return at_risk_students

    import copy
    result = copy.deepcopy(at_risk_students)
    for student in result:
        anon_id = student.get("name", "")
        if anon_id in anon_map:
            student["name"] = anon_map[anon_id]["name"]
            student["email"] = anon_map[anon_id]["email"]

    return result


def _detect_module_diff(course_id: int) -> dict:
    """
    Compare current module titles in curricula.modules against the most recent
    course_analysis_snapshots.module_engagement_summary.

    Returns one of:
      {"status": "unchanged", "module_count": N}
      {"status": "changed",   "added": [...], "removed": [...], "current_count": N, "previous_count": N}
      {"status": "no_previous_snapshot"}
      {"status": "no_curriculum"}
      {"status": "error", "message": "..."}
    """
    try:
        from db import get_db
        conn = get_db()
        if not conn:
            return {"status": "error", "message": "no DB connection"}
        cur = conn.cursor()

        # ── Current module titles ─────────────────────────────────────────
        cur.execute("SELECT modules FROM curricula WHERE id = %s", (course_id,))
        row = cur.fetchone()
        if not row or not row[0]:
            cur.close()
            conn.close()
            return {"status": "no_curriculum"}

        raw = row[0]
        modules = json.loads(raw) if isinstance(raw, str) else raw
        current_names = {
            (m.get("title", f"Module {i + 1}") if isinstance(m, dict) else f"Module {i + 1}")
            for i, m in enumerate(modules)
        }

        # ── Last snapshot's module names ──────────────────────────────────
        cur.execute("""
            SELECT module_engagement_summary
            FROM course_analysis_snapshots
            WHERE course_id = %s
            ORDER BY run_at DESC
            LIMIT 1
        """, (course_id,))
        snap_row = cur.fetchone()
        cur.close()
        conn.close()

        if not snap_row or not snap_row[0]:
            return {"status": "no_previous_snapshot"}

        snap_modules = snap_row[0]
        if isinstance(snap_modules, str):
            snap_modules = json.loads(snap_modules)
        last_names = {m.get("name", "") for m in snap_modules if m.get("name")}

        added   = sorted(current_names - last_names)
        removed = sorted(last_names - current_names)

        if not added and not removed:
            return {"status": "unchanged", "module_count": len(current_names)}

        return {
            "status": "changed",
            "added":           added,
            "removed":         removed,
            "current_count":   len(current_names),
            "previous_count":  len(last_names),
        }
    except Exception as e:
        print(f"[orchestrator] module diff error: {e}")
        return {"status": "error", "message": str(e)}


class OrchestratorNode(BaseNode):
    name = "orchestrator"
    description = "Coordinates multi-agent analysis pipeline"
    model = "sql-only"
    required_output_keys = []  # Orchestrator validates sub-results

    def __init__(self):
        self.agents = [
            BehaviorAnalystNode(),
            RiskDetectorNode(),
            ContentOptimizerNode(),
            CohortComparatorNode(),
        ]

    def _run(self, sm: SharedMemory) -> dict:
        """Execute all agents and aggregate results."""
        results = {}
        for agent in self.agents:
            result = agent.execute(sm)
            results[agent.name] = {
                "status": result.status,
                "data": result.data,
                "duration_ms": result.duration_ms,
                "retries_used": result.retries_used,
                "error": result.error,
            }
        return results

    def _fallback_sql(self, sm: SharedMemory) -> dict:
        return self._run(sm)

    def run_analysis(self, course_id: int):
        """
        Generator that yields SSE events as agents execute.
        Used by the /api/analytics/report endpoint.
        """
        session_id = str(uuid.uuid4())[:8]
        sm = SharedMemory(session_id, redis_client)
        sm.set("course_id", course_id)

        # ── Step 1: Detect module structure changes before dispatching ────────
        module_diff = _detect_module_diff(course_id)
        if module_diff.get("status") == "changed":
            added_n   = len(module_diff.get("added", []))
            removed_n = len(module_diff.get("removed", []))
            yield _sse_event(
                "orchestrator", "structure_changed",
                f"⚠️ Module structure changed since last analysis — "
                f"{added_n} added, {removed_n} removed. "
                f"Historical comparisons may not be valid.",
                module_diff,
            )

        # ── Step 2: Anonymise student data before dispatching ──────────────
        yield f"data: {json.dumps({'status': 'anonymising', 'message': '🔒 Anonymising student data before analysis...'})}\n\n"

        anon_map, reverse_map = _build_anon_map(course_id)
        sm.set("_anon_map", anon_map)

        yield _sse_event("orchestrator", "dispatching", "Distributing analysis tasks...")

        agent_results = {}
        start_total = time.time()

        for agent in self.agents:
            yield _sse_event(agent.name, "running", f"Running {agent.description}...")

            start = time.time()
            try:
                result = agent.execute(sm)
            except Exception:
                duration = int((time.time() - start) * 1000)
                agent_results[agent.name] = {
                    "status": "error",
                    "data": {},
                    "duration_ms": duration,
                    "retries_used": 0,
                    "error": "Agent encountered an error processing course data",
                }
                yield _sse_event(agent.name, "error", "Agent encountered an error processing course data")
                continue

            duration = int((time.time() - start) * 1000)

            # Anonymise PII in agent output before storing or streaming
            safe_data = _anonymise_agent_data(result.data, reverse_map)

            # Sanitise error message — never expose raw exception text to SSE
            safe_error = None
            if result.error:
                safe_error = "Agent encountered an error processing course data"

            agent_results[agent.name] = {
                "status": result.status,
                "data": safe_data,
                "duration_ms": duration,
                "retries_used": result.retries_used,
                "error": safe_error,
                "tokens_in": result.tokens_in,
                "tokens_out": result.tokens_out,
                "tokens_cache_read": result.tokens_cache_read,
            }

            if result.status == "success":
                yield _sse_event(agent.name, "done", f"Completed in {duration}ms", safe_data)
            elif result.status == "fallback":
                yield _sse_event(agent.name, "fallback",
                    f"⚠️ Primary failed after {result.retries_used} retries — using fallback ({duration}ms)", safe_data)
            else:
                yield _sse_event(agent.name, "error", safe_error or "Agent encountered an error processing course data")

        # Aggregate final report
        yield _sse_event("orchestrator", "aggregating", "Synthesizing final report...")

        report = self._aggregate_report(course_id, agent_results, anon_map, module_diff)
        total_ms = int((time.time() - start_total) * 1000)

        # Cache in shared memory
        sm.set("final_report", report)

        yield _sse_event("report", "report_ready", f"Report aggregated in {total_ms}ms", report)

        # ── LTM Cold write ─────────────────────────────────────────────────
        try:
            ltm_path = write_cold_snapshot(report)
            if ltm_path:
                yield _sse_event("orchestrator", "ltm_written",
                    "📝 Analysis snapshot saved to long-term memory")
            else:
                yield _sse_event("orchestrator", "ltm_warning",
                    "⚠️ LTM snapshot skipped — missing course_id")
        except Exception as e:
            print(f"[Orchestrator] LTM Cold write error: {e}")
            yield _sse_event("orchestrator", "ltm_error",
                "⚠️ Failed to save analysis snapshot to long-term memory")

        # ── Mastery Sync ───────────────────────────────────────────────────
        try:
            from services.mastery_tracker import sync_concept_mastery
            from services.kg_mapper import get_kg_mapping_for_course
            kg_mapping = get_kg_mapping_for_course(course_id)
            if kg_mapping and kg_mapping.get("module_concepts"):
                yield _sse_event("orchestrator", "mastery_syncing",
                    "📊 Syncing concept mastery from xAPI + feedback data...")
                sync_concept_mastery(course_id, kg_mapping, semester="")
                yield _sse_event("orchestrator", "mastery_synced",
                    "✅ Concept mastery updated")
        except Exception as e:
            print(f"[Orchestrator] Mastery sync error: {e}")

        # ── Threshold check ────────────────────────────────────────────────
        flags = []
        try:
            flags = check_thresholds(report)
            if flags:
                orange_flags = [f for f in flags if f["flag_level"] == "orange"]
                yellow_flags = [f for f in flags if f["flag_level"] == "yellow"]
                yield _sse_event("orchestrator", "flags_detected",
                    f"⚠️ {len(flags)} module(s) flagged ({len(orange_flags)} require review)",
                    {"flags": flags, "orange_count": len(orange_flags), "yellow_count": len(yellow_flags)})
            else:
                yield _sse_event("orchestrator", "flags_clear",
                    "✅ No modules flagged — all within normal parameters")
        except Exception as e:
            print(f"[Orchestrator] Threshold check error: {e}")
            yield _sse_event("orchestrator", "threshold_error",
                "⚠️ Threshold check failed — flags may be incomplete")

        # ── Mastery Sync ───────────────────────────────────────────────────
        try:
            yield _sse_event("orchestrator", "mastery_running", "🔄 Syncing concept mastery tracking...")
            from services.mastery_tracker import sync_concept_mastery
            from services.kg_mapper import get_kg_mapping_for_course
            kg_mapping = get_kg_mapping_for_course(course_id)
            if kg_mapping and kg_mapping.get("module_concepts"):
                sync_concept_mastery(course_id, kg_mapping, semester="")
            yield _sse_event("orchestrator", "mastery_done", "✅ Concept mastery synced")
        except Exception as e:
            print(f"[Orchestrator] Mastery sync error: {e}")
            yield _sse_event("orchestrator", "mastery_error", "⚠️ Mastery sync failed")

        # ── KG Context Analyst — enrich flags with KG data ─────────────────
        kg_context_data = {}
        try:
            yield _sse_event("orchestrator", "kg_context_running",
                "🧠 Analyzing Knowledge Graph context for flagged modules...")
            kg_sm = SharedMemory(f"kg-{course_id}-auto", redis_client)
            kg_sm.set("course_id", course_id)
            kg_sm.set("flagged_modules", flags)
            kg_agent = KGContextAnalystNode()
            kg_result = kg_agent.execute(kg_sm)
            kg_context_data = (kg_result.data or {}).get("kg_context", {})
            has_kg = kg_context_data.get("available", False)
            flagged_count = len(kg_context_data.get("flagged_with_concepts", []))
            if has_kg and flagged_count > 0:
                yield _sse_event("orchestrator", "kg_context_done",
                    f"✅ KG Context: {flagged_count} flagged module(s) enriched with concept data",
                    kg_context_data)
            elif has_kg:
                yield _sse_event("orchestrator", "kg_context_done",
                    "✅ KG available but no flagged modules have concept matches",
                    kg_context_data)
            else:
                yield _sse_event("orchestrator", "kg_context_skipped",
                    "ℹ️ No Knowledge Graph available for this course — skipping KG enrichment")
        except Exception as e:
            print(f"[Orchestrator] KG Context Analyst error: {e}")
            yield _sse_event("orchestrator", "kg_context_error",
                "⚠️ KG Context Analyst failed — proceeding without KG data")

        # ── Curriculum Agent — auto-run after flags + KG context ───────────
        try:
            from agents.curriculum_agent import CurriculumAgentNode
            yield _sse_event("orchestrator", "curriculum_running",
                "🤖 Running Curriculum Agent to generate suggestions...")
            ca_sm = SharedMemory(f"curriculum-{course_id}-auto", redis_client)
            ca_sm.set("course_id", course_id)
            ca_sm.set("flagged_modules", flags)
            ca_sm.set("kg_context", kg_context_data)
            ca_agent = CurriculumAgentNode()
            ca_result = ca_agent.execute(ca_sm)
            rec_count = len((ca_result.data or {}).get("recommendations", []))
            yield _sse_event("orchestrator", "curriculum_done",
                f"✅ Curriculum Agent generated {rec_count} suggestion(s)",
                ca_result.data or {})
        except Exception as e:
            print(f"[Orchestrator] Curriculum Agent error: {e}")
            yield _sse_event("orchestrator", "curriculum_error",
                "⚠️ Curriculum Agent failed — suggestions may be unavailable")

        # ── Pipeline complete — frontend closes EventSource here ──────────
        pipeline_ms = int((time.time() - start_total) * 1000)
        yield _sse_event("report", "done", f"Pipeline complete in {pipeline_ms}ms", report)

    def run_analysis_sync(self, course_id: int) -> dict:
        """Non-streaming version — returns complete report dict."""
        session_id = str(uuid.uuid4())[:8]
        sm = SharedMemory(session_id, redis_client)
        sm.set("course_id", course_id)

        anon_map, reverse_map = _build_anon_map(course_id)
        sm.set("_anon_map", anon_map)

        agent_results = {}
        for agent in self.agents:
            try:
                result = agent.execute(sm)
            except Exception:
                agent_results[agent.name] = {
                    "status": "error",
                    "data": {},
                    "duration_ms": 0,
                    "retries_used": 0,
                    "error": "Agent encountered an error processing course data",
                }
                continue

            safe_data = _anonymise_agent_data(result.data, reverse_map)
            safe_error = "Agent encountered an error processing course data" if result.error else None

            agent_results[agent.name] = {
                "status": result.status,
                "data": safe_data,
                "duration_ms": result.duration_ms,
                "retries_used": result.retries_used,
                "error": safe_error,
                "tokens_in": result.tokens_in,
                "tokens_out": result.tokens_out,
                "tokens_cache_read": result.tokens_cache_read,
            }

        module_diff = _detect_module_diff(course_id)
        report = self._aggregate_report(course_id, agent_results, anon_map, module_diff)

        # LTM Cold write + Threshold check + Curriculum Agent (sync path)
        try:
            write_cold_snapshot(report)
        except Exception as e:
            print(f"[Orchestrator] LTM Cold write error (non-fatal): {e}")

        flags = []
        try:
            flags = check_thresholds(report)
        except Exception as e:
            print(f"[Orchestrator] Threshold check error (non-fatal): {e}")

        # Mastery Sync (sync path)
        try:
            from services.mastery_tracker import sync_concept_mastery
            from services.kg_mapper import get_kg_mapping_for_course
            kg_mapping = get_kg_mapping_for_course(course_id)
            if kg_mapping and kg_mapping.get("module_concepts"):
                sync_concept_mastery(course_id, kg_mapping, semester="")
        except Exception as e:
            print(f"[Orchestrator] Mastery sync error (non-fatal): {e}")

        # KG Context Analyst (sync path)
        kg_context_data = {}
        try:
            kg_sm = SharedMemory(f"kg-{course_id}-sync", redis_client)
            kg_sm.set("course_id", course_id)
            kg_sm.set("flagged_modules", flags)
            kg_agent = KGContextAnalystNode()
            kg_result = kg_agent.execute(kg_sm)
            kg_context_data = (kg_result.data or {}).get("kg_context", {})
        except Exception as e:
            print(f"[Orchestrator] KG Context Analyst error (non-fatal): {e}")

        try:
            from agents.curriculum_agent import CurriculumAgentNode
            ca_sm = SharedMemory(f"curriculum-{course_id}-sync", redis_client)
            ca_sm.set("course_id", course_id)
            ca_sm.set("flagged_modules", flags)
            ca_sm.set("kg_context", kg_context_data)
            ca_agent = CurriculumAgentNode()
            ca_agent.execute(ca_sm)
        except Exception as e:
            print(f"[Orchestrator] Curriculum Agent error (non-fatal): {e}")

        return report

    def _aggregate_report(self, course_id: int, agent_results: dict, anon_map: dict = None, module_diff: dict = None) -> dict:
        """Synthesize all agent outputs into a unified report."""
        ba = agent_results.get("behavior_analyst", {}).get("data", {})
        ra = agent_results.get("risk_detector", {}).get("data", {})
        co = agent_results.get("content_optimizer", {}).get("data", {})
        cc = agent_results.get("cohort_comparator", {}).get("data", {})

        # ── De-anonymise at_risk_students for the final report ─────────────
        # Agent outputs stay anonymised; real names are only restored here,
        # immediately before the report is assembled for the professor/exporter.
        if anon_map and ra.get("at_risk_students"):
            import copy
            ra = copy.deepcopy(ra)
            ra["at_risk_students"] = _deanonymise_at_risk(ra["at_risk_students"], anon_map)

        # ── Fetch course metadata ──────────────────────────────────────────
        course_meta = {"topic": f"Course #{course_id}", "level": "", "course_type": "", "course_code": "", "module_count": 0}
        try:
            from db import get_db
            conn = get_db()
            if conn:
                cur = conn.cursor()
                cur.execute(
                    "SELECT topic, level, course_type, course_code, module_count FROM curricula WHERE id = %s",
                    (course_id,),
                )
                row = cur.fetchone()
                if row:
                    course_meta = {
                        "topic": row[0] or f"Course #{course_id}",
                        "level": row[1] or "",
                        "course_type": row[2] or "",
                        "course_code": row[3] or "",
                        "module_count": row[4] or 0,
                    }
                cur.close()
                conn.close()
        except Exception as e:
            print(f"Course meta lookup error: {e}")

        # Executive summary
        total_students = ra.get("total_students_analyzed", 0)
        at_risk_count = len(ra.get("at_risk_students", []))
        high_risk = [s for s in ra.get("at_risk_students", []) if s.get("risk_level") == "high"]
        struggling_modules = co.get("underperforming_content", [])

        summary_points = []

        # ── Module structure change warning (prepended so it's seen first) ──
        if module_diff and module_diff.get("status") == "changed":
            added   = module_diff.get("added", [])
            removed = module_diff.get("removed", [])
            parts = []
            if added:
                sample = ", ".join(added[:2]) + ("…" if len(added) > 2 else "")
                parts.append(f"{len(added)} added ({sample})")
            if removed:
                sample = ", ".join(removed[:2]) + ("…" if len(removed) > 2 else "")
                parts.append(f"{len(removed)} removed ({sample})")
            summary_points.append(
                f"⚠ Module structure changed since last analysis — {'; '.join(parts)}. "
                f"Historical comparisons may not be valid."
            )

        if total_students > 0:
            summary_points.append(f"{total_students} students analyzed")
        if at_risk_count > 0:
            summary_points.append(f"{at_risk_count} students at risk ({len(high_risk)} high-risk)")
        if struggling_modules:
            summary_points.append(f"{len(struggling_modules)} modules need attention")

        groups = cc.get("groups", {})
        hp_count = groups.get("high_performers", {}).get("count", 0)
        if hp_count > 0:
            summary_points.append(f"{hp_count} high-performing students identified")

        # ── Feedback signal summary ───────────────────────────────────────────
        fb_signals = co.get("feedback_signals", [])
        if fb_signals:
            total_fb = sum(fb.get("total_feedback", 0) for fb in fb_signals)
            total_skip = sum(fb.get("skip_count", 0) for fb in fb_signals)
            total_confused = sum(fb.get("confused", 0) for fb in fb_signals)
            cross_flag_count = sum(len(fb.get("cross_flags", [])) for fb in fb_signals)
            if total_fb > 0:
                summary_points.append(f"{total_fb} feedback responses collected ({total_skip} skips)")
            if total_confused > 0:
                summary_points.append(f"{total_confused} 'confused' signals across {len([fb for fb in fb_signals if fb.get('confused', 0) > 0])} modules")
            if cross_flag_count > 0:
                summary_points.append(f"⚠ {cross_flag_count} cross-validation flags detected")

        # ── Time-on-task summary ──────────────────────────────────────────────
        time_on_task = ba.get("time_on_task", [])
        if time_on_task:
            total_outliers = sum(t.get("outlier_count", 0) for t in time_on_task)
            idle_count = sum((t.get("outlier_labels") or {}).get("likely_idle", 0) for t in time_on_task)
            struggling_count = sum((t.get("outlier_labels") or {}).get("struggling_engaged", 0) for t in time_on_task)
            if total_outliers > 0:
                summary_points.append(f"{total_outliers} time-on-task outliers detected ({struggling_count} struggling, {idle_count} likely idle)")

        # ── Token usage summary ───────────────────────────────────────────────
        total_in = sum(r.get("tokens_in", 0) for r in agent_results.values())
        total_out = sum(r.get("tokens_out", 0) for r in agent_results.values())
        total_cache_read = sum(r.get("tokens_cache_read", 0) for r in agent_results.values())
        total_cache_write = sum(r.get("tokens_cache_write", 0) for r in agent_results.values())

        # Print token summary to backend log for visibility
        print("\n[Token Usage] ─────────────────────────────────")
        for name, r in agent_results.items():
            tin = r.get("tokens_in", 0)
            tout = r.get("tokens_out", 0)
            if tin or tout:
                print(f"  {name:25s}  in={tin:>6}  out={tout:>5}  cache_read={r.get('tokens_cache_read',0):>6}")
            else:
                print(f"  {name:25s}  sql-only (no LLM)")
        print(f"  {'TOTAL':25s}  in={total_in:>6}  out={total_out:>5}  cache_read={total_cache_read:>6}")
        print("────────────────────────────────────────────────\n")

        report = {
            "course_id": course_id,
            "course_meta": course_meta,
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "executive_summary": summary_points,
            "behavior_analysis": ba,
            "risk_assessment": ra,
            "content_optimization": co,
            "cohort_comparison": cc,
            "agent_performance": {
                name: {
                    "status": r["status"],
                    "duration_ms": r["duration_ms"],
                    "retries": r["retries_used"],
                    "tokens_in": r.get("tokens_in", 0),
                    "tokens_out": r.get("tokens_out", 0),
                    "tokens_cache_read": r.get("tokens_cache_read", 0),
                }
                for name, r in agent_results.items()
            },
            "token_summary": {
                "total_in": total_in,
                "total_out": total_out,
                "cache_read": total_cache_read,
                "cache_write": total_cache_write,
                "llm_used": total_in > 0 or total_out > 0,
            },
            "module_structure_diff": module_diff or {"status": "unknown"},
        }
        self._save_snapshot(report)
        return report

    def _save_snapshot(self, report: dict) -> None:
        """Persist a summary snapshot of this analysis run for LTM."""
        try:
            from db import get_db
            conn = get_db()
            if not conn:
                report["_ltm_warm_status"] = "error: no DB connection"
                return
            cur = conn.cursor()
            ra = report.get("risk_assessment", {})
            ba = report.get("behavior_analysis", {})
            cc = report.get("cohort_comparison", {})

            risk_dist = ra.get("risk_distribution", {})
            at_risk = ra.get("at_risk_students", [])
            high_risk_count = sum(1 for s in at_risk if s.get("risk_level") == "high")

            # Top signals: collect all unique signals from at-risk students
            signals = []
            for s in at_risk[:10]:
                signals.extend(s.get("signals", []))
            top_signals = list(dict.fromkeys(signals))[:8]  # dedupe, keep order, cap at 8

            # Module engagement summary: just name + completion_rate
            modules = ba.get("module_engagement", [])
            mod_summary = [{"name": m.get("module_name", ""), "completion_rate": m.get("completion_rate", 0)} for m in modules]

            # Read current noise label from Redis
            noise_label = "unknown"
            try:
                from extensions import redis_client
                if redis_client:
                    val = redis_client.get("plotark:current_noise")
                    if val:
                        ratio = float(val)
                        noise_label = f"{int(ratio * 100)}pct"
            except Exception:
                pass

            cur.execute("""
                INSERT INTO course_analysis_snapshots
                    (course_id, risk_distribution, total_students, at_risk_count, high_risk_count,
                     top_signals, module_engagement_summary, verb_distribution, cohort_groups,
                     noise_label)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                report.get("course_id"),
                json.dumps(risk_dist),
                ra.get("total_students_analyzed", 0),
                len(at_risk),
                high_risk_count,
                json.dumps(top_signals),
                json.dumps(mod_summary),
                json.dumps(ba.get("verb_distribution", {})),
                json.dumps(cc.get("groups", {})),
                noise_label,
            ))
            conn.commit()
            cur.close()
            conn.close()
            report["_ltm_warm_status"] = "saved"
        except Exception as e:
            print(f"[Orchestrator] Snapshot save error (non-fatal): {e}")
            report["_ltm_warm_status"] = f"error: {type(e).__name__}"


def _sse_event(agent: str, status: str, message: str, result: dict = None) -> str:
    """Format as Server-Sent Event."""
    data = {"agent": agent, "status": status, "message": message}
    if result is not None:
        data["result"] = result
    return f"data: {json.dumps(data, default=str)}\n\n"
