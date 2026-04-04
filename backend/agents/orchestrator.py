"""
Orchestrator Agent — coordinates all analysis agents with SSE streaming.

Hive-style flow:
  Orchestrator → anonymise → dispatch (parallel) → [BA, RA, CO, CC] → aggregate → de-anonymise → report
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
from extensions import redis_client


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

        # ── Step 1: Anonymise student data before dispatching ──────────────
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
                yield _sse_event(agent.name, "done", f"Completed via fallback in {duration}ms", safe_data)
            else:
                yield _sse_event(agent.name, "error", safe_error or "Agent encountered an error processing course data")

        # Aggregate final report
        yield _sse_event("orchestrator", "aggregating", "Synthesizing final report...")

        report = self._aggregate_report(course_id, agent_results, anon_map)
        total_ms = int((time.time() - start_total) * 1000)

        # Cache in shared memory
        sm.set("final_report", report)

        yield _sse_event("report", "done", f"Analysis complete in {total_ms}ms", report)

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

        return self._aggregate_report(course_id, agent_results, anon_map)

    def _aggregate_report(self, course_id: int, agent_results: dict, anon_map: dict = None) -> dict:
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
        }
        self._save_snapshot(report)
        return report

    def _save_snapshot(self, report: dict) -> None:
        """Persist a summary snapshot of this analysis run for LTM."""
        try:
            from db import get_db
            conn = get_db()
            if not conn:
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
        except Exception as e:
            print(f"[Orchestrator] Snapshot save error (non-fatal): {e}")


def _sse_event(agent: str, status: str, message: str, result: dict = None) -> str:
    """Format as Server-Sent Event."""
    data = {"agent": agent, "status": status, "message": message}
    if result is not None:
        data["result"] = result
    return f"data: {json.dumps(data, default=str)}\n\n"
