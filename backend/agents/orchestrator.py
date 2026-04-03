"""
Orchestrator Agent — coordinates all analysis agents with SSE streaming.

Hive-style flow:
  Orchestrator → dispatch (parallel) → [BA, RA, CO, CC] → aggregate → report
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

        yield _sse_event("orchestrator", "dispatching", "Distributing analysis tasks...")

        agent_results = {}
        start_total = time.time()

        for agent in self.agents:
            yield _sse_event(agent.name, "running", f"Running {agent.description}...")

            start = time.time()
            result = agent.execute(sm)
            duration = int((time.time() - start) * 1000)

            agent_results[agent.name] = {
                "status": result.status,
                "data": result.data,
                "duration_ms": duration,
                "retries_used": result.retries_used,
                "error": result.error,
            }

            if result.status == "success":
                yield _sse_event(agent.name, "done", f"Completed in {duration}ms", result.data)
            elif result.status == "fallback":
                yield _sse_event(agent.name, "done", f"Completed via fallback in {duration}ms", result.data)
            else:
                yield _sse_event(agent.name, "error", f"Failed: {result.error}")

        # Aggregate final report
        yield _sse_event("orchestrator", "aggregating", "Synthesizing final report...")

        report = self._aggregate_report(course_id, agent_results)
        total_ms = int((time.time() - start_total) * 1000)

        # Cache in shared memory
        sm.set("final_report", report)

        yield _sse_event("report", "done", f"Analysis complete in {total_ms}ms", report)

    def run_analysis_sync(self, course_id: int) -> dict:
        """Non-streaming version — returns complete report dict."""
        session_id = str(uuid.uuid4())[:8]
        sm = SharedMemory(session_id, redis_client)
        sm.set("course_id", course_id)

        agent_results = {}
        for agent in self.agents:
            result = agent.execute(sm)
            agent_results[agent.name] = {
                "status": result.status,
                "data": result.data,
                "duration_ms": result.duration_ms,
                "retries_used": result.retries_used,
                "error": result.error,
            }

        return self._aggregate_report(course_id, agent_results)

    def _aggregate_report(self, course_id: int, agent_results: dict) -> dict:
        """Synthesize all agent outputs into a unified report."""
        ba = agent_results.get("behavior_analyst", {}).get("data", {})
        ra = agent_results.get("risk_detector", {}).get("data", {})
        co = agent_results.get("content_optimizer", {}).get("data", {})
        cc = agent_results.get("cohort_comparator", {}).get("data", {})

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

        return {
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
                }
                for name, r in agent_results.items()
            },
        }


def _sse_event(agent: str, status: str, message: str, result: dict = None) -> str:
    """Format as Server-Sent Event."""
    data = {"agent": agent, "status": status, "message": message}
    if result is not None:
        data["result"] = result
    return f"data: {json.dumps(data, default=str)}\n\n"
