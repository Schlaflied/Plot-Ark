"""Analytics routes — SSE streaming A2A analysis + export endpoints."""

import json
from flask import Blueprint, request, jsonify, Response
from agents.orchestrator import OrchestratorNode

analytics_bp = Blueprint("analytics", __name__)

_orchestrator = OrchestratorNode()


@analytics_bp.route("/api/analytics/report/<int:course_id>", methods=["GET"])
def stream_analysis(course_id):
    """
    SSE endpoint: streams agent progress and final report.
    Connect with EventSource from the frontend.
    """
    def generate():
        for event in _orchestrator.run_analysis(course_id):
            yield event

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@analytics_bp.route("/api/analytics/report/<int:course_id>/sync", methods=["GET"])
def sync_analysis(course_id):
    """Non-streaming version: returns full JSON report."""
    report = _orchestrator.run_analysis_sync(course_id)
    return jsonify(report)


@analytics_bp.route("/api/analytics/risks/<int:course_id>", methods=["GET"])
def get_risks(course_id):
    """Quick risk query — runs only the risk detector agent."""
    from agents.risk_detector import RiskDetectorNode
    from agents.base import SharedMemory
    from extensions import redis_client

    sm = SharedMemory(f"risk-{course_id}", redis_client)
    sm.set("course_id", course_id)
    result = RiskDetectorNode().execute(sm)
    return jsonify(result.data)


@analytics_bp.route("/api/analytics/optimize/<int:course_id>", methods=["GET"])
def get_optimization(course_id):
    """Quick content optimization query."""
    from agents.content_optimizer import ContentOptimizerNode
    from agents.base import SharedMemory
    from extensions import redis_client

    sm = SharedMemory(f"opt-{course_id}", redis_client)
    sm.set("course_id", course_id)
    result = ContentOptimizerNode().execute(sm)
    return jsonify(result.data)


@analytics_bp.route("/api/analytics/cohort/<int:course_id>", methods=["GET"])
def get_cohort(course_id):
    """Quick cohort comparison query."""
    from agents.cohort_comparator import CohortComparatorNode
    from agents.base import SharedMemory
    from extensions import redis_client

    sm = SharedMemory(f"coh-{course_id}", redis_client)
    sm.set("course_id", course_id)
    result = CohortComparatorNode().execute(sm)
    return jsonify(result.data)


@analytics_bp.route("/api/analytics/export/pdf/<int:course_id>", methods=["GET"])
def export_pdf(course_id):
    """Generate and download PDF report with charts."""
    from services.report_exporter import ReportExporter

    report = _orchestrator.run_analysis_sync(course_id)
    exporter = ReportExporter()
    pdf_bytes = exporter.export_pdf(report)

    return Response(
        pdf_bytes,
        mimetype="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=plot-ark-report-{course_id}.pdf",
        },
    )


@analytics_bp.route("/api/analytics/export/docx/<int:course_id>", methods=["GET"])
def export_docx(course_id):
    """Generate and download DOCX report with charts."""
    from services.report_exporter import ReportExporter

    report = _orchestrator.run_analysis_sync(course_id)
    exporter = ReportExporter()
    docx_bytes = exporter.export_docx(report)

    return Response(
        docx_bytes,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f"attachment; filename=plot-ark-report-{course_id}.docx",
        },
    )


@analytics_bp.route("/api/analytics/export/excel/<int:course_id>", methods=["GET"])
def export_excel(course_id):
    """Generate and download Excel report with raw data + summary."""
    from services.report_exporter import ReportExporter

    report = _orchestrator.run_analysis_sync(course_id)
    exporter = ReportExporter()
    xlsx_bytes = exporter.export_excel(report, course_id)

    return Response(
        xlsx_bytes,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename=plot-ark-data-{course_id}.xlsx",
        },
    )
