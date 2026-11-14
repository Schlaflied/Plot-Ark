"""Feedback triage routes: cluster open-text learner feedback into topics and
propose an escalation list. Advisory only; proposals go through accept / reject /
revise and are stored in change_log (so they reach LTM snapshots when applied).
"""

import json

from flask import Blueprint, request, jsonify

from services import feedback_triage as triage
from services import feedback_triage_review as review

feedback_triage_bp = Blueprint("feedback_triage", __name__)


@feedback_triage_bp.route("/api/feedback-triage/analyze", methods=["POST"])
def analyze_feedback():
    """Either multipart (file=<csv>, course_id, optional config=<json>) or JSON
    {"course_id": int, "csv": str | "comments": [...], "config": {...}}.
    CSV columns: learner_id, comment, optional course_ref."""
    try:
        if request.files.get("file"):
            course_id = request.form.get("course_id")
            raw_config = request.form.get("config")
            config = json.loads(raw_config) if raw_config else None
            rows = triage.parse_feedback_csv(
                request.files["file"].read().decode("utf-8-sig", errors="replace"))
        else:
            data = request.get_json(silent=True) or {}
            course_id = data.get("course_id")
            config = data.get("config")
            if "comments" in data:
                rows = data["comments"]
                if not isinstance(rows, list):
                    raise ValueError("comments must be a list")
            elif "csv" in data:
                csv_text = data["csv"]
                if csv_text is not None and not isinstance(csv_text, str):
                    raise ValueError("csv must be a string")
                rows = triage.parse_feedback_csv(csv_text or "")
            else:
                raise ValueError("Request must include either 'comments' or 'csv'")
        result = triage.triage_feedback(rows, config)
    except (ValueError, TypeError) as e:
        return jsonify({"error": str(e)}), 400

    try:
        course_id = int(course_id)
    except (TypeError, ValueError):
        return jsonify({"error": "course_id is required"}), 400

    try:
        review.save_escalations(course_id, result["escalations"])
        saved = review.list_escalations(course_id)
    except review.ReviewError as e:
        return jsonify({"error": str(e)}), e.status
    result["escalations"] = [s for s in saved if s["status"] == "pending"]
    return jsonify({"course_id": course_id, **result})


@feedback_triage_bp.route("/api/feedback-triage/<int:course_id>", methods=["GET"])
def get_escalations(course_id):
    try:
        items = review.list_escalations(course_id)
    except review.ReviewError as e:
        return jsonify({"error": str(e)}), e.status
    return jsonify({"course_id": course_id, "escalations": items})


@feedback_triage_bp.route("/api/feedback-triage/<int:item_id>/decision", methods=["POST"])
def decide_escalation(item_id):
    """Body: {"decision": "accept"|"reject"|"revise", "revised_text"?: str}."""
    data = request.get_json(silent=True) or {}
    try:
        item = review.record_decision(item_id, data.get("decision"), data.get("revised_text", ""))
    except review.ReviewError as e:
        return jsonify({"error": str(e)}), e.status
    return jsonify({"escalation": item})
