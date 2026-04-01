"""Curriculum generation routes: generate, skeleton, expand, save."""

import json
from flask import Blueprint, request, Response, stream_with_context, jsonify
from config import AI_PROVIDER, openai_client, redis_client
import google.generativeai as genai
from db import save_curriculum
from constants import (
    get_blooms_level, get_blooms_constraint, get_session_constraints,
    ASSESSMENT_FORMATS,
)
from services.research import research_sources

curriculum_bp = Blueprint("curriculum", __name__)


@curriculum_bp.route("/api/curriculum/generate", methods=["POST"])
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

    # Step 1: Use approved_sources if provided, otherwise run Tavily
    approved_sources_raw = data.get("approved_sources", None)
    required_sources = []
    optional_sources = []
    if approved_sources_raw and isinstance(approved_sources_raw, list) and len(approved_sources_raw) > 0:
        real_sources = []
        for s in approved_sources_raw:
            if not s.get("url"):
                continue
            priority = s.get("priority", "optional")
            entry = {
                "url": s.get("url", ""),
                "title": s.get("title", ""),
                "type": s.get("type", "other"),
                "content": s.get("snippet", ""),
                "priority": priority,
            }
            real_sources.append(entry)
            if priority == "required":
                required_sources.append(entry)
            else:
                optional_sources.append(entry)
        print(f"Using {len(real_sources)} user-approved sources ({len(required_sources)} required, {len(optional_sources)} optional) — skipping Tavily")
    else:
        real_sources = research_sources(topic, level, audience)
    sources_context = ""
    if real_sources:
        sources_context = "\n\nReal sources found by research agent — use these URLs in your sources array (they are verified real):\n"
        for s in real_sources:
            priority_label = s.get("priority", "")
            priority_tag = f" [PRIORITY: {priority_label.upper()}]" if priority_label else ""
            sources_context += f"- [{s['type']}]{priority_tag} {s['title']} | {s['url']}\n"
        sources_context += "\nPrioritize these real URLs. You may add more you know with confidence, but do NOT invent URLs.\n"

    reading_priority_instructions = ""
    if required_sources or optional_sources:
        reading_priority_instructions = "\n\nReading Priority Instructions (based on instructor selection):\n"
        if required_sources:
            reading_priority_instructions += "REQUIRED readings — these MUST appear in modules as assigned readings:\n"
            for s in required_sources:
                reading_priority_instructions += f"  - {s['title']} | {s['url']}\n"
        if optional_sources:
            reading_priority_instructions += "OPTIONAL/supplementary readings — include where relevant but not mandatory:\n"
            for s in optional_sources:
                reading_priority_instructions += f"  - {s['title']} | {s['url']}\n"
        reading_priority_instructions += (
            "When assigning readings to modules:\n"
            "- Mark required readings with \"reading_type\": \"required\"\n"
            "- Mark optional readings with \"reading_type\": \"optional\"\n"
        )
    else:
        reading_priority_instructions = (
            "\n\nFor each reading in recommended_readings, assign a reading_type field:\n"
            "- \"required\" if it directly covers the core concept of the module\n"
            "- \"optional\" if it is supplementary or extension material\n"
        )

    if design_approach == "sam":
        design_approach_label = "SAM (Successive Approximation Model)"
        design_approach_instructions = """
Design Approach — SAM (Successive Approximation Model):
- Frame each module with ITERATIVE checkpoints rather than fixed deliverables.
- Each module MUST include a "rapid_prototype_cycle" field: a brief description of the Rapid Prototype → Evaluate → Revise loop learners will go through.
- Assignments should be framed as low-stakes prototypes designed to be revised, not final submissions.
- The overall curriculum narrative should emphasize continuous iteration over linear completion.
"""
        sam_module_field = '"rapid_prototype_cycle": "Description of the Rapid Prototype → Evaluate → Revise cycle for this module.",'
    else:
        design_approach_label = "ADDIE (Analysis → Design → Development → Implementation → Evaluation)"
        design_approach_instructions = """
Design Approach — ADDIE (linear instructional design model):
- Follow the standard linear flow: Analysis → Design → Development → Implementation → Evaluation.
- Each module represents a discrete, completed stage of learning before the next begins.
- Assignments are summative deliverables that demonstrate mastery of that module's objectives.
"""
        sam_module_field = ""

    resource_priority_prompt = {
        "project": "RESOURCE PRIORITY: Each module's recommended_readings MUST include at least 1 news or industry source (HBR, Economist, NYT, etc.) alongside academic sources. Real-world cases are essential for project-based courses.",
        "essay": "RESOURCE PRIORITY: Prioritize academic sources. Add video (TED Talk, lecture) and news sources where they strengthen the argument. Never omit academic sources.",
        "debate": "RESOURCE PRIORITY: Each module MUST include at least 1 current news or policy source to support debate positions. Mix with academic sources for theoretical grounding.",
        "lab": "RESOURCE PRIORITY: Each module MUST include at least 1 video resource (tutorial, demonstration, simulation walkthrough). Supplement with academic readings.",
        "mixed": "RESOURCE PRIORITY: Distribute resource types across modules — not every module should be academic-only. Mix academic, news (current events), and video across the curriculum.",
    }

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
{design_approach_instructions}{reading_priority_instructions}
{resource_priority_prompt.get(course_type, resource_priority_prompt["mixed"])}
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
          "title": "Full title of reading (article, chapter, or textbook section) — complete, never truncated with '...'",
          "url": "https://real-url-from-sources-above.com",
          "type": "academic | video | news",
          "estimated_time": "15 min read | 20 min video | 10 min read",
          "reading_type": "required | optional",
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
      "title": "Full title of the paper, video, article, or resource — complete, never truncated with '...'",
      "url": "https://example.com",
      "domain": "example.com",
      "type": "academic | video | news",
      "estimated_time": "20 min read | 15 min video | 10 min read",
      "retrieved_at": "2026-03-16"
    }}
  ]
}}

