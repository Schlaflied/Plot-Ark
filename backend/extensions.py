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
# AI clients
# ---------------------------------------------------------------------------
openai_client = OpenAI(api_key=OPENAI_API_KEY)
genai.configure(api_key=GEMINI_API_KEY)
tavily_client = TavilyClient(api_key=TAVILY_API_KEY)

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
