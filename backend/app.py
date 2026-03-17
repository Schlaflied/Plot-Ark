import os
import re
import json
import time
import asyncio
import psycopg2
from flask import Flask, request, Response, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI
import google.generativeai as genai
from tavily import TavilyClient

# ---------------------------------------------------------------------------
# Module-level caches
# ---------------------------------------------------------------------------
_rag_instances = {}       # key: storage_dir path → LightRAG instance
_initialized_instances = set()  # storage_dirs that have had initialize_storages() called

# Persistent background event loop — never closed, so LightRAG's internal state stays valid
import threading as _threading
_bg_loop = asyncio.new_event_loop()
_bg_thread = _threading.Thread(target=_bg_loop.run_forever, daemon=True)
_bg_thread.start()

def _run_async(coro):
    """Submit a coroutine to the persistent background event loop and wait for result."""
    future = asyncio.run_coroutine_threadsafe(coro, _bg_loop)
    return future.result(timeout=120)

try:
    import redis as _redis_lib
    _redis_client = _redis_lib.Redis(host="redis", port=6379, db=0, decode_responses=True)
    _redis_client.ping()
    print("Redis cache connected.")
except Exception as _redis_err:
    print(f"Redis unavailable, caching disabled: {_redis_err}")
    _redis_client = None

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

AI_PROVIDER = os.getenv("AI_PROVIDER", "openai").lower()
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

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


def save_curriculum(topic, level, audience, course_code, course_type, module_count, data, design_approach="addie"):
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


BLOOMS_BY_LEARNER_LEVEL = {
    "beginner": {
        "label": "Remember and Understand",
        "verbs": "define, identify, recall, describe, explain, summarize",
        "constraint": "Learning objectives MUST use only Remember and Understand verbs: define, identify, recall, describe, explain, summarize. Do NOT use Apply, Analyze, Evaluate, or Create verbs.",
    },
    "intermediate": {
        "label": "Apply and Analyze",
        "verbs": "apply, demonstrate, differentiate, compare, examine, solve",
        "constraint": "Learning objectives MUST use only Apply and Analyze verbs: apply, demonstrate, differentiate, compare, examine, solve. Do NOT use Remember, Understand, Evaluate, or Create verbs.",
    },
    "advanced": {
        "label": "Evaluate and Create",
        "verbs": "assess, critique, design, construct, argue, justify, synthesize",
        "constraint": "Learning objectives MUST use only Evaluate and Create verbs: assess, critique, design, construct, argue, justify, synthesize. Do NOT use Remember, Understand, Apply, or Analyze verbs.",
    },
}


LEVEL_TO_BLOOMS = {
    # Undergraduate
    "undergraduate-year-1": "beginner",
    "undergraduate-year-2": "beginner",
    "undergraduate-year-3": "intermediate",
    "undergraduate-year-4": "intermediate",
    # Graduate
    "master-year-1": "advanced",
    "master-year-2": "advanced",
    "master-year-3": "advanced",
    "doctoral": "advanced",
    # Professional
    "professional-beginner": "beginner",
    "professional-intermediate": "intermediate",
    "professional-advanced": "advanced",
    # ESL/EFL
    "esl-beginner": "beginner",
    "esl-intermediate": "intermediate",
    "esl-advanced": "advanced",
    # K-12
    "k12-elementary": "beginner",
    "k12-middle": "beginner",
    "k12-highschool": "intermediate",
}

_BLOOMS_TO_NARRATIVE = {
    "beginner": "Remember and Understand — definitions, identification, basic comprehension",
    "intermediate": "Apply and Analyze — case analysis, pattern recognition, comparative evaluation",
    "advanced": "Analyze, Evaluate, and Create — synthesis, critique, independent judgment, original work",
}


def get_blooms_level(course_code, level):
    # Check structured level key first
    if str(level) in LEVEL_TO_BLOOMS:
        return _BLOOMS_TO_NARRATIVE[LEVEL_TO_BLOOMS[str(level)]]
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