CRITICAL REQUIREMENT — MODULE COUNT:
You MUST generate exactly {module_count} modules. No more, no fewer.
Before finalizing your response, count your modules and verify the count equals {module_count}.
If your count is wrong, fix it before responding.
Responses with incorrect module counts will be automatically rejected and regenerated.

complexity_level must start at 1 and reach 5 by the last module.

For sources: use the verified real URLs provided above. Add more real sources you know with confidence. Every URL must be real and accessible.{sources_context}"""

    def event_stream():
        if approved_sources_raw and isinstance(approved_sources_raw, list) and len(approved_sources_raw) > 0:
            yield f"data: {json.dumps({'status': 'generating', 'message': f'Generating curriculum with {len(approved_sources_raw)} approved sources...'})}\n\n"
        else:
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
                    retry_valid, retry_reason = validate_structure(parsed, module_count)
                    yield f"data: {json.dumps({'reset': True})}\n\n"
                    yield f"data: {json.dumps({'text': retry_text})}\n\n"
                    if retry_valid:
                        print("Retry succeeded")
                    else:
                        actual_count = len(parsed.get("modules", []))
                        print(f"Retry also failed validation: {retry_reason}")
                        yield f"data: {json.dumps({'type': 'warning', 'message': f'Generated {actual_count} modules instead of {module_count} — GPT was being lazy, try regenerating'})}\n\n"
                except Exception as e:
                    print(f"Retry parse failed: {e}")
            for m in (parsed.get("modules") or []):
                m["learning_objectives"] = [
                    o[0].upper() + o[1:] if o else o for o in (m.get("learning_objectives") or [])
                ]
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


@curriculum_bp.route("/api/curriculum/save", methods=["POST"])
def save_curriculum_endpoint():
    """Save a fully expanded curriculum (from two-phase generation) to history."""
    data = request.get_json()
    topic = data.get("topic", "")
    level = data.get("level", "")
    audience = data.get("audience", "")
    course_code = data.get("course_code", "")
    course_type = data.get("course_type", "mixed")
    module_count = data.get("module_count", 0)
    design_approach = data.get("design_approach", "ADDIE")
    modules = data.get("modules", [])
    sources = data.get("sources", [])
    course_narrative = data.get("course_narrative", "")
    parsed = {"modules": modules, "sources": sources, "course_narrative": course_narrative}
    try:
        save_curriculum(topic, level, audience, course_code, course_type, module_count, parsed, design_approach)
        return jsonify({"status": "saved"})
    except Exception as e:
        print(f"Save endpoint error: {e}")
        return jsonify({"error": str(e)}), 500


@curriculum_bp.route("/api/curriculum/skeleton", methods=["POST"])
def generate_skeleton():
    """Phase 1: Generate only module titles + learning_objectives."""
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

    if not all([topic, level, audience]):
        return {"error": "Missing required fields"}, 400

    try:
        module_count = max(3, min(12, int(module_count_raw)))
    except (ValueError, TypeError):
        module_count = 6

    blooms_constraint = get_blooms_constraint(level)

    prompt = f"""You are an expert curriculum designer. Generate ONLY the module skeleton for the following course.

