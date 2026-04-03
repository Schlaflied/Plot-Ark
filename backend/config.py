"""Pure configuration constants — environment variables and settings only."""

import os
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# AI provider selection
# ---------------------------------------------------------------------------
AI_PROVIDER = os.getenv("AI_PROVIDER", "openai").lower()

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://plotark:plotark@postgres:5432/plotark")

# ---------------------------------------------------------------------------
# API keys (consumed by extensions.py)
# ---------------------------------------------------------------------------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY")
