"""Curriculum generation routes: generate, skeleton, expand, save."""

import json
from flask import Blueprint, request, Response, stream_with_context, jsonify
from config import AI_PROVIDER
from extensions import openai_client, redis_client
import google.generativeai as genai
from db import save_curriculum
from services.research import research_sources
from services.prompt_builder import (
    build_generate_prompt, build_skeleton_prompt, build_expand_prompt,
)

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

    prompt = build_generate_prompt(
        topic=topic,
        level=level,
        audience=audience,
        accreditation_context=accreditation_context,
        course_code=course_code,
        course_type=course_type,
        module_count=module_count,
        session_duration=session_duration,
        design_approach=design_approach,
        real_sources=real_sources,
        required_sources=required_sources,
        optional_sources=optional_sources,
    )

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
            new_id = save_curriculum(topic, level, audience, course_code, course_type, module_count, parsed, design_approach)
            print(f"Saved curriculum: {topic} (id={new_id})")
            if new_id:
                import threading
                from routes.curriculum_agent_routes import _run_structural_analysis
                threading.Thread(target=_run_structural_analysis, args=(new_id,), daemon=True).start()
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
    """Save a fully expanded curriculum (from two-phase generation) to history.

    After saving, fires a background structural analysis so the professor
    sees initial curriculum-agent suggestions immediately.
    """
    import threading
    from routes.curriculum_agent_routes import _run_structural_analysis

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
        new_id = save_curriculum(topic, level, audience, course_code, course_type, module_count, parsed, design_approach)
        if new_id:
            t = threading.Thread(target=_run_structural_analysis, args=(new_id,), daemon=True)
            t.start()
        return jsonify({"status": "saved", "course_id": new_id})
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

    prompt = build_skeleton_prompt(
        topic=topic,
        level=level,
        audience=audience,
        accreditation_context=accreditation_context,
        course_code=course_code,
        course_type=course_type,
        module_count=module_count,
        design_approach=design_approach,
    )

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

    prompt = build_expand_prompt(
        topic=topic,
        level=level,
        audience=audience,
        accreditation_context=accreditation_context,
        course_code=course_code,
        course_type=course_type,
        design_approach=design_approach,
        session_duration=session_duration,
        module_title=module_title,
        module_number=module_number,
        complexity_level=complexity_level,
        learning_objectives=learning_objectives,
        total_modules=total_modules,
        approved_sources=approved_sources_raw or [],
    )

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
