"""LTI 1.3 Tool (Plot Ark) protocol helpers — MVP, single platform deployment.

Scope: OIDC third-party-initiated login, id_token validation against the
platform's public keys, role mapping, and Deep Linking response signing.
Out of scope (follow-ups): NRPS, AGS grade/completion passback, multi-tenant
platform registry / key management.

Signature and claim verification is delegated to PyJWT; this module only adds
the LTI-specific checks (nonce, deployment, message type, roles) on top.
"""

import hashlib
import hmac
import os
import re
import secrets
import threading
import time
import uuid
from dataclasses import dataclass, field

import jwt

CLAIM = "https://purl.imsglobal.org/spec/lti/claim/"
DL_CLAIM = "https://purl.imsglobal.org/spec/lti-dl/claim/"
MSG_TYPE = CLAIM + "message_type"
VERSION = CLAIM + "version"
DEPLOYMENT_ID = CLAIM + "deployment_id"
TARGET_LINK_URI = CLAIM + "target_link_uri"
ROLES = CLAIM + "roles"
CUSTOM = CLAIM + "custom"
RESOURCE_LINK = CLAIM + "resource_link"
DL_SETTINGS = DL_CLAIM + "deep_linking_settings"

MSG_RESOURCE_LINK = "LtiResourceLinkRequest"
MSG_DEEP_LINK_REQUEST = "LtiDeepLinkingRequest"
MSG_DEEP_LINK_RESPONSE = "LtiDeepLinkingResponse"

ALLOWED_ALGS = ["RS256"]
LEEWAY_SECONDS = 30
STATE_TTL = 600
CODE_TTL = 60

_INSTRUCTOR = {
    "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor",
}
_LEARNER = {
    "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner",
}


