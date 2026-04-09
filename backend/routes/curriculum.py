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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Curriculum Agent endpoints
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@curriculum_bp.route("/api/curriculum/flags/<int:course_id>", methods=["GET"])
def get_curriculum_flags(course_id):
    """Return active (non-dismissed) module flags for a course.
    
    Used by the frontend badge component to poll for flagged modules.
    """
    from db import get_db
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, module_id, flag_level, signals, created_at
            FROM module_flags
            WHERE course_id = %s AND dismissed = FALSE
            ORDER BY created_at DESC
        """, (course_id,))
        cols = ["id", "module_id", "flag_level", "signals", "created_at"]
        flags = []
        for row in cur.fetchall():
            flag = dict(zip(cols, row))
            if flag.get("created_at"):
                flag["created_at"] = flag["created_at"].isoformat()
            flags.append(flag)
        cur.close()
        conn.close()
        return jsonify({"course_id": course_id, "flags": flags, "count": len(flags)})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@curriculum_bp.route("/api/curriculum/analyze", methods=["POST"])
def run_curriculum_analysis():
    """Run the Curriculum Agent on flagged modules.
    
    Body JSON:
      {
        "course_id": int,
        "flagged_modules": [{"module_id": str, "module_name": str, "signals": [...]}]
      }

    Returns the agent's recommendations and historical trend analysis.
    """
    from agents.curriculum_agent import CurriculumAgentNode
    from agents.base import SharedMemory
    from extensions import redis_client

    data = request.get_json()
    course_id = data.get("course_id")
    flagged_modules = data.get("flagged_modules", [])

    if not course_id:
        return jsonify({"error": "course_id is required"}), 400

    sm = SharedMemory(f"curriculum-{course_id}", redis_client)
    sm.set("course_id", course_id)
    sm.set("flagged_modules", flagged_modules)

    agent = CurriculumAgentNode()
    result = agent.execute(sm)

    return jsonify({
        "status": result.status,
        "data": result.data,
        "duration_ms": result.duration_ms,
    })


@curriculum_bp.route("/api/curriculum/flags/<int:flag_id>/dismiss", methods=["POST"])
def dismiss_flag(flag_id):
    """Mark a module flag as dismissed (user chose to ignore it)."""
    from db import get_db
    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE module_flags SET dismissed = TRUE WHERE id = %s",
            (flag_id,),
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"status": "dismissed", "flag_id": flag_id})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@curriculum_bp.route("/api/curriculum/suggestions/<int:course_id>", methods=["GET"])
def get_curriculum_suggestions(course_id):
    """Return human-readable curriculum suggestions for the CoursePage sidebar.

    Reads from change_log (Curriculum Agent recommendations) first.
    Falls back to translating raw module_flags into natural language.
    """
    from db import get_db
    conn = get_db()
    if not conn:
        return jsonify({"suggestions": []}), 200

    suggestions = []
    try:
        cur = conn.cursor()

        # 1. Try change_log first (Curriculum Agent has already run)
        cur.execute("""
            SELECT module_id, recommendation, flag_reason, timestamp
            FROM change_log
            WHERE course_id = %s AND status != 'dismissed'
            ORDER BY timestamp DESC
            LIMIT 10
        """, (str(course_id),))
        for row in cur.fetchall():
            suggestions.append({
                "module_id": row[0],
                "module_name": row[0],
                "recommendation": row[1],
                "reasons": row[2] if row[2] else [],
                "source": "curriculum_agent",
            })

        # 2. If no change_log entries, fall back to raw flags
        if not suggestions:
            cur.execute("""
                SELECT module_id, flag_level, signals
                FROM module_flags
                WHERE course_id = %s AND dismissed = FALSE
                ORDER BY created_at DESC
                LIMIT 10
            """, (course_id,))
            for row in cur.fetchall():
                module_id, flag_level, signals = row
                # Translate raw signals into a readable recommendation
                rec = _translate_flag_to_suggestion(module_id, flag_level, signals)
                suggestions.append(rec)

        cur.close()
        conn.close()
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        print(f"[Curriculum Suggestions] Error: {e}")

    return jsonify({"course_id": course_id, "suggestions": suggestions})


def _translate_flag_to_suggestion(module_id: str, flag_level: str, signals) -> dict:
    """Convert raw flag data into a human-readable recommendation."""
    parts = []

    if isinstance(signals, list):
        for sig in signals:
            source = sig.get("source", "") if isinstance(sig, dict) else ""
            detail = sig.get("detail", str(sig)) if isinstance(sig, dict) else str(sig)
            parts.append(detail)
    elif isinstance(signals, dict):
        parts.append(str(signals))

    if not parts:
        parts = ["This module has been flagged for review based on student performance data."]

    recommendation = " ".join(parts)

    return {
        "module_id": module_id,
        "module_name": module_id,
        "recommendation": recommendation,
        "flag_level": flag_level,
        "source": "threshold_checker",
    }


@curriculum_bp.route("/api/curriculum/suggestions/apply", methods=["POST"])
def apply_curriculum_suggestion():
    """Apply a curriculum suggestion — marks it as 'applied' in change_log.

    Phase 1: Only updates the status in change_log. Does not auto-mutate module content.
    Phase 3: Will call LLM to generate actual module changes and apply them.

    Request body:
        { "course_id": 24, "module_id": "module_1" }
    """
    from db import get_db
    data = request.get_json() or {}
    course_id = data.get("course_id")
    module_id = data.get("module_id")

    if not course_id or not module_id:
        return jsonify({"error": "course_id and module_id are required"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Database connection failed"}), 500

    try:
        cur = conn.cursor()

        # Mark change_log entries as applied
        cur.execute("""
            UPDATE change_log
            SET status = 'applied'
            WHERE course_id = %s AND module_id = %s AND status = 'pending'
            RETURNING id, recommendation, flag_reason
        """, (str(course_id), module_id))
        updated = cur.fetchall()

        # Also dismiss related module_flags
        cur.execute("""
            UPDATE module_flags
            SET dismissed = TRUE
            WHERE course_id = %s AND module_id = %s AND dismissed = FALSE
        """, (course_id, module_id))

        conn.commit()
        cur.close()
        conn.close()

        changes_applied = []
        for row in updated:
            changes_applied.append({
                "id": row[0],
                "recommendation": row[1],
                "reasons": row[2] if row[2] else [],
            })

        return jsonify({
            "status": "applied",
            "course_id": course_id,
            "module_id": module_id,
            "changes_applied": changes_applied,
            "message": f"Suggestion for {module_id} has been applied. {len(changes_applied)} change(s) recorded.",
        })
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({"error": str(e)}), 500


@curriculum_bp.route("/api/curriculum/changes/<int:course_id>", methods=["GET"])
def get_curriculum_changes(course_id):
    """Return recently applied module changes for student-facing notifications.

    Shows what modules were updated so students know the curriculum has evolved.
    """
    from db import get_db
    conn = get_db()
    if not conn:
        return jsonify({"changes": []}), 200

    changes = []
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT module_id, recommendation, flag_reason, timestamp
            FROM change_log
            WHERE course_id = %s AND status = 'applied'
            ORDER BY timestamp DESC
            LIMIT 5
        """, (str(course_id),))
        for row in cur.fetchall():
            changes.append({
                "module_id": row[0],
                "recommendation": row[1],
                "reasons": row[2] if row[2] else [],
                "timestamp": str(row[3]) if row[3] else None,
            })
        cur.close()
        conn.close()
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        print(f"[Curriculum Changes] Error: {e}")

    return jsonify({"course_id": course_id, "changes": changes})

