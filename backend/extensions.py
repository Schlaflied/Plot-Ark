"""Flask app, AI clients, Redis, and third-party service initialization."""

from flask import Flask
from flask_cors import CORS
from openai import OpenAI
import google.generativeai as genai
from tavily import TavilyClient

from config import AI_PROVIDER, OPENAI_API_KEY, GEMINI_API_KEY, TAVILY_API_KEY

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ---------------------------------------------------------------------------
# Redis (optional)
# ---------------------------------------------------------------------------
try:
    import redis as _redis_lib
    redis_client = _redis_lib.Redis(host="redis", port=6379, db=0, decode_responses=True)
    redis_client.ping()
    print("Redis cache connected.")
except Exception as _redis_err:
    print(f"Redis unavailable, caching disabled: {_redis_err}")
    redis_client = None

# ---------------------------------------------------------------------------
# Helpers: resolve a setting from Redis first, fall back to env var
# ---------------------------------------------------------------------------
_REDIS_PREFIX = "plotark:settings:"


def _resolve(redis_key: str, env_fallback: str | None) -> str | None:
    if redis_client:
        stored = redis_client.get(_REDIS_PREFIX + redis_key)
        if stored:
            return stored
    return env_fallback


# ---------------------------------------------------------------------------
# AI clients (initialized once at startup; reloaded via reload_clients())
# ---------------------------------------------------------------------------
openai_client = OpenAI(api_key=_resolve("openai_key", OPENAI_API_KEY))
genai.configure(api_key=_resolve("gemini_key", GEMINI_API_KEY) or "")
tavily_client = TavilyClient(api_key=_resolve("tavily_key", TAVILY_API_KEY))


def reload_clients() -> None:
    """Re-read API keys from Redis (falling back to env vars) and reinitialize AI clients.

    Called by the settings route after a key is saved so new keys take effect
    immediately without restarting the process.
    """
    global openai_client, tavily_client

    openai_key = _resolve("openai_key", OPENAI_API_KEY)
    gemini_key = _resolve("gemini_key", GEMINI_API_KEY) or ""
    tavily_key = _resolve("tavily_key", TAVILY_API_KEY)

    try:
        openai_client = OpenAI(api_key=openai_key)
    except Exception as e:
        print(f"reload_clients: OpenAI init failed: {e}")

    try:
        genai.configure(api_key=gemini_key)
    except Exception as e:
        print(f"reload_clients: Gemini configure failed: {e}")

    try:
        tavily_client = TavilyClient(api_key=tavily_key)
    except Exception as e:
        print(f"reload_clients: Tavily init failed: {e}")

    print("reload_clients: AI clients reinitialized.")