def get_session_constraints(minutes):
    """Return a prompt instruction string based on session duration in minutes."""
    if minutes <= 75:
        return (
            "Session length: 75 minutes. "
            "Each module must be completable in 75 minutes. "
            "Max 1 required reading per module (≤15 min read). "
            "Assignments must be short and focused (≤30 min completion time). "
            "Prefer in-class discussion or quick reflection over lengthy projects."
        )
    elif minutes <= 90:
        return (
            "Session length: 90 minutes. "
            "Each module fits a standard 90-minute university class. "
            "Max 1-2 required readings per module (≤20 min read each). "
            "Assignments should be completable in 45-60 minutes."
        )
    else:  # 3 hours or more
        return (
            f"Session length: {minutes} minutes (extended format). "
            "Each module covers more ground with deeper engagement. "
            "Up to 2-3 readings allowed per module. "
            "Assignments can include workshop components, group activities, or multi-part tasks. "
            "Include at least one in-class activity suggestion per module."
        )


def get_blooms_constraint(level):
    """Return Bloom's verb constraint based on beginner/intermediate/advanced learner level."""
    # Check structured level key first
    if str(level) in LEVEL_TO_BLOOMS:
        return BLOOMS_BY_LEARNER_LEVEL[LEVEL_TO_BLOOMS[str(level)]]["constraint"]
    level_lower = str(level).lower()
    if level_lower in BLOOMS_BY_LEARNER_LEVEL:
        return BLOOMS_BY_LEARNER_LEVEL[level_lower]["constraint"]
    # Fuzzy fallback
    if any(k in level_lower for k in ['begin', 'intro', 'foundation', '100', '1st', 'first']):
        return BLOOMS_BY_LEARNER_LEVEL["beginner"]["constraint"]
    if any(k in level_lower for k in ['advanc', 'senior', 'graduate', 'expert', 'master', 'phd', 'doctoral']):
        return BLOOMS_BY_LEARNER_LEVEL["advanced"]["constraint"]
    return BLOOMS_BY_LEARNER_LEVEL["intermediate"]["constraint"]


RESOURCE_TYPES = {
    "academic": {
        "domains": ["jstor.org", "researchgate.net", "academia.edu", "ncbi.nlm.nih.gov",
                    "springer.com", "tandfonline.com", "sagepub.com", "wiley.com",
                    "oxfordhandbooks.com", "cambridge.org", "scholar.google.com"],
        "queries": [
            "{topic} academic research {level}",
            "{topic} {audience} course materials",
            "{topic} key concepts textbook",
        ],
        "max_per_query": 3,
    },
    "video": {
        "domains": ["youtube.com", "ted.com", "coursera.org", "edx.org", "khanacademy.org"],
        "queries": [
            "{topic} lecture video course",
            "{topic} TED talk introduction",
        ],
        "max_per_query": 2,
    },
    "news": {
        "domains": ["hbr.org", "economist.com", "nytimes.com", "theguardian.com",
                    "mit.edu", "stanford.edu", "bbc.com"],
        "queries": [
            "{topic} analysis report {level}",
        ],
        "max_per_query": 2,
    },
}


