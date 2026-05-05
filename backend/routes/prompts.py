"""Prompt template routes — CRUD for professor-editable prompt instructions.

Each template_key (generate / skeleton / expand) maps to one of the three
prompt functions in prompt_builder.py.  Professors can add custom_instructions
that are injected into the prompt before the JSON schema block.
"""

from flask import Blueprint, request, jsonify
from db import get_db

prompts_bp = Blueprint("prompts", __name__)

# ── Template metadata (for frontend display) ──────────────────────────────────

TEMPLATE_META = {
    "generate": {
        "label": "Full Course Generation",
        "description": "Controls how the AI generates a complete curriculum with all modules, readings, and assignments in one pass.",
        "placeholder": "e.g. \"Always include at least one case study per module.\" or \"Use Socratic questioning in teaching suggestions.\"",
    },
    "skeleton": {
        "label": "Skeleton Generation",
        "description": "Controls how the AI creates the initial course outline — module titles, learning objectives, and difficulty progression.",
        "placeholder": "e.g. \"Front-load foundational theory in the first 3 modules before applied topics.\"",
    },
    "expand": {
        "label": "Module Expansion",
        "description": "Controls how the AI expands each skeleton module into full content with readings, assignments, and suggestions.",
        "placeholder": "e.g. \"Prefer open-ended reflection assignments over quizzes.\" or \"Include at least one video resource per module.\"",
    },
}


@prompts_bp.route("/api/prompts", methods=["GET"])
def get_all_templates():
    """Return all 3 template slots with their custom_instructions (if any)."""
    result = {}
    for key, meta in TEMPLATE_META.items():
        result[key] = {
            "key": key,
            "label": meta["label"],
            "description": meta["description"],
            "placeholder": meta["placeholder"],
            "custom_instructions": "",
            "updated_at": None,
        }

    conn = get_db()
    if conn:
        try:
            cur = conn.cursor()
            cur.execute(
                "SELECT template_key, custom_instructions, updated_at "
                "FROM prompt_templates WHERE template_key = ANY(%s)",
                (list(TEMPLATE_META.keys()),),
            )
            for row in cur.fetchall():
                key = row[0]
                if key in result:
                    result[key]["custom_instructions"] = row[1] or ""
                    result[key]["updated_at"] = row[2].isoformat() if row[2] else None
            cur.close()
        except Exception as e:
            print(f"prompts GET error: {e}")
        finally:
            conn.close()

    return jsonify(result)


@prompts_bp.route("/api/prompts/<key>", methods=["PUT"])
def update_template(key: str):
    """Update custom_instructions for a single template."""
    if key not in TEMPLATE_META:
        return jsonify({"error": f"Unknown template key: {key}"}), 400

    data = request.get_json(silent=True) or {}
    instructions = data.get("custom_instructions", "")
    if not isinstance(instructions, str):
        return jsonify({"error": "custom_instructions must be a string"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()
        cur.execute(
            """INSERT INTO prompt_templates (template_key, custom_instructions, updated_at)
               VALUES (%s, %s, NOW())
               ON CONFLICT (template_key)
               DO UPDATE SET custom_instructions = EXCLUDED.custom_instructions,
                             updated_at = NOW()""",
            (key, instructions.strip()),
        )
        conn.commit()
        cur.close()
        return jsonify({"status": "ok", "key": key})
    except Exception as e:
        print(f"prompts PUT error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@prompts_bp.route("/api/prompts/<key>/reset", methods=["POST"])
def reset_template(key: str):
    """Reset a template to default (clear custom_instructions)."""
    if key not in TEMPLATE_META:
        return jsonify({"error": f"Unknown template key: {key}"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "DB unavailable"}), 503

    try:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM prompt_templates WHERE template_key = %s", (key,)
        )
        conn.commit()
        cur.close()
        return jsonify({"status": "ok", "key": key, "reset": True})
    except Exception as e:
        print(f"prompts RESET error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()
