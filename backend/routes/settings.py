"""Settings routes: store and retrieve API keys / model preferences via Redis."""

from flask import Blueprint, request, jsonify
from extensions import redis_client, reload_clients
from services import llm
from services.secret_store import SecretStorageError, decrypt_secret, encrypt_secret

settings_bp = Blueprint("settings", __name__)

# Fallback in-memory store when Redis is unavailable
_mem_store: dict = {}

ALLOWED_FIELDS = {
    "openai_key",
    "gemini_key",
    "claude_key",
    "tavily_key",
    "openai_model",
    "gemini_model",
    "claude_model",
}

_REDIS_PREFIX = "plotark:settings:"


def _set(field: str, value: str) -> None:
    if redis_client:
        redis_client.set(_REDIS_PREFIX + field, value)
    else:
        _mem_store[field] = value


def _get(field: str) -> str | None:
    if redis_client:
        value = redis_client.get(_REDIS_PREFIX + field)
    else:
        value = _mem_store.get(field)
    return decrypt_secret(value) if field.endswith("_key") else value


def _mask(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 4:
        return "****"
    return "****" + value[-4:]


@settings_bp.route("/api/settings/keys", methods=["POST"])
def save_keys():
    data = request.get_json(silent=True) or {}
    updated = []
    prepared = {}

    try:
        for field in ALLOWED_FIELDS:
            if field not in data:
                continue
            raw = data[field]
            if not isinstance(raw, str):
                continue
            value = raw.strip()
            prepared[field] = encrypt_secret(value) if field.endswith("_key") else value
    except SecretStorageError as exc:
        return jsonify({"error": str(exc)}), 503

    # Prepare every field before writing so a bad encryption setup cannot cause
    # a partial settings update.
    for field, value in prepared.items():
        if value:
            _set(field, value)
        elif redis_client:
            redis_client.delete(_REDIS_PREFIX + field)
        else:
            _mem_store.pop(field, None)
        updated.append(field)

    if updated:
        reload_clients()

    return jsonify({"status": "ok", "updated": updated})


@settings_bp.route("/api/settings/keys", methods=["GET"])
def get_keys():
    result = {}
    try:
        for field in ALLOWED_FIELDS:
            raw = _get(field)
            if field.endswith("_key"):
                result[field] = _mask(raw)
            else:
                result[field] = raw  # model names are not sensitive
    except SecretStorageError as exc:
        return jsonify({"error": str(exc)}), 503
    return jsonify(result)


# ─── Professor custom prompt ──────────────────────────────────────────────────

_PROMPT_KEY = _REDIS_PREFIX + "professor_prompt"


@settings_bp.route("/api/ai/status", methods=["GET"])
def ai_status():
    """Which AI mode is active (hosted or local). Never exposes keys."""
    return jsonify(llm.status(check=request.args.get("check") == "1"))


@settings_bp.route("/api/settings/prompt", methods=["GET"])
def get_prompt():
    if redis_client:
        raw = redis_client.get(_PROMPT_KEY)
    else:
        raw = _mem_store.get("professor_prompt")
    return jsonify({"prompt": raw or ""})


@settings_bp.route("/api/settings/prompt", methods=["POST"])
def save_prompt():
    data = request.get_json(silent=True) or {}
    prompt = data.get("prompt", "")
    if not isinstance(prompt, str):
        return jsonify({"error": "prompt must be a string"}), 400
    if redis_client:
        redis_client.set(_PROMPT_KEY, prompt)
    else:
        _mem_store["professor_prompt"] = prompt
    return jsonify({"status": "ok"})