def research_sources(topic, level, audience):
    """Step 1: Agent searches for real sources by type before generation."""
    try:
        results = []
        for source_type, config in RESOURCE_TYPES.items():
            for query_template in config["queries"]:
                query = query_template.format(topic=topic, level=level, audience=audience)
                response = tavily_client.search(
                    query=query,
                    search_depth="basic",
                    max_results=config["max_per_query"],
                    include_domains=config["domains"]
                )
                for r in response.get("results", []):
                    results.append({
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "content": r.get("content", "")[:300],
                        "type": source_type,
                    })
        # Deduplicate by URL
        seen = set()
        unique = []
        for r in results:
            if r["url"] not in seen:
                seen.add(r["url"])
                unique.append(r)
        # Filter: drop sources with no title or content clearly unrelated to topic
        topic_keywords = set(topic.lower().split())
        def is_relevant(r):
            if not r["title"]:
                return False
            combined = (r["title"] + " " + r["content"]).lower()
            return any(kw in combined for kw in topic_keywords)
        filtered = [r for r in unique if is_relevant(r)]
        if len(filtered) < 3:
            filtered = unique  # fallback: keep all if filter too aggressive
        print(f"Tavily found {len(unique)} sources, {len(filtered)} passed relevance filter for: {topic}")
        return filtered[:10]
    except Exception as e:
        print(f"Tavily research error: {e}")
        return []


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
    design_approach = data.get("design_approach", "addie").lower()
    if design_approach not in ("addie", "sam"):
        design_approach = "addie"

    try:
        session_duration = max(1, int(data.get("session_duration", 90)))
    except (ValueError, TypeError):
        session_duration = 90

    if not all([topic, level, audience]):
        return {"error": "Missing required fields"}, 400

    try:
        module_count = max(3, min(12, int(module_count_raw)))
    except (ValueError, TypeError):
        module_count = 6

    blooms = get_blooms_level(course_code, level)
    blooms_constraint = get_blooms_constraint(level)
    session_constraint = get_session_constraints(session_duration)
    assessment_format = ASSESSMENT_FORMATS.get(course_type, ASSESSMENT_FORMATS["mixed"])

    # Step 1: Agent researches real sources before generation
    real_sources = research_sources(topic, level, audience)
    sources_context = ""
    if real_sources:
        sources_context = "\n\nReal sources found by research agent — use these URLs in your sources array (they are verified real):\n"
        for s in real_sources:
            sources_context += f"- [{s['type']}] {s['title']} | {s['url']}\n"
        sources_context += "\nPrioritize these real URLs. You may add more you know with confidence, but do NOT invent URLs.\n"

    # Build design-approach-specific instructions
    if design_approach == "sam":
        design_approach_label = "SAM (Successive Approximation Model)"
        design_approach_instructions = """
Design Approach — SAM (Successive Approximation Model):
- Frame each module with ITERATIVE checkpoints rather than fixed deliverables.
- Each module MUST include a "rapid_prototype_cycle" field: a brief description of the Rapid Prototype → Evaluate → Revise loop learners will go through.
- Assignments should be framed as low-stakes prototypes designed to be revised, not final submissions.
- The overall curriculum narrative should emphasize continuous iteration over linear completion.
"""
        sam_module_field = '''"rapid_prototype_cycle": "Description of the Rapid Prototype → Evaluate → Revise cycle for this module.",'''
    else:
        design_approach_label = "ADDIE (Analysis → Design → Development → Implementation → Evaluation)"
        design_approach_instructions = """
Design Approach — ADDIE (linear instructional design model):
- Follow the standard linear flow: Analysis → Design → Development → Implementation → Evaluation.
- Each module represents a discrete, completed stage of learning before the next begins.
- Assignments are summative deliverables that demonstrate mastery of that module's objectives.
"""
        sam_module_field = ""

    prompt = f"""You are an expert curriculum designer applying evidence-based instructional design principles. Generate a rigorous, narrative-driven curriculum.

Topic: {topic}
Course Code: {course_code or "Not specified"}
Level: {level}
Target Audience: {audience}
Accreditation Context: {accreditation_context}
Course Type: {course_type}
Number of Modules: {module_count}
Design Approach: {design_approach_label}

Pedagogical Constraints:
- Bloom's Taxonomy Target: {blooms}
- Bloom's Verb Constraint: {blooms_constraint}
- Session Duration: {session_constraint}
- Assessment Format: {assessment_format}
- Difficulty Progression (i+1 principle, Krashen): complexity_level must start at 1 and reach 5 by the final module, increasing evenly — never jump more than 1 level per module.
- Cognitive Load (Sweller): Maximum 2 recommended readings per module. Each reading must have a clear rationale tied to that module's learning objectives.
- Not every module requires an assignment. When included, it must align with the module's Bloom's level and course type.
- Assignment task_description: MUST be specific and actionable (e.g. "Write a 500-word reflection comparing two case studies..."), NOT generic (e.g. "This assignment addresses the objectives of..."). Failing this instruction makes the output unusable.
- Assignment rubric_highlights: MUST contain exactly 3-4 concrete criteria describing what excellent work looks like for THIS specific task.
- Assignment estimated_time: MUST be realistic given the session duration constraint above. A 75-min session cannot have a 3-hour assignment.
{design_approach_instructions}
Return ONLY valid JSON (no markdown, no explanation):
{{
  "design_approach": "{design_approach}",
  "session_duration_minutes": {session_duration},
  "modules": [
    {{
      "title": "Module title",
      "complexity_level": 1,
      "learning_objectives": ["objective using only the permitted Bloom's verbs for this level", "objective 2", "objective 3"],
      {sam_module_field}
      "narrative_preview": "A compelling 2-3 sentence narrative hook using metaphor, scenario, or challenge framing.",
      "recommended_readings": [
        {{
          "title": "Full title of reading (article, chapter, or textbook section)",
          "url": "https://real-url-from-sources-above.com",
          "type": "academic | video | news",
          "estimated_time": "15 min read | 20 min video | 10 min read",
          "key_points": ["key point 1", "key point 2"],
          "rationale": "Why this reading is essential for this module's specific learning objectives and why it is relevant to students' lives or careers."
        }}
      ],
      "assignments": [
        {{
          "type": "project | essay | quiz | discussion | presentation | lab | reflection",
          "title": "Short assignment title",
          "task_description": "2-3 sentence specific description of exactly what students must do. Must be concrete and actionable — NOT generic phrases like 'addresses the objectives of this module'.",
          "deliverable": "What they hand in — e.g. '1-page written reflection', '10-slide deck', 'in-class oral presentation (5 min)'",
          "estimated_time": "Realistic completion time given the session duration — e.g. '45 minutes', '2 hours'. Must match the session length constraint above.",
          "covers_objectives": "Which specific learning objectives from this module this assessment addresses.",
          "rubric_highlights": [
            "Criterion 1 — description of what good work looks like",
            "Criterion 2 — description of what good work looks like",
            "Criterion 3 — description of what good work looks like",
            "Criterion 4 — description of what good work looks like"
          ]
        }}
      ]
    }}
  ],
  "sources": [
    {{
      "title": "Full title of the paper, video, article, or resource",
      "url": "https://example.com",
      "domain": "example.com",
      "type": "academic | video | news",
      "estimated_time": "20 min read | 15 min video | 10 min read",
      "retrieved_at": "2026-03-16"
    }}
  ]
}}

Generate exactly {module_count} modules. complexity_level must start at 1 and reach 5 by the last module.

For sources: use the verified real URLs provided above. Add more real sources you know with confidence. Every URL must be real and accessible.{sources_context}"""

    def event_stream():
        yield f"data: {json.dumps({'status': 'researching', 'message': f'Agent searching for real sources on {topic}...'})}\n\n"
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

        def parse_curriculum(text):
            clean = text.replace("```json\n", "").replace("```\n", "").replace("```", "").strip()
            first = clean.index("{")
            last = clean.rindex("}")
            return json.loads(clean[first:last + 1])

        def validate_structure(parsed, expected_count):
            """Check complexity_level progression and module count."""
            modules = parsed.get("modules", [])
            if len(modules) != expected_count:
                return False, f"Expected {expected_count} modules, got {len(modules)}"
            levels = [m.get("complexity_level", 0) for m in modules]
            if levels[0] != 1:
                return False, f"First module complexity should be 1, got {levels[0]}"
            if levels[-1] != 5:
                return False, f"Last module complexity should be 5, got {levels[-1]}"
            for i in range(1, len(levels)):
                if levels[i] < levels[i-1]:
                    return False, f"Complexity decreased at module {i+1}"
            return True, "ok"

        # Save to DB BEFORE sending [DONE] — client disconnects on [DONE]
        parsed = None
        try:
            parsed = parse_curriculum(full_text)
            valid, reason = validate_structure(parsed, module_count)
            if not valid:
                print(f"Validation failed: {reason} — retrying once")
                yield f"data: {json.dumps({'status': 'fixing', 'message': f'Fixing structure: {reason}...'})} \n\n"
                fix_prompt = prompt + f"\n\nIMPORTANT: Your previous response had a structural error: {reason}. Fix it and return valid JSON only."
                if AI_PROVIDER == "gemini":
                    model = genai.GenerativeModel("gemini-2.0-flash-lite")
                    retry_response = model.generate_content(fix_prompt)
                    retry_text = retry_response.text
                else:
                    retry_response = openai_client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[{"role": "user", "content": fix_prompt}],
                    )
                    retry_text = retry_response.choices[0].message.content
                try:
                    parsed = parse_curriculum(retry_text)
                    yield f"data: {json.dumps({'reset': True})}\n\n"
                    yield f"data: {json.dumps({'text': retry_text})}\n\n"
                    print("Retry succeeded")
                except Exception as e:
                    print(f"Retry parse failed: {e}")
            save_curriculum(topic, level, audience, course_code, course_type, module_count, parsed, design_approach)
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