class LTIError(Exception):
    """Launch/login rejected. `status` is the HTTP status to return."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


@dataclass
class PlatformConfig:
    issuer: str
    client_id: str
    deployment_id: str
    auth_url: str
    jwks_url: str = ""
    # Static JWKS ({"keys": [...]}) — used instead of jwks_url (tests / air-gapped).
    jwks: dict | None = None
    tool_private_key_pem: str = ""
    tool_kid: str = "plotark-lti-1"
    tool_base_url: str = ""
    state_secret: str = field(default="", repr=False)

    @property
    def launch_url(self) -> str:
        return self.tool_base_url.rstrip("/") + "/api/lti/launch"


def load_platform_config() -> PlatformConfig | None:
    """Single Moodle deployment configured via env. None = LTI disabled."""
    issuer = os.getenv("LTI_ISSUER", "").strip()
    client_id = os.getenv("LTI_CLIENT_ID", "").strip()
    if not issuer or not client_id:
        return None
    return PlatformConfig(
        issuer=issuer,
        client_id=client_id,
        deployment_id=os.getenv("LTI_DEPLOYMENT_ID", "").strip(),
        auth_url=os.getenv("LTI_AUTH_URL", "").strip(),
        jwks_url=os.getenv("LTI_JWKS_URL", "").strip(),
        tool_private_key_pem=os.getenv("LTI_TOOL_PRIVATE_KEY", "").replace("\\n", "\n"),
        tool_kid=os.getenv("LTI_TOOL_KID", "plotark-lti-1"),
        tool_base_url=os.getenv("LTI_TOOL_BASE_URL", "").strip(),
        state_secret=os.getenv("LTI_STATE_SECRET", ""),
    )


# ── Short-lived one-time store (state / nonce / exchange codes) ───────────────

class OneTimeStore:
    """In-process TTL store; each key can be consumed exactly once.

    MVP limitation: per-process. Run a single worker or swap for Redis.
    """

    def __init__(self):
        self._data: dict[str, tuple[float, object]] = {}
        self._lock = threading.Lock()

    def put(self, key: str, value, ttl: int):
        with self._lock:
            now = time.time()
            self._data = {k: v for k, v in self._data.items() if v[0] > now}
            self._data[key] = (now + ttl, value)

    def peek(self, key: str):
        with self._lock:
            item = self._data.get(key)
        return item[1] if item and item[0] >= time.time() else None

    def pop(self, key: str):
        with self._lock:
            item = self._data.pop(key, None)
        if not item or item[0] < time.time():
            return None
        return item[1]


store = OneTimeStore()


def _sign(cfg: PlatformConfig, value: str) -> str:
    return hmac.new(cfg.state_secret.encode(), value.encode(), hashlib.sha256).hexdigest()


# ── OIDC third-party-initiated login ──────────────────────────────────────────

def begin_login(cfg: PlatformConfig, params: dict) -> tuple[str, str]:
    """Validate the initiation request; return (redirect_url, browser_binding)."""
    from urllib.parse import urlencode

    if not cfg.state_secret:
        raise LTIError("LTI is not fully configured (LTI_STATE_SECRET missing)", 503)
    if params.get("iss") != cfg.issuer:
        raise LTIError("Unknown platform issuer")
    client_id = params.get("client_id")
    if client_id and client_id != cfg.client_id:
        raise LTIError("Unknown client_id")
    login_hint = params.get("login_hint")
    target = params.get("target_link_uri")
    if not login_hint or not target:
        raise LTIError("Missing login_hint or target_link_uri")
    if not target.startswith(cfg.tool_base_url.rstrip("/") + "/"):
        raise LTIError("target_link_uri is outside this tool")

    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    binding = secrets.token_urlsafe(24)
    store.put("state:" + state, {"nonce": nonce, "binding_sig": _sign(cfg, binding)}, STATE_TTL)

    query = {
        "scope": "openid",
        "response_type": "id_token",
        "response_mode": "form_post",
        "prompt": "none",
        "client_id": cfg.client_id,
        "redirect_uri": cfg.launch_url,
        "login_hint": login_hint,
        "state": state,
        "nonce": nonce,
    }
    if params.get("lti_message_hint"):
        query["lti_message_hint"] = params["lti_message_hint"]
    return f"{cfg.auth_url}{'&' if '?' in cfg.auth_url else '?'}{urlencode(query)}", binding


# ── Launch validation ─────────────────────────────────────────────────────────

def _signing_key(cfg: PlatformConfig, token: str):
    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except jwt.PyJWTError:
        raise LTIError("Malformed id_token")
    if cfg.jwks is not None:
        keyset = jwt.PyJWKSet.from_dict(cfg.jwks)
        for k in keyset.keys:
            if kid is None or k.key_id == kid:
                return k.key
        raise LTIError("Signing key not found in platform JWKS", 401)
    if not cfg.jwks_url:
        raise LTIError("Platform JWKS is not configured", 503)
    try:
        return jwt.PyJWKClient(cfg.jwks_url, timeout=5).get_signing_key_from_jwt(token).key
    except jwt.PyJWTError:
        raise LTIError("Signing key not found in platform JWKS", 401)
    except Exception:
        raise LTIError("Could not fetch platform JWKS", 502)


def validate_launch(cfg: PlatformConfig, id_token: str, state: str, binding: str | None) -> dict:
    """Fully verify a launch id_token. Returns the verified claims or raises LTIError."""
    if not id_token or not state:
        raise LTIError("Missing id_token or state")
    saved = store.pop("state:" + state)  # one-time: replayed state is rejected
    if not saved:
        raise LTIError("Invalid or expired state", 401)
    if not binding or not hmac.compare_digest(saved["binding_sig"], _sign(cfg, binding)):
        raise LTIError("State does not belong to this browser session", 401)

    key = _signing_key(cfg, id_token)
    try:
        claims = jwt.decode(
            id_token,
            key=key,
            algorithms=ALLOWED_ALGS,  # never accept "none"/HS*
            audience=cfg.client_id,
            issuer=cfg.issuer,
            leeway=LEEWAY_SECONDS,
            options={"require": ["exp", "iat", "iss", "aud", "sub", "nonce"]},
        )
    except jwt.ExpiredSignatureError:
        raise LTIError("Launch token has expired", 401)
    except jwt.PyJWTError as e:
        raise LTIError(f"Launch token failed verification: {e}", 401)

    if not hmac.compare_digest(str(claims["nonce"]), saved["nonce"]):
        raise LTIError("Nonce mismatch", 401)
    aud = claims["aud"]
    if isinstance(aud, list) and len(aud) > 1 and claims.get("azp") != cfg.client_id:
        raise LTIError("Invalid authorized party (azp)", 401)
    if claims.get(VERSION) != "1.3.0":
        raise LTIError("Unsupported LTI version")
    if cfg.deployment_id and claims.get(DEPLOYMENT_ID) != cfg.deployment_id:
        raise LTIError("Unknown deployment_id", 403)
    if not isinstance(claims.get("sub"), str) or not claims["sub"] or len(claims["sub"]) > 255:
        raise LTIError("Invalid sub claim")
    if claims.get(MSG_TYPE) not in (MSG_RESOURCE_LINK, MSG_DEEP_LINK_REQUEST):
        raise LTIError("Unsupported LTI message type")
    return claims


# ── Untrusted-claim helpers ───────────────────────────────────────────────────

def map_role(claims: dict) -> str:
    """Instructor → professor, Learner → student; anything else is rejected."""
    raw = claims.get(ROLES)
    roles = set(r for r in raw if isinstance(r, str)) if isinstance(raw, list) else set()
    if roles & _INSTRUCTOR:
        return "professor"  # instructor wins if both are present
    if roles & _LEARNER:
        return "student"
    raise LTIError("No supported LTI role (Instructor/Learner) in launch", 403)


_CTRL = re.compile(r"[\x00-\x1f\x7f<>]")


def clean_text(value, max_len: int = 120) -> str:
    if not isinstance(value, str):
        return ""
    return _CTRL.sub("", value).strip()[:max_len]


_EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,190}$")


def clean_email(value) -> str:
    v = clean_text(value, 254)
    return v if _EMAIL.match(v) else ""


def synthetic_email(issuer: str, sub: str) -> str:
    """Identity key for Plot Ark's email-keyed tables.

    Derived from (issuer, sub), never from the platform-supplied email, so a
    launch can't be used to take over an existing account by claiming its email.
    """
    digest = hashlib.sha256(f"{issuer}|{sub}".encode()).hexdigest()[:24]
    return f"lti-{digest}@lti.plot-ark.invalid"


def parse_target(claims: dict) -> tuple[int | None, int | None]:
    """course_id / module from the link's custom params (set by Deep Linking)."""
    custom = claims.get(CUSTOM) if isinstance(claims.get(CUSTOM), dict) else {}

    def _int(v):
        try:
            n = int(str(v))
            return n if 0 < n < 2**31 else None
        except (TypeError, ValueError):
            return None

    return _int(custom.get("course_id")), _int(custom.get("module"))


