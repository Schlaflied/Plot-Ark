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

# ---------------------------------------------------------------------------
# Encryption key for student API keys (Fernet symmetric)
# Generate one with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# ---------------------------------------------------------------------------
API_KEY_ENCRYPTION_KEY = os.getenv("API_KEY_ENCRYPTION_KEY", "")

# ---------------------------------------------------------------------------
# Available models for Model Selection UI
# ---------------------------------------------------------------------------
AVAILABLE_MODELS = [
    {"value": "gpt-4o",           "label": "GPT-4o",           "provider": "openai",    "cost": 0.52},
    {"value": "gpt-4o-mini",      "label": "GPT-4o Mini",      "provider": "openai",    "cost": 0.03},
    {"value": "claude-sonnet-4-6", "label": "Claude Sonnet 4.6","provider": "anthropic", "cost": 0.72},
    {"value": "claude-haiku-4-5", "label": "Claude Haiku 4.5",  "provider": "anthropic", "cost": 0.24},
    {"value": "claude-opus-4-7",  "label": "Claude Opus 4.7",   "provider": "anthropic", "cost": 1.20},
    {"value": "gemini-2.5-flash", "label": "Gemini 2.5 Flash",  "provider": "google",    "cost": 0.11},
    {"value": "gemini-3-flash",   "label": "Gemini 3 Flash",    "provider": "google",    "cost": 0.14},
]

DEFAULT_MODEL_CONFIG = {
    "use_own_key": False,
    "api_keys": {"openai": "", "anthropic": "", "google": ""},
    "roles": {
        "explainer": "gpt-4o",
        "checker": "claude-haiku-4-5",
        "adapter": "gemini-2.5-flash",
    },
}