Topic: {topic}
Course Code: {course_code or "Not specified"}
Level: {level}
Target Audience: {audience}
Accreditation Context: {accreditation_context or "None"}
Course Type: {course_type}
Number of Modules: {module_count}
Design Approach: {design_approach}

Bloom's Verb Constraint: {blooms_constraint}
Difficulty Progression: complexity_level must start at 1 and reach 5 by the final module, increasing evenly.

Generate the course skeleton. Include a course_narrative (2-3 sentences explaining the central question or theme of this course and why these modules belong together — the "story" of the whole course). For each module provide: module_number, title, complexity_level, learning_objectives (list of 2-3 objectives using the permitted Bloom's verbs). Nothing else — no readings, no assignments, no narrative_preview.

Return ONLY valid JSON (no markdown, no explanation):
{{
  "course_narrative": "A 2-3 sentence explanation of the course's central theme and why these modules belong together.",
  "modules": [
    {{
      "module_number": 1,
      "title": "Module title",
      "complexity_level": 1,
      "learning_objectives": ["objective using permitted Bloom's verbs", "objective 2"]
    }}
  ]
}}

CRITICAL: Generate exactly {module_count} modules. complexity_level must start at 1 and end at 5."""

    def event_stream():
        yield f"data: {json.dumps({'status': 'generating', 'message': f'Generating {module_count}-module skeleton for {topic}...'})}\n\n"
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
            print(f"Skeleton stream error: {e}")
            yield "data: [DONE]\n\n"
            return

        def parse_skeleton(text):
            clean = text.replace("```json\n", "").replace("```\n", "").replace("```", "").strip()
            first = clean.index("{")
            last = clean.rindex("}")
            return json.loads(clean[first:last + 1])

        try:
            parsed = parse_skeleton(full_text)
            modules = parsed.get("modules", [])
            for i, m in enumerate(modules):
                if "module_number" not in m:
                    m["module_number"] = i + 1
            if len(modules) != module_count:
                print(f"Skeleton count mismatch: expected {module_count}, got {len(modules)}")
        except Exception as e:
            print(f"Failed to parse skeleton: {e}")

        yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@curriculum_bp.route("/api/curriculum/expand", methods=["POST"])
def expand_module():
    """Phase 2: Expand a single skeleton module with readings, assignments, narrative, etc."""
    data = request.get_json()
    skeleton = data.get("skeleton", [])
    module_index = data.get("module_index", 0)
    topic = data.get("topic", "")
    level = data.get("level", "")
    audience = data.get("audience", "")
    course_type = data.get("course_type", "mixed")
    design_approach = data.get("design_approach", "addie").lower()
    course_code = data.get("course_code", "")
    accreditation_context = data.get("accreditation_context", "")
    approved_sources_raw = data.get("approved_sources", [])

    try:
        session_duration = max(1, int(data.get("session_duration", 90)))
    except (ValueError, TypeError):
        session_duration = 90

    if not all([topic, level, audience]) or not skeleton or module_index >= len(skeleton):
        return {"error": "Missing required fields or invalid module_index"}, 400

    module = skeleton[module_index]
    module_title = module.get("title", f"Module {module_index + 1}")
    module_number = module.get("module_number", module_index + 1)
    complexity_level = module.get("complexity_level", 1)
    learning_objectives = module.get("learning_objectives", [])
    total_modules = len(skeleton)

    blooms_constraint = get_blooms_constraint(level)
    session_constraint = get_session_constraints(session_duration)
    assessment_format = ASSESSMENT_FORMATS.get(course_type, ASSESSMENT_FORMATS["mixed"])

    sources_context = ""
    required_sources = []
    optional_sources = []
    if approved_sources_raw and isinstance(approved_sources_raw, list):
        real_sources = [s for s in approved_sources_raw if s.get("url")]
        if real_sources:
            sources_context = "\n\nApproved sources from instructor — use these URLs for readings where relevant:\n"
            for s in real_sources:
                priority = s.get("priority", "optional")
                tag = f" [REQUIRED]" if priority == "required" else " [OPTIONAL]"
                sources_context += f"- [{s.get('type', 'other')}]{tag} {s.get('title', '')} | {s.get('url', '')}\n"
                if priority == "required":
                    required_sources.append(s)
                else:
                    optional_sources.append(s)
            sources_context += "Prioritize required sources. Do NOT invent URLs.\n"

    if design_approach == "sam":
        design_approach_label = "SAM (Successive Approximation Model)"
        sam_field = '"rapid_prototype_cycle": "Description of the Rapid Prototype → Evaluate → Revise cycle for this module.",'
    else:
        design_approach_label = "ADDIE (Analysis → Design → Development → Implementation → Evaluation)"
        sam_field = ""

    resource_priority_map = {
        "project": "PRIORITY: recommended_readings should lean toward academic + news sources (real-world cases and current research). Include at least 1 news/industry source per module where relevant.",
        "essay": "PRIORITY: recommended_readings should lean toward academic sources. Include video (TED/lecture) and news where they support the argument. Minimum 1 academic per module.",
        "debate": "PRIORITY: recommended_readings should include news/current events AND academic sources to support multiple perspectives. At least 1 news source per module.",
        "lab": "PRIORITY: recommended_readings should lean heavily toward video resources (tutorials, demonstrations, walkthroughs). At least 1 video per module where possible.",
        "mixed": "PRIORITY: recommended_readings should include a balanced mix of academic, news, and video sources across modules.",
    }
    resource_priority = resource_priority_map.get(course_type, resource_priority_map["mixed"])

    objectives_str = "\n".join(f"  - {obj}" for obj in learning_objectives)

    prompt = f"""You are an expert curriculum designer. Expand the following module skeleton into a full module with all required fields.

Course Context:
- Topic: {topic}
- Course Code: {course_code or "Not specified"}
- Level: {level}
- Target Audience: {audience}
- Accreditation: {accreditation_context or "None"}
- Course Type: {course_type}
- Design Approach: {design_approach_label}
- Total Modules in Course: {total_modules}

Module to Expand:
- Module Number: {module_number} of {total_modules}
- Title: {module_title}
- Complexity Level: {complexity_level}/5
- Learning Objectives:
{objectives_str}

Constraints:
- Bloom's Verb Constraint: {blooms_constraint}
- Session Duration: {session_constraint}
- Assessment Format: {assessment_format}
- Max 2 recommended readings. Each must have a clear rationale tied to this module's learning objectives.
- {resource_priority}
- Assignment task_description: MUST be specific and actionable (e.g. "Write a 500-word reflection comparing two case studies..."), NOT generic.
- Assignment rubric_highlights: MUST contain exactly 3-4 concrete criteria.
- Not every module requires an assignment. Only include one if it meaningfully fits this module.
- narrative_preview: A compelling 2-3 sentence narrative hook using metaphor, scenario, or challenge framing.{sources_context}

Return ONLY valid JSON for this single module (no markdown, no explanation):
{{
  "module_number": {module_number},
  "title": {json.dumps(module_title)},
  "complexity_level": {complexity_level},
  "learning_objectives": {json.dumps(learning_objectives)},
  {sam_field}
  "narrative_preview": "A compelling 2-3 sentence narrative hook.",
  "recommended_readings": [
    {{
      "title": "Full title of reading",
      "url": "https://real-url.com",
      "type": "academic | video | news",
      "estimated_time": "15 min read",
      "reading_type": "required | optional",
      "key_points": ["key point 1", "key point 2"],
      "rationale": "Why this reading is essential for this module."
    }}
  ],
  "assignments": [
    {{
      "type": "project | essay | quiz | discussion | presentation | lab | reflection",
      "title": "Short assignment title",
      "task_description": "2-3 sentence specific description of exactly what students must do.",
      "deliverable": "What they hand in",
      "estimated_time": "Realistic time given session duration",
      "covers_objectives": "Which specific learning objectives this addresses",
      "rubric_highlights": [
        "Criterion 1 — description of excellent work",
        "Criterion 2 — description of excellent work",
        "Criterion 3 — description of excellent work"
      ]
    }}
  ]
}}"""

    def event_stream():
        yield f"data: {json.dumps({'status': 'expanding', 'message': f'Expanding module {module_number}: {module_title}...'})}\n\n"
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
            print(f"Expand module stream error (module {module_index}): {e}")
            yield "data: [DONE]\n\n"
            return

        try:
            clean = full_text.replace("```json\n", "").replace("```\n", "").replace("```", "").strip()
            first = clean.index("{")
            last = clean.rindex("}")
            parsed = json.loads(clean[first:last + 1])
            if not isinstance(parsed.get("recommended_readings"), list):
                parsed["recommended_readings"] = []
            if not isinstance(parsed.get("assignments"), list):
                parsed["assignments"] = []
            if not isinstance(parsed.get("learning_objectives"), list):
                parsed["learning_objectives"] = learning_objectives
            parsed["learning_objectives"] = [
                o[0].upper() + o[1:] if o else o for o in parsed["learning_objectives"]
            ]
            print(f"Expanded module {module_number}: {module_title}")
        except Exception as e:
            print(f"Failed to parse expanded module {module_index}: {e}")

        yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
