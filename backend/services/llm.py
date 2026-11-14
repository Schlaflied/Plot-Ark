"""Optional local-model mode (Ollama-compatible endpoint).

Selected with ``AI_PROVIDER=local``. The default hosted behaviour
(``openai`` / ``gemini``) is untouched. In local mode every LLM step talks only
to ``LOCAL_LLM_BASE_URL``; on any failure the step raises an ``LLMError`` that
the caller reports. There is deliberately NO fallback to a hosted model.
"""

import json
from urllib.parse import urlparse

import requests

import config


class LLMError(Exception):
    """Base class for local-model failures that must be reported to the user."""


class LocalModelUnavailable(LLMError):
    """The local endpoint could not be reached or returned an HTTP error."""


class LocalModelOutputError(LLMError):
    """The local model answered, but the output is not the expected structure."""


def is_local() -> bool:
    # Read at call time so the switch can be tested / changed without re-import.
    return config.AI_PROVIDER == "local"


def _base_url() -> str:
    return config.LOCAL_LLM_BASE_URL.rstrip("/")


def _unavailable(exc: Exception) -> LocalModelUnavailable:
    return LocalModelUnavailable(
        f"Local model unavailable at {_base_url()} ({type(exc).__name__}). "
        "Nothing was sent to a hosted service. Check that the Ollama-compatible "
        "server is running and LOCAL_LLM_BASE_URL / LOCAL_LLM_MODEL are correct."
    )


def _payload(prompt, stream, temperature, max_tokens, json_mode):
    options = {}
    if temperature is not None:
        options["temperature"] = temperature
    if max_tokens is not None:
        options["num_predict"] = max_tokens
    body = {
        "model": config.LOCAL_LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "stream": stream,
    }
    if options:
        body["options"] = options
    if json_mode:
        body["format"] = "json"
    return body


def local_chat(prompt, *, temperature=None, max_tokens=None, json_mode=False) -> str:
    """Single non-streaming completion from the local endpoint."""
    try:
        resp = requests.post(
            f"{_base_url()}/api/chat",
            json=_payload(prompt, False, temperature, max_tokens, json_mode),
            timeout=config.LOCAL_LLM_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError) as exc:
        raise _unavailable(exc) from exc
    try:
        text = data["message"]["content"]
    except (KeyError, TypeError) as exc:
        raise LocalModelOutputError(
            "Local model response had no message content."
        ) from exc
    if not isinstance(text, str) or not text.strip():
        raise LocalModelOutputError("Local model returned an empty response.")
    return text


def local_stream(prompt, *, temperature=None, max_tokens=None):
    """Yield text deltas from the local endpoint (Ollama NDJSON stream)."""
    try:
        resp = requests.post(
            f"{_base_url()}/api/chat",
            json=_payload(prompt, True, temperature, max_tokens, False),
            timeout=config.LOCAL_LLM_TIMEOUT,
            stream=True,
        )
        resp.raise_for_status()
        for line in resp.iter_lines():
            if not line:
                continue
            try:
                chunk = json.loads(line)
            except ValueError as exc:
                raise LocalModelOutputError(
                    "Local model stream contained a malformed chunk."
                ) from exc
            delta = (chunk.get("message") or {}).get("content") or ""
            if delta:
                yield delta
            if chunk.get("done"):
                break
    except requests.RequestException as exc:
        raise _unavailable(exc) from exc


def parse_json_object(text, required_keys=()):
    """Extract and validate a JSON object from model text.

    Raises LocalModelOutputError if no object is found, it is not valid JSON,
    or a required key is missing.
    """
    clean = text.replace("```json", "").replace("```", "").strip()
    try:
        parsed = json.loads(clean[clean.index("{"): clean.rindex("}") + 1])
    except ValueError as exc:
        raise LocalModelOutputError(
            "Local model output was not valid JSON; the step was not completed."
        ) from exc
    if not isinstance(parsed, dict):
        raise LocalModelOutputError("Local model output was not a JSON object.")
    missing = [k for k in required_keys if k not in parsed]
    if missing:
        raise LocalModelOutputError(
            f"Local model output is missing expected fields: {', '.join(missing)}."
        )
    return parsed


def reachable(timeout=2.0) -> bool:
    try:
        return requests.get(f"{_base_url()}/api/tags", timeout=timeout).ok
    except requests.RequestException:
        return False


def status(check=False) -> dict:
    """Describe the active AI mode (safe to expose: no keys, host only)."""
    if is_local():
        parsed = urlparse(_base_url())
        info = {
            "mode": "local",
            "provider": "local",
            "endpoint": parsed.netloc or _base_url(),
            "model": config.LOCAL_LLM_MODEL,
            "hosted_fallback": False,
            "message": (
                f"Local model mode: {config.LOCAL_LLM_MODEL} at "
                f"{parsed.netloc or _base_url()}. Learner data is not sent to a hosted model."
            ),
        }
        if check:
            info["reachable"] = reachable()
        return info
    return {
        "mode": "hosted",
        "provider": config.AI_PROVIDER,
        "hosted_fallback": False,
        "message": f"Hosted model mode: {config.AI_PROVIDER}.",
    }


def startup_message() -> str:
    return "[AI] " + status()["message"]