def _get_lightrag_instance(storage_dir: str = None):
    """Return a cached LightRAG instance (not yet initialized — init happens inside async context)."""
    from lightrag import LightRAG
    from lightrag.llm.openai import gpt_4o_mini_complete, openai_embed
    from lightrag.utils import EmbeddingFunc

    if storage_dir is None:
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        storage_dir = os.path.normpath(os.path.join(backend_dir, "..", "data", "lightrag_storage"))

    if storage_dir in _rag_instances:
        return _rag_instances[storage_dir]

    rag = LightRAG(
        working_dir=storage_dir,
        llm_model_func=gpt_4o_mini_complete,
        embedding_func=EmbeddingFunc(
            embedding_dim=1536,
            max_token_size=8192,
            func=lambda texts: openai_embed(texts, model="text-embedding-3-small"),
        ),
    )
    _rag_instances[storage_dir] = rag
    return rag


def _get_graphml_path(subject: str = "all") -> str:
    """Return the path to the graphml file for a specific (non-all) subject."""
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    if subject == "call":
        storage_dir = "lightrag_storage_call"
    else:
        storage_dir = "lightrag_storage"
    return os.path.normpath(
        os.path.join(backend_dir, "..", "data", storage_dir, "graph_chunk_entity_relation.graphml")
    )


