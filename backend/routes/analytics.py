"""Analytics routes — SSE streaming A2A analysis + export endpoints."""

import json
import re
from flask import Blueprint, request, jsonify, Response
from agents.orchestrator import OrchestratorNode


def _export_filename(report: dict, ext: str) -> str:
    """Build a safe filename: course-name-noiseXXpct.ext"""
    topic = report.get("course_meta", {}).get("topic", "") or f"course-{report.get('course_id', 0)}"
    slug = re.sub(r"[^a-z0-9]+", "-", topic.lower()).strip("-")[:40]
    noise_label = "unknown"
    try:
        from extensions import redis_client
        if redis_client:
            val = redis_client.get("plotark:current_noise")
            if val:
                noise_label = f"noise{int(float(val) * 100)}pct"
    except Exception:
        pass
    return f"{slug}-{noise_label}.{ext}"

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
            "Content-Disposition": f"attachment; filename={_export_filename(report, 'pdf')}",
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
            "Content-Disposition": f"attachment; filename={_export_filename(report, 'docx')}",
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
            "Content-Disposition": f"attachment; filename={_export_filename(report, 'xlsx')}",
        },
    )


@analytics_bp.route("/api/analytics/history/<int:course_id>", methods=["GET"])
def get_analysis_history(course_id):
    """Return historical analysis snapshots from the Warm layer.
    Used by the frontend to draw a trend chart showing at-risk % and
    completion rate over time."""
    from db import get_db

    limit = request.args.get("limit", 20, type=int)

    conn = get_db()
    if not conn:
        return jsonify({"history": [], "error": "Database unavailable"}), 500

    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, run_at, total_students, at_risk_count, high_risk_count,
                   module_engagement_summary, noise_label, is_favorite
            FROM course_analysis_snapshots
            WHERE course_id = %s
            ORDER BY run_at DESC
            LIMIT %s
        """, (course_id, limit))

        history = []
        for row in cur.fetchall():
            snap_id, run_at, total, at_risk, high_risk, mod_summary_json, noise, is_fav = row
            avg_completion = 0
            if mod_summary_json:
                mods = mod_summary_json if isinstance(mod_summary_json, list) else json.loads(mod_summary_json)
                rates = [m.get("completion_rate", 0) for m in mods if isinstance(m, dict)]
                avg_completion = round(sum(rates) / max(len(rates), 1), 3)

            at_risk_pct = round(at_risk / max(total, 1), 3)

            history.append({
                "id": snap_id,
                "run_at": run_at.isoformat() if run_at else None,
                "total_students": total,
                "at_risk_count": at_risk,
                "at_risk_pct": at_risk_pct,
                "high_risk_count": high_risk,
                "avg_completion_rate": avg_completion,
                "noise_label": noise,
                "is_favorite": bool(is_fav),
            })

        cur.close()
        conn.close()
        return jsonify({"history": history, "course_id": course_id})
    except Exception as e:
        conn.close()
        return jsonify({"history": [], "error": str(e)}), 500


@analytics_bp.route("/api/analytics/history/snapshot/<int:snapshot_id>/favorite", methods=["POST"])
def toggle_snapshot_favorite(snapshot_id):
    """Toggle the is_favorite flag on an analysis snapshot."""
    from db import get_db
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        cur.execute("UPDATE course_analysis_snapshots SET is_favorite = NOT is_favorite WHERE id = %s RETURNING is_favorite", (snapshot_id,))
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        if not row:
            return jsonify({"error": "Not found"}), 404
        return jsonify({"id": snapshot_id, "is_favorite": bool(row[0])})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/api/analytics/history/snapshot/<int:snapshot_id>", methods=["DELETE"])
def delete_snapshot(snapshot_id):
    """Remove an analysis snapshot from history."""
    from db import get_db
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM course_analysis_snapshots WHERE id = %s", (snapshot_id,))
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"status": "deleted", "id": snapshot_id})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500

