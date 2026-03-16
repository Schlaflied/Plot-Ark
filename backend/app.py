import os
import re
import json
from flask import Flask, request, Response, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))


def get_blooms_level(course_code, level):
    num_match = re.search(r'\d{3}', str(course_code).upper())
    if num_match:
        num = int(num_match.group())
        if num < 200:
            return "Remember and Understand — definitions, identification, basic comprehension"
        elif num < 300:
            return "Understand and Apply — using concepts in familiar contexts, worked examples"
        elif num < 400:
            return "Apply and Analyze — case analysis, pattern recognition, comparative evaluation"
        else:
            return "Analyze, Evaluate, and Create — synthesis, critique, independent judgment, original work"
    level_lower = str(level).lower()
    if any(k in level_lower for k in ['graduate', 'phd', 'doctoral', 'master']):
        return "Analyze, Evaluate, and Create — advanced critical synthesis and original contribution"
    elif any(k in level_lower for k in ['senior', '4th', 'advanced']):
        return "Apply, Analyze, and Evaluate — critical analysis with some synthesis"
    return "Understand and Apply — foundational understanding with practical application"


ASSESSMENT_FORMATS = {
    "project": "project-based assignments (group projects, case studies, presentations, portfolios)",
    "essay": "essay-based assessments (argumentative essays, reflective journals, research papers)",
    "debate": "discussion-based formats (structured debates, Socratic seminars, roleplay scenarios)",
    "lab": "lab and simulation work (experiments, technical projects, lab reports, prototypes)",
    "mixed": "varied formats across modules (rotate between essays, projects, discussions, and activities)",
}


@app.route("/")
def index():
    return {"status": "online", "service": "Plot Ark — Agentic Curriculum Engine"}


@app.route("/api/curriculum/generate", methods=["POST"])
def generate_curriculum():
    data = request.get_json()
    topic = data.get("topic", "")
    level = data.get("level", "")
    audience = data.get("audience", "")
    accreditation_context = data.get("accreditation_context", "")
    course_code = data.get("course_code", "")
    course_type = data.get("course_type", "mixed")
    module_count_raw = data.get("module_count", "6")

    if not all([topic, level, audience, accreditation_context]):
        return {"error": "Missing required fields"}, 400

    try:
        module_count = max(3, min(12, int(module_count_raw)))
    except (ValueError, TypeError):
        module_count = 6

    blooms = get_blooms_level(course_code, level)
    assessment_format = ASSESSMENT_FORMATS.get(course_type, ASSESSMENT_FORMATS["mixed"])

    prompt = f"""You are an expert curriculum designer applying evidence-based instructional design principles. Generate a rigorous, narrative-driven curriculum.

Topic: {topic}
Course Code: {course_code or "Not specified"}
Level: {level}
Target Audience: {audience}
Accreditation Context: {accreditation_context}
Course Type: {course_type}
Number of Modules: {module_count}

Pedagogical Constraints:
- Bloom's Taxonomy Target: {blooms}
- Assessment Format: {assessment_format}
- Difficulty Progression (i+1 principle, Krashen): complexity_level must start at 1 and reach 5 by the final module, increasing evenly — never jump more than 1 level per module.
- Cognitive Load (Sweller): Maximum 2 recommended readings per module. Each reading must have a clear rationale tied to that module's learning objectives.
- Not every module requires an assignment. When included, it must align with the module's Bloom's level and course type.

Return ONLY valid JSON (no markdown, no explanation):
{{
  "modules": [
    {{
      "title": "Module title",
      "complexity_level": 1,
      "learning_objectives": ["objective at correct Bloom's level", "objective 2", "objective 3"],
      "narrative_preview": "A compelling 2-3 sentence narrative hook using metaphor, scenario, or challenge framing.",
      "recommended_readings": [
        {{
          "title": "Full title of reading (article, chapter, or textbook section)",
          "key_points": ["key point 1", "key point 2"],
          "rationale": "Why this reading is essential for this module's specific learning objectives."
        }}
      ],
      "assignments": [
        {{
          "title": "Assignment title",
          "type": "essay | project | debate | lab | quiz | reflection",
          "coverage": "Which specific learning objectives and concepts this addresses."
        }}
      ]
    }}
  ],
  "sources": [
    {{
      "url": "https://example.com",
      "domain": "example.com",
      "retrieved_at": "2026-03-16"
    }}
  ]
}}

Generate exactly {module_count} modules. complexity_level must start at 1 and reach 5 by the last module.

For sources: generate as many real, relevant resources as naturally fit the topic — aim for broad coverage across the full curriculum, not just one or two modules. Include a mix of academic journals, textbooks, official standards bodies, professional associations, and reputable online resources. Each source must have a real URL."""

    def event_stream():
        model = genai.GenerativeModel("gemini-2.0-flash-exp")
        response = model.generate_content(prompt, stream=True)
        for chunk in response:
            if chunk.text:
                yield f"data: {json.dumps({'text': chunk.text})}\n\n"
        yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/xapi/statement", methods=["POST"])
def receive_xapi():
    statement = request.get_json()
    actor = statement.get("actor", {}).get("name", "unknown")
    verb = statement.get("verb", {}).get("display", {}).get("en-US", "unknown")
    obj = statement.get("object", {}).get("definition", {}).get("name", {}).get("en-US", "unknown")
    print(f"xAPI: {actor} {verb} {obj}")
    return {"status": "received"}, 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