def _get_all_graphml_paths() -> list:
    """Return paths for both graph files used in the 'all' merged view."""
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.normpath(os.path.join(backend_dir, "..", "data"))
    return [
        os.path.join(data_dir, "lightrag_storage", "graph_chunk_entity_relation.graphml"),
        os.path.join(data_dir, "lightrag_storage_call", "graph_chunk_entity_relation.graphml"),
    ]


def _parse_graph_from_file(graphml_path: str):
    """Read a graphml file and return (nodes_dict, edges_set_data).

    nodes_dict  → {node_id: attrs_dict}
    edges_list  → list of (source, target, attrs_dict)
    """
    import networkx as nx
    G = nx.read_graphml(graphml_path)
    return G


def _build_graph_response(graphs):
    """Merge one or more networkx graphs and return filtered {nodes, edges} dicts.

    Deduplication rules:
    - Nodes: keyed by node ID. If the same ID appears in multiple graphs, keep the
      version with more attributes (len(attrs)).
    - Edges: keyed by (source, target, relation). First occurrence wins.
    """
    PERSON_TYPES = {"person", "PERSON"}
    PERSON_DESC_PHRASES = ("a person", "a student", "a fictional")

    merged_nodes = {}  # node_id → attrs dict
    merged_edges = {}  # (source, target, relation) → attrs dict

    for G in graphs:
        for node_id, attrs in G.nodes(data=True):
            nid = str(node_id)
            if nid not in merged_nodes or len(attrs) > len(merged_nodes[nid]):
                merged_nodes[nid] = dict(attrs)

        for source, target, attrs in G.edges(data=True):
            relation = attrs.get("relation", attrs.get("label", ""))
            key = (str(source), str(target), relation)
            if key not in merged_edges:
                merged_edges[key] = dict(attrs)

    # Filter PERSON nodes
    filtered_node_ids = set()
    nodes = []
    for node_id, attrs in merged_nodes.items():
        entity_type = attrs.get("entity_type", "")
        raw_desc = attrs.get("description", "")
        if raw_desc and "<SEP>" in raw_desc:
            raw_desc = raw_desc.split("<SEP>")[0].strip()

        if entity_type in PERSON_TYPES:
            filtered_node_ids.add(node_id)
            continue
        if raw_desc and any(phrase in raw_desc.lower() for phrase in PERSON_DESC_PHRASES):
            filtered_node_ids.add(node_id)
            continue

        nodes.append({
            "id": node_id,
            "label": attrs.get("label", node_id),
            "entity_type": entity_type,
            "description": raw_desc,
        })

    edges = []
    for (source, target, relation), attrs in merged_edges.items():
        if source in filtered_node_ids or target in filtered_node_ids:
            continue
        edges.append({
            "source": source,
            "target": target,
            "label": attrs.get("label", relation),
        })

    return nodes, edges


