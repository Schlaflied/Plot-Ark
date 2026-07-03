"""Student profile routes — CRUD for student-facing profile page."""

import json
from flask import Blueprint, request, jsonify
from db import get_db
from config import DEFAULT_MODEL_CONFIG, AVAILABLE_MODELS, API_KEY_ENCRYPTION_KEY

profile_bp = Blueprint("profile", __name__)


# ── API Key Encryption Helpers ────────────────────────────────────────────────

def _get_fernet():
    """Return a Fernet cipher if an encryption key is configured, else None."""
    if not API_KEY_ENCRYPTION_KEY:
        return None
    try:
        from cryptography.fernet import Fernet
        return Fernet(API_KEY_ENCRYPTION_KEY.encode())
    except Exception:
        return None


def _encrypt_api_keys(api_keys: dict) -> dict:
    """Encrypt API key values before storing in DB. Skips empty strings."""
    f = _get_fernet()
    if not f:
        return api_keys  # No encryption key configured — store as-is
    result = {}
    for provider, key in api_keys.items():
        if key:
            result[provider] = f.encrypt(key.encode()).decode()
        else:
            result[provider] = ""
    return result


def _decrypt_api_keys(api_keys: dict) -> dict:
    """Decrypt API key values after reading from DB."""
    f = _get_fernet()
    if not f:
        return api_keys
    result = {}
    for provider, key in api_keys.items():
        if key:
            try:
                result[provider] = f.decrypt(key.encode()).decode()
            except Exception:
                result[provider] = key  # Already plaintext or corrupted
        else:
            result[provider] = ""
    return result


def _mask_api_keys(api_keys: dict) -> dict:
    """Mask API keys for safe client response (show only last 4 chars)."""
    result = {}
    for provider, key in api_keys.items():
        if key and len(key) > 8:
            result[provider] = "•" * 8 + key[-4:]
        elif key:
            result[provider] = "•" * len(key)
        else:
            result[provider] = ""
    return result


def _sanitize_model_config(mc: dict) -> dict:
    """Ensure model_config has expected structure, filling missing fields."""
    if not isinstance(mc, dict):
        return dict(DEFAULT_MODEL_CONFIG)
    return {
        "use_own_key": mc.get("use_own_key", False),
        "api_keys": mc.get("api_keys", dict(DEFAULT_MODEL_CONFIG["api_keys"])),
        "roles": mc.get("roles", dict(DEFAULT_MODEL_CONFIG["roles"])),
    }


# ── Profile CRUD ─────────────────────────────────────────────────────────────

def _get_or_create_profile(email: str) -> dict | None:
    """Fetch profile by email, creating a blank one if it doesn't exist."""
    conn = get_db()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, email, display_name, preferred_style, persona_sets, avatar_url, discipline, custom_prompt, model_config, created_at, updated_at "
            "FROM student_profiles WHERE email = %s",
            (email,),
        )
        row = cur.fetchone()
        if row:
            cur.close()
            conn.close()
            raw_mc = row[8] or {}
            mc = _sanitize_model_config(raw_mc)
            # Decrypt then mask keys for client
            mc["api_keys"] = _mask_api_keys(_decrypt_api_keys(mc.get("api_keys", {})))
            return {
                "id": row[0],
                "email": row[1],
                "display_name": row[2] or "",
                "preferred_style": row[3] or "",
                "persona_sets": row[4] or [],
                "avatar_url": row[5] or "",
                "discipline": row[6] or "humanities",
                "custom_prompt": row[7] or "",
                "model_config": mc,
                "created_at": row[9].isoformat() if row[9] else None,
                "updated_at": row[10].isoformat() if row[10] else None,
            }
        # Auto-create
        cur.execute(
            "INSERT INTO student_profiles (email) VALUES (%s) RETURNING id, created_at",
            (email,),
        )
        new = cur.fetchone()
        conn.commit()
        cur.close()
        conn.close()
        return {
            "id": new[0],
            "email": email,
            "display_name": "",
            "preferred_style": "",
            "persona_sets": [],
            "avatar_url": "",
            "discipline": "humanities",
            "custom_prompt": "",
            "model_config": dict(DEFAULT_MODEL_CONFIG),
            "created_at": new[1].isoformat() if new[1] else None,
            "updated_at": None,
        }
    except Exception as e:
        print(f"[profile] get_or_create error: {e}")
        conn.close()
        return None


