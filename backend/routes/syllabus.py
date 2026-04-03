"""Syllabus parse route."""

import os
import json
from flask import Blueprint, request, jsonify
from config import AI_PROVIDER
from extensions import openai_client
import google.generativeai as genai
from services.file_parser import extract_text_from_bytes

syllabus_bp = Blueprint("syllabus", __name__)


@syllabus_bp.route("/api/syllabus/parse", methods=["POST"])
def parse_syllabus():
    """Accept a PDF or DOCX syllabus upload and extract course fields using AI."""
    if "file" not in request.files:
        return jsonify({"error": "No file field in request"}), 400

    uploaded = request.files["file"]
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "No file uploaded"}), 400

    filename = uploaded.filename
    ext = os.path.splitext(filename.lower())[1]
    if ext not in (".pdf", ".docx"):
        return jsonify({"error": "Only PDF and DOCX files are supported"}), 400

    content = uploaded.read()
    if len(content) > 10 * 1024 * 1024:
        return jsonify({"error": "File too large (max 10 MB)"}), 400

    try:
        text = extract_text_from_bytes(filename, content)
    except Exception as e:
        print(f"Syllabus text extraction error: {e}")
        return jsonify({"error": f"Failed to extract text: {str(e)}"}), 500

    if not text.strip():
        return jsonify({"error": "Could not extract any text from the file"}), 400

    truncated = text[:6000]

    prompt = f"""You are a course metadata extractor. Analyze the following syllabus text and extract the course information.

Return ONLY valid JSON with these fields (use empty string "" if not found):
{{
  "topic": "The main course title or topic name",
  "course_code": "The course code (e.g. CS 301, ACCT 201, CALL 9303-007)",
  "level": "One of: undergraduate-year-1, undergraduate-year-2, undergraduate-year-3, undergraduate-year-4, master-year-1, master-year-2, doctoral, professional-beginner, professional-intermediate, professional-advanced, esl-beginner, esl-intermediate, esl-advanced, k12-elementary, k12-middle, k12-highschool",
  "audience": "The target audience or discipline (e.g. Computer Science students, TESOL, MBA students)",
  "accreditation_context": "Any accreditation body or standards mentioned (e.g. AACSB, CPA Canada)",
  "course_type": "One of: mixed, project, essay, debate, lab — based on the dominant assessment style"
}}

Syllabus text:
{truncated}"""

    try:
        if AI_PROVIDER == "gemini":
            model = genai.GenerativeModel("gemini-2.0-flash-lite")
            response = model.generate_content(prompt)
            raw = response.text
        else:
            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.2,
                max_tokens=500,
            )
            raw = response.choices[0].message.content.strip()
        raw = raw.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw)
        return jsonify({"fields": parsed})
    except json.JSONDecodeError as e:
        print(f"Syllabus parse JSON error: {e}, raw: {raw[:200]}")
        return jsonify({"error": "AI returned invalid JSON"}), 500
    except Exception as e:
        print(f"Syllabus parse AI error: {e}")
        return jsonify({"error": f"Failed to parse syllabus: {str(e)}"}), 500
