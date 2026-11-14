"""Assessment design routes: analyze a course's assessments and review suggestions.

Advisory only. Suggestions go through accept / reject / revise and are stored in
change_log, so accepted/revised ones appear in LTM snapshots like other changes.
"""

from flask import Blueprint, request, jsonify

from services.assessment_design import analyze_assessment_design
from services import assessment_review as review

assessment_design_bp = Blueprint("assessment_design", __name__)


@assessment_design_bp.route("/api/curriculum/assessment-design/analyze", methods=["POST"])
def analyze_assessments():
    """Body: {"course_id": int}. Classifies items; recall-only ones become pending suggestions."""
    data = request.get_json(silent=True) or {}
    course_id = data.get("course_id")
    if not course_id:
        return jsonify({"error": "course_id is required"}), 400

    result = analyze_assessment_design(review.load_course_modules(course_id))
    try:
        review.save_suggestions(course_id, result["suggestions"])
        saved = review.list_suggestions(course_id)
    except review.ReviewError as e:
        return jsonify({"error": str(e)}), e.status
    result["suggestions"] = [s for s in saved if s["status"] == "pending"]
    return jsonify({"course_id": course_id, **result})


@assessment_design_bp.route("/api/curriculum/assessment-design/<int:course_id>", methods=["GET"])
def get_assessment_suggestions(course_id):
    try:
        suggestions = review.list_suggestions(course_id)
    except review.ReviewError as e:
        return jsonify({"error": str(e)}), e.status
    return jsonify({"course_id": course_id, "suggestions": suggestions})


@assessment_design_bp.route("/api/curriculum/assessment-design/<int:suggestion_id>/decision", methods=["POST"])
def decide_assessment_suggestion(suggestion_id):
    """Body: {"decision": "accept"|"reject"|"revise", "alternative_index"?: int, "revised_text"?: str}."""
    data = request.get_json(silent=True) or {}
    try:
        suggestion = review.record_decision(
            suggestion_id,
            data.get("decision"),
            data.get("alternative_index", 0),
            data.get("revised_text", ""),
        )
    except review.ReviewError as e:
        return jsonify({"error": str(e)}), e.status
    return jsonify({"suggestion": suggestion})