@profile_bp.route("/api/profile", methods=["GET"])
def get_profile():
    """Return the student's profile. Auto-creates one if it doesn't exist."""
    email = request.headers.get("X-User-Email", "").strip()
    if not email:
        return jsonify({"error": "Missing X-User-Email header"}), 400

    profile = _get_or_create_profile(email)
    if profile is None:
        return jsonify({"error": "Database unavailable"}), 503
    return jsonify(profile), 200


@profile_bp.route("/api/profile", methods=["PUT"])
def update_profile():
    """Update display_name and/or preferred_style."""
    email = request.headers.get("X-User-Email", "").strip()
    if not email:
        return jsonify({"error": "Missing X-User-Email header"}), 400

    data = request.get_json(force=True)
    display_name = data.get("display_name")
    preferred_style = data.get("preferred_style")
    discipline = data.get("discipline")
    custom_prompt = data.get("custom_prompt")
    avatar_url = data.get("avatar_url")
    persona_sets = data.get("persona_sets")
    model_config = data.get("model_config")

    # Validate preferred_style
    valid_styles = ("", "analogy", "steps", "narrative")
    if preferred_style is not None and preferred_style not in valid_styles:
        return jsonify({"error": f"preferred_style must be one of {valid_styles}"}), 400

    # Validate model_config roles against AVAILABLE_MODELS (+ custom models)
    if model_config is not None:
        valid_model_values = {m["value"] for m in AVAILABLE_MODELS}
        # Also allow any custom model IDs (prefixed with "custom-")
        custom_models = model_config.get("custom_models", [])
        custom_ids = {cm["id"] for cm in custom_models if isinstance(cm, dict) and "id" in cm}
        valid_model_values |= custom_ids
        roles = model_config.get("roles", {})
        for role_name, model_val in roles.items():
            if role_name not in ("explainer", "checker", "adapter"):
                return jsonify({"error": f"Unknown role: {role_name}"}), 400
            if model_val not in valid_model_values:
                return jsonify({"error": f"Unknown model '{model_val}' for role '{role_name}'"}), 400

    # Ensure profile exists
    _get_or_create_profile(email)

    conn = get_db()
    if not conn:
        return jsonify({"error": "Database unavailable"}), 503

    try:
        cur = conn.cursor()
        updates = []
        params = []
        if display_name is not None:
            updates.append("display_name = %s")
            params.append(display_name)
        if preferred_style is not None:
            updates.append("preferred_style = %s")
            params.append(preferred_style)
        if avatar_url is not None:
            updates.append("avatar_url = %s")
            params.append(avatar_url)
        if discipline is not None:
            updates.append("discipline = %s")
            params.append(discipline)
        if custom_prompt is not None:
            updates.append("custom_prompt = %s")
            params.append(custom_prompt)
        if persona_sets is not None:
            updates.append("persona_sets = %s")
            params.append(json.dumps(persona_sets))
        if model_config is not None:
            # Encrypt API keys before storing
            mc = _sanitize_model_config(model_config)
            api_keys = mc.get("api_keys", {})
            # Only encrypt real keys — skip masked values (•••)
            clean_keys = {}
            for provider, key in api_keys.items():
                if key and not key.startswith("•"):
                    clean_keys[provider] = key
                else:
                    clean_keys[provider] = ""  # Don't overwrite with mask
            # If user sent masked keys, merge with existing stored keys
            if any(k.startswith("•") for k in api_keys.values() if k):
                cur.execute(
                    "SELECT model_config FROM student_profiles WHERE email = %s",
                    (email,),
                )
                existing_row = cur.fetchone()
                if existing_row and existing_row[0]:
                    existing_keys = existing_row[0].get("api_keys", {})
                    for provider, key in api_keys.items():
                        if key and key.startswith("•"):
                            # Keep existing encrypted value
                            clean_keys[provider] = existing_keys.get(provider, "")
                        elif key:
                            clean_keys[provider] = _encrypt_api_keys({provider: key})[provider]
                        else:
                            clean_keys[provider] = ""
            else:
                clean_keys = _encrypt_api_keys(clean_keys)
            mc["api_keys"] = clean_keys
            updates.append("model_config = %s")
            params.append(json.dumps(mc))

        if not updates:
            cur.close()
            conn.close()
            return jsonify({"status": "ok", "message": "Nothing to update"}), 200

        updates.append("updated_at = NOW()")
        params.append(email)
        cur.execute(
            f"UPDATE student_profiles SET {', '.join(updates)} WHERE email = %s",
            params,
        )
        conn.commit()
        cur.close()
        conn.close()
        return jsonify({"status": "ok"}), 200
    except Exception as e:
        print(f"[profile] update error: {e}")
        conn.close()
        return jsonify({"error": str(e)}), 500


