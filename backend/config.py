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
    # ── OpenAI ──
    {"value": "gpt-4o",           "label": "GPT-4o",             "provider": "openai",    "cost": 0.52, "arch": "dense", "recommended": True},
    {"value": "gpt-4o-mini",      "label": "GPT-4o Mini",        "provider": "openai",    "cost": 0.03, "arch": "dense"},
    # ── Anthropic ──
    {"value": "claude-sonnet-4-6","label": "Claude Sonnet 4.6",   "provider": "anthropic", "cost": 0.72, "arch": "dense", "recommended": True},
    {"value": "claude-haiku-4-5", "label": "Claude Haiku 4.5",    "provider": "anthropic", "cost": 0.24, "arch": "dense"},
    {"value": "claude-opus-4-7",  "label": "Claude Opus 4.7",     "provider": "anthropic", "cost": 1.20, "arch": "dense"},
    # ── Google ──
    {"value": "gemini-2.5-flash", "label": "Gemini 2.5 Flash",    "provider": "google",    "cost": 0.11, "arch": "dense", "recommended": True},
    {"value": "gemini-3-flash",   "label": "Gemini 3 Flash",      "provider": "google",    "cost": 0.14, "arch": "dense"},
    # ── DeepSeek ──
    {"value": "deepseek-v3",      "label": "DeepSeek V3",         "provider": "deepseek",  "cost": 0.07, "arch": "moe"},
    {"value": "deepseek-r1",      "label": "DeepSeek R1",         "provider": "deepseek",  "cost": 0.14, "arch": "moe"},
    # ── Mistral ──
    {"value": "mistral-large",    "label": "Mistral Large",       "provider": "mistral",   "cost": 0.50, "arch": "moe"},
    {"value": "mistral-small",    "label": "Mistral Small",       "provider": "mistral",   "cost": 0.10, "arch": "moe"},
    # ── xAI ──
    {"value": "grok-3",           "label": "Grok 3",              "provider": "xai",       "cost": 0.60, "arch": "moe"},
    {"value": "grok-3-mini",      "label": "Grok 3 Mini",         "provider": "xai",       "cost": 0.15, "arch": "moe"},
    # ── Groq ──
    {"value": "llama-3.3-70b",    "label": "Llama 3.3 70B (Groq)","provider": "groq",      "cost": 0.06, "arch": "moe"},
    # ── MiniMax ──
    {"value": "minimax-01",       "label": "MiniMax-01",          "provider": "minimax",   "cost": 0.08, "arch": "moe"},
    # ── GLM (Zhipu) ──
    {"value": "glm-4-flash",      "label": "GLM-4 Flash",         "provider": "glm",       "cost": 0.05, "arch": "dense"},
    {"value": "glm-4-plus",       "label": "GLM-4 Plus",          "provider": "glm",       "cost": 0.20, "arch": "dense"},
]

DEFAULT_MODEL_CONFIG = {
    "use_own_key": False,
    "api_keys": {"openai": "", "anthropic": "", "google": ""},
    "custom_models": [],
    "roles": {
        "explainer": "gpt-4o",
        "checker": "claude-haiku-4-5",
        "adapter": "gemini-2.5-flash",
    },
}

