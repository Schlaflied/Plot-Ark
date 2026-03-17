import os
import re
import json
import time
import psycopg2
from flask import Flask, request, Response, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI
import google.generativeai as genai

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

AI_PROVIDER = os.getenv("AI_PROVIDER", "openai").lower()
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://plotark:plotark@postgres:5432/plotark")


def get_db():
    try:
        return psycopg2.connect(DATABASE_URL)
    except Exception as e:
        print(f"DB connection error: {e}")
        return None


def init_db():
    for attempt in range(10):
        conn = get_db()
        if conn:
            try:
                cur = conn.cursor()
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS curricula (
                        id SERIAL PRIMARY KEY,
                        created_at TIMESTAMP DEFAULT NOW(),
                        topic TEXT NOT NULL,
                        level TEXT,
                        audience TEXT,
                        course_code TEXT,
                        course_type TEXT,
                        module_count INTEGER,
                        modules JSONB,
                        sources JSONB,
                        is_favorite BOOLEAN DEFAULT FALSE
                    )
                """)
                cur.execute("""
                    ALTER TABLE curricula ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT FALSE
                """)
                conn.commit()
                cur.close()
                conn.close()
                print("DB initialized.")
                return
            except Exception as e:
                print(f"DB init error: {e}")
                conn.close()
                return
        print(f"DB not ready, retrying ({attempt + 1}/10)...")
        time.sleep(3)
    print("Could not connect to DB after 10 attempts. Continuing without DB.")


def save_curriculum(topic, level, audience, course_code, course_type, module_count, data):
    conn = get_db()
    if not conn:
        return
    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO curricula (topic, level, audience, course_code, course_type, module_count, modules, sources)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (topic, level, audience, course_code, course_type, module_count,
             json.dumps(data.get("modules", [])),
             json.dumps(data.get("sources", [])))
        )
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"DB save error: {e}")


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

    if not all([topic, level, audience]):
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
        full_text = ""
        try:
            if AI_PROVIDER == "gemini":
                model = genai.GenerativeModel("gemini-2.0-flash-lite")
                response = model.generate_content(prompt, stream=True)
                for chunk in response:
                    if chunk.text:
                        full_text += chunk.text
                        yield f"data: {json.dumps({'text': chunk.text})}\n\n"
            else:
                response = openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    stream=True,
                )
                for chunk in response:
                    delta = chunk.choices[0].delta.content or ""
                    if delta:
                        full_text += delta
                        yield f"data: {json.dumps({'text': delta})}\n\n"
        except Exception as e:
            print(f"Stream error: {e}")
            yield "data: [DONE]\n\n"
            return
        print(f"Stream complete, full_text length: {len(full_text)}")
        # Save to DB BEFORE sending [DONE] — client disconnects on [DONE]
        try:
            clean = full_text.replace("```json\n", "").replace("```\n", "").replace("```", "").strip()
            first = clean.index("{")
            last = clean.rindex("}")
            parsed = json.loads(clean[first:last + 1])
            save_curriculum(topic, level, audience, course_code, course_type, module_count, parsed)
            print(f"Saved curriculum: {topic}")
        except Exception as e:
            print(f"Failed to parse/save curriculum: {e}")
        yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/history", methods=["GET"])
def get_history():
    conn = get_db()
    if not conn:
        return {"history": [], "error": "DB unavailable"}, 200
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, created_at, topic, level, course_code, course_type, module_count, is_favorite "
            "FROM curricula ORDER BY is_favorite DESC, created_at DESC LIMIT 50"
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return {"history": [
            {
                "id": r[0],
                "created_at": r[1].isoformat(),
                "topic": r[2],
                "level": r[3],
                "course_code": r[4] or "",
                "course_type": r[5] or "mixed",
                "module_count": r[6],
                "is_favorite": r[7] or False,
            }
            for r in rows
        ]}
    except Exception as e:
        return {"history": [], "error": str(e)}, 200


@app.route("/api/history/<int:curriculum_id>", methods=["GET"])
def get_curriculum_by_id(curriculum_id):
    conn = get_db()
    if not conn:
        return {"error": "DB unavailable"}, 503
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT topic, level, audience, course_code, course_type, modules, sources "
            "FROM curricula WHERE id = %s",
            (curriculum_id,)
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return {"error": "Not found"}, 404
        return {
            "topic": row[0],
            "level": row[1],
            "audience": row[2],
            "course_code": row[3] or "",
            "course_type": row[4] or "mixed",
            "modules": row[5],
            "sources": row[6],
        }
    except Exception as e:
        return {"error": str(e)}, 500


@app.route("/api/history/<int:curriculum_id>", methods=["DELETE"])
def delete_curriculum(curriculum_id):
    conn = get_db()
    if not conn:
        return {"error": "DB unavailable"}, 503
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM curricula WHERE id = %s", (curriculum_id,))
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "deleted"}
    except Exception as e:
        return {"error": str(e)}, 500


@app.route("/api/history/<int:curriculum_id>/favorite", methods=["POST"])
def toggle_favorite(curriculum_id):
    conn = get_db()
    if not conn:
        return {"error": "DB unavailable"}, 503
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE curricula SET is_favorite = NOT is_favorite WHERE id = %s RETURNING is_favorite",
            (curriculum_id,)
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return {"is_favorite": row[0] if row else False}
    except Exception as e:
        return {"error": str(e)}, 500


@app.route("/api/xapi/statement", methods=["POST"])
def receive_xapi():
    statement = request.get_json()
    actor = statement.get("actor", {}).get("name", "unknown")
    verb = statement.get("verb", {}).get("display", {}).get("en-US", "unknown")
    obj = statement.get("object", {}).get("definition", {}).get("name", {}).get("en-US", "unknown")
    print(f"xAPI: {actor} {verb} {obj}")
    return {"status": "received"}, 200


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
