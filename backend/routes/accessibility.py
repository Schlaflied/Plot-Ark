"""Accessibility check routes. Advisory only; findings use the accept/reject/revise flow."""

from flask import Blueprint, request, jsonify

from services.accessibility_check import check_accessibility, AccessibilityCheckError
from services import accessibility_review as review

accessibility_bp = Blueprint("accessibility", __name__)


@accessibility_bp.route("/api/materials/accessibility-check", methods=["POST"])
def accessibility_check():
    """Multipart: file (HTML or DOCX), optional course_id (saves findings for review)."""
    f = request.files.get("file")
    if not f:
        return jsonify({"error": "file is required"}), 400
    try:
        report = check_accessibility(f.filename or "", f.read())
    except AccessibilityCheckError as e:
        return jsonify({"error": str(e)}), 400
    course_id = request.form.get("course_id", type=int)
    if course_id and report["findings"]:
        try:
            review.save_findings(course_id, report["filename"], report["findings"])
        except review.ReviewError as e:
            return jsonify({"error": str(e)}), e.status
    return jsonify(report)


@accessibility_bp.route("/api/materials/accessibility-check/<int:course_id>", methods=["GET"])
def list_accessibility_findings(course_id):
    try:
        return jsonify({"course_id": course_id, "findings": review.list_findings(course_id)})
    except review.ReviewError as e:
        return jsonify({"error": str(e)}), e.status


@accessibility_bp.route("/api/materials/accessibility-check/<int:finding_id>/decision", methods=["POST"])
def decide_accessibility_finding(finding_id):
    """Body: {"decision": "accept"|"reject"|"revise", "revised_text"?: str}."""
    data = request.get_json(silent=True) or {}
    try:
        finding = review.record_decision(finding_id, data.get("decision"), data.get("revised_text", ""))
    except review.ReviewError as e:
        return jsonify({"error": str(e)}), e.status
    return jsonify({"finding": finding})