def landing_path(course_id: int | None, module: int | None) -> str:
    if not course_id:
        return "/courses"
    path = f"/course/{course_id}"
    return path + (f"?module={module}" if module else "")


# ── Deep Linking response ─────────────────────────────────────────────────────

def build_content_items(cfg: PlatformConfig, selections: list[dict]) -> list[dict]:
    items = []
    for s in selections:
        course_id, module = s["course_id"], s.get("module")
        custom = {"course_id": str(course_id)}
        if module:
            custom["module"] = str(module)
        items.append({
            "type": "ltiResourceLink",
            "title": clean_text(s.get("title"), 200) or f"Plot Ark course {course_id}",
            "url": cfg.launch_url,
            "custom": custom,
        })
    return items


def sign_deep_link_response(cfg: PlatformConfig, dl_claims: dict, items: list[dict]) -> str:
    """Build the signed LtiDeepLinkingResponse JWT to POST back to the platform."""
    if not cfg.tool_private_key_pem:
        raise LTIError("Tool private key is not configured", 503)
    settings = dl_claims.get(DL_SETTINGS) or {}
    now = int(time.time())
    payload = {
        "iss": cfg.client_id,
        "aud": cfg.issuer,
        "iat": now,
        "exp": now + 300,
        "nonce": uuid.uuid4().hex,
        MSG_TYPE: MSG_DEEP_LINK_RESPONSE,
        VERSION: "1.3.0",
        DEPLOYMENT_ID: dl_claims.get(DEPLOYMENT_ID) or cfg.deployment_id,
        DL_CLAIM + "content_items": items,
    }
    if settings.get("data"):
        payload[DL_CLAIM + "data"] = settings["data"]
    return jwt.encode(payload, cfg.tool_private_key_pem, algorithm="RS256",
                      headers={"kid": cfg.tool_kid})
