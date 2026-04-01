"""Global configuration: Flask app, AI clients, Redis, and environment setup."""

import os
import asyncio
import threading as _threading

from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI
import google.generativeai as genai
from tavily import TavilyClient

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------
load_dotenv()

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ---------------------------------------------------------------------------
# AI provider selection
# ---------------------------------------------------------------------------
AI_PROVIDER = os.getenv("AI_PROVIDER", "openai").lower()
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
tavily_client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://plotark:plotark@postgres:5432/plotark")

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
# Persistent background event loop for async operations (e.g. LightRAG)
# ---------------------------------------------------------------------------
bg_loop = asyncio.new_event_loop()
_bg_thread = _threading.Thread(target=bg_loop.run_forever, daemon=True)
_bg_thread.start()


def run_async(coro):
    """Submit a coroutine to the persistent background event loop and wait for result."""
    future = asyncio.run_coroutine_threadsafe(coro, bg_loop)
    return future.result(timeout=120)