@app.route("/api/graph", methods=["GET"])
def get_graph():
    """Return knowledge graph nodes and edges from the LightRAG graphml file(s).

    subject=all (default) → merge business-law + CALL graphs
    subject=business-law  → business-law graph only
    subject=call          → CALL graph only
    """
    import networkx as nx
    subject = request.args.get("subject", "all")

    try:
        if subject == "all":
            paths = _get_all_graphml_paths()
            existing_paths = [p for p in paths if os.path.exists(p)]
            if not existing_paths:
                return {"nodes": [], "edges": [], "status": "not_ready"}
            graphs = [nx.read_graphml(p) for p in existing_paths]
        else:
            graphml_path = _get_graphml_path(subject)
            if not os.path.exists(graphml_path):
                return {"nodes": [], "edges": [], "status": "not_ready"}
            graphs = [nx.read_graphml(graphml_path)]

        nodes, edges = _build_graph_response(graphs)
        return {"nodes": nodes, "edges": edges, "status": "ready"}

    except Exception as e:
        print(f"Graph read error: {e}")
        return {"nodes": [], "edges": [], "status": "error", "error": str(e)}, 500


@app.route("/api/graph/query", methods=["POST"])
def query_graph():
    """Query the LightRAG knowledge graph and return an answer.

    Accepts optional 'subject' field (default: 'business-law') to select which
    knowledge graph to query. Uses:
    - Layer A: module-level _rag_instances dict to avoid re-initializing LightRAG
    - Layer B: Redis cache (TTL 24h) keyed on subject + normalized question
    """
    data = request.get_json()
    question = data.get("question", "").strip()
    mode = data.get("mode", "hybrid")
    subject = data.get("subject", "business-law")

    if not question:
        return {"error": "Missing 'question' field."}, 400

    graphml_path = _get_graphml_path(subject)
    if not os.path.exists(graphml_path):
        return {"answer": "Knowledge graph not initialized yet."}

    def clean_answer(text: str) -> str:
        """Strip markdown formatting and truncate to 3 sentences."""
        text = re.sub(r'#{1,6}\s*', '', text)
        text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
        text = re.sub(r'\*(.*?)\*', r'\1', text)
        text = re.sub(r'\[\d+\]', '', text)
        text = re.sub(r'(?m)^\s*[-*•]\s+', '', text)
        text = re.sub(r'\n{2,}', ' ', text)
        text = re.sub(r'[ \t]+', ' ', text)
        text = text.strip()
        sentences = re.split(r'(?<=[.!?])\s+', text)
        sentences = [s.strip() for s in sentences if s.strip() and len(s.strip()) > 10]
        result = ' '.join(sentences[:3])
        if result and result[-1] not in '.!?':
            result += '.'
        return result

    # --- Layer B: Redis cache check ---
    normalized_q = question.lower().strip()
    cache_key = f"graph_query:{subject}:{normalized_q}"
    if _redis_client is not None:
        try:
            cached = _redis_client.get(cache_key)
            if cached:
                print(f"Redis cache hit: {cache_key}")
                return {"answer": cached, "cached": True}
        except Exception as redis_err:
            print(f"Redis get error (skipping cache): {redis_err}")

    try:
        import asyncio
        try:
            from lightrag import QueryParam
        except ImportError:
            return {"answer": "Query engine not available in this environment. Run the backend locally with lightrag installed."}

        # --- Layer A: use cached LightRAG instance (initialize_storages only called once) ---
        backend_dir = os.path.dirname(os.path.abspath(__file__))
        if subject == "call":
            storage_dir = os.path.normpath(os.path.join(backend_dir, "..", "data", "lightrag_storage_call"))
        else:
            storage_dir = os.path.normpath(os.path.join(backend_dir, "..", "data", "lightrag_storage"))

        async def _run_query():
            rag = _get_lightrag_instance(storage_dir)
            if storage_dir not in _initialized_instances:
                await rag.initialize_storages()
                _initialized_instances.add(storage_dir)
            return await rag.aquery(question, param=QueryParam(mode=mode))

        raw_answer = _run_async(_run_query())

        answer = clean_answer(raw_answer)

        # --- Layer B: store result in Redis ---
        if _redis_client is not None:
            try:
                _redis_client.setex(cache_key, 86400, answer)
            except Exception as redis_err:
                print(f"Redis set error (skipping cache store): {redis_err}")

        return {"answer": answer}
    except Exception as e:
        print(f"Graph query error: {e}")
        return {"answer": f"Query failed: {str(e)}"}, 500


init_db()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