@profile_bp.route("/api/profile/models", methods=["GET"])
def get_available_models():
    """Return the list of available models for the Model Selection UI."""
    return jsonify({
        "models": AVAILABLE_MODELS,
        "default_config": DEFAULT_MODEL_CONFIG,
    }), 200


@profile_bp.route("/api/profile/courses", methods=["GET"])
def get_student_courses():
    """
    Return courses this student has interacted with
    (via feedback or annotations), plus basic mastery overview per course.
    """
    email = request.headers.get("X-User-Email", "").strip()
    if not email:
        return jsonify({"error": "Missing X-User-Email header"}), 400

    conn = get_db()
    if not conn:
        return jsonify({"error": "Database unavailable"}), 503

    try:
        cur = conn.cursor()
        # Find courses from feedback + annotations, join with curricula for metadata
        cur.execute("""
            SELECT DISTINCT c.id, c.topic, c.course_code, c.module_count, c.modules
            FROM curricula c
            WHERE c.id IN (
                SELECT DISTINCT course_id FROM student_feedback WHERE student_id = %s
                UNION
                SELECT DISTINCT course_id FROM concept_annotations WHERE student_id = %s
            )
            ORDER BY c.id
        """, (email, email))
        courses = []
        for row in cur.fetchall():
            course_id = row[0]
            # Get module-level mastery overview for color blocks
            cur.execute("""
                SELECT module_id, mastery_level
                FROM cohort_concept_mastery
                WHERE course_id = %s AND valid_to IS NULL
                ORDER BY module_id
            """, (course_id,))
            mastery_rows = cur.fetchall()
            # Aggregate: for each module, pick the "worst" mastery across concepts
            module_mastery = {}
            for m_row in mastery_rows:
                mod = m_row[0]
                level = m_row[1]
                # Priority: struggling > learning > mastered > not_started
                priority = {"struggling": 3, "learning": 2, "mastered": 1, "not_started": 0}
                current = module_mastery.get(mod, "not_started")
                if priority.get(level, 0) > priority.get(current, 0):
                    module_mastery[mod] = level

            # Module titles for bar labels/tooltips (index is 1-based, matching module_N keys)
            raw_modules = row[4] or []
            module_titles = [
                {"index": i + 1, "title": (m.get("title") or f"Module {i + 1}") if isinstance(m, dict) else f"Module {i + 1}"}
                for i, m in enumerate(raw_modules)
            ]

            courses.append({
                "id": course_id,
                "topic": row[1] or "",
                "course_code": row[2] or "",
                "module_count": row[3] or 0,
                "module_mastery": module_mastery,
                "modules": module_titles,
            })

        cur.close()
        conn.close()
        return jsonify({"courses": courses}), 200
    except Exception as e:
        print(f"[profile] courses error: {e}")
        conn.close()
        return jsonify({"error": str(e)}), 500


@profile_bp.route("/api/profile/diagnosis/<int:course_id>", methods=["GET"])
def get_diagnosis(course_id: int):
    """Return a one-sentence diagnosis for the student in a specific course."""
    email = request.headers.get("X-User-Email", "").strip()
    if not email:
        return jsonify({"error": "Missing X-User-Email header"}), 400

    from services.student_diagnosis import generate_diagnosis
    result = generate_diagnosis(course_id, email)
    return jsonify(result), 200
