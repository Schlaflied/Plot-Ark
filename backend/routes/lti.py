"""LTI 1.3 Tool endpoints (Moodle → Plot Ark). Additional entry point only;
the existing email/role login is untouched.

  GET|POST /api/lti/login        OIDC third-party-initiated login
  POST     /api/lti/launch       id_token launch (resource link + deep linking)
  POST     /api/lti/session      SPA exchanges one-time code for identity
  GET      /api/lti/deep-link    course picker (instructors)
  POST     /api/lti/deep-link    signed LtiDeepLinkingResponse auto-post to platform
  GET      /api/lti/jwks         Tool public JWKS (Moodle fetches this)
"""

import json
import secrets
from html import escape
from urllib.parse import quote

from flask import Blueprint, request, jsonify, redirect, make_response

from db import get_db
from services import lti

lti_bp = Blueprint("lti", __name__)

BINDING_COOKIE = "plotark_lti_binding"


def _cfg() -> lti.PlatformConfig:
    cfg = lti.load_platform_config()
    if cfg is None:
        raise lti.LTIError("LTI is not configured on this server", 404)
    return cfg


def _error_response(e: lti.LTIError):
    # Explicit, non-anonymous failure: never fall through to a session.
    return jsonify({"error": e.message, "lti": True}), e.status


# ── Persistence ───────────────────────────────────────────────────────────────

def resolve_user(issuer: str, sub: str, role: str, name: str, contact_email: str) -> dict:
    """Create or match the Plot Ark account by (issuer, sub)."""
    email = lti.synthetic_email(issuer, sub)
    conn = get_db()
    if not conn:
        raise lti.LTIError("Database unavailable", 503)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO lti_users (issuer, sub, email, role, display_name, contact_email)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (issuer, sub) DO UPDATE
              SET role = EXCLUDED.role, display_name = EXCLUDED.display_name,
                  contact_email = EXCLUDED.contact_email, last_launch_at = NOW()
            RETURNING email, role
            """,
            (issuer, sub, email, role, name, contact_email),
        )
        row = cur.fetchone()
        conn.commit()
        cur.close()
        return {"email": row[0], "role": row[1], "display_name": name}
    except Exception as e:
        conn.rollback()
        print(f"[lti] resolve_user error: {e}")
        raise lti.LTIError("Could not create or match account", 500)
    finally:
        conn.close()


def list_courses() -> list[dict]:
    conn = get_db()
    if not conn:
        raise lti.LTIError("Database unavailable", 503)
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, topic, course_code, modules FROM curricula ORDER BY id DESC LIMIT 200")
        out = []
        for cid, topic, code, modules in cur.fetchall():
            mods = [
                {"index": i + 1, "title": (m.get("title") if isinstance(m, dict) else None) or f"Module {i + 1}"}
                for i, m in enumerate(modules or [])
            ]
            out.append({"id": cid, "topic": topic or "", "course_code": code or "", "modules": mods})
        cur.close()
        return out
    finally:
        conn.close()


# ── OIDC login initiation ─────────────────────────────────────────────────────

@lti_bp.route("/api/lti/login", methods=["GET", "POST"])
def oidc_login():
    try:
        cfg = _cfg()
        params = request.form if request.method == "POST" else request.args
        url, binding = lti.begin_login(cfg, params)
    except lti.LTIError as e:
        return _error_response(e)
    resp = redirect(url, code=302)
    secure = cfg.tool_base_url.startswith("https://")
    resp.set_cookie(
        BINDING_COOKIE, binding, max_age=lti.STATE_TTL, httponly=True,
        secure=secure, samesite="None" if secure else "Lax", path="/api/lti",
    )
    return resp


# ── Launch ────────────────────────────────────────────────────────────────────

@lti_bp.route("/api/lti/launch", methods=["POST"])
def launch():
    try:
        cfg = _cfg()
        claims = lti.validate_launch(
            cfg, request.form.get("id_token", ""), request.form.get("state", ""),
            request.cookies.get(BINDING_COOKIE),
        )
        role = lti.map_role(claims)
        issuer, sub = claims["iss"], claims["sub"]
        name = lti.clean_text(claims.get("name"))
        contact = lti.clean_email(claims.get("email"))

        if claims[lti.MSG_TYPE] == lti.MSG_DEEP_LINK_REQUEST:
            if role != "professor":
                raise lti.LTIError("Only instructors can use deep linking", 403)
            if not (claims.get(lti.DL_SETTINGS) or {}).get("deep_link_return_url"):
                raise lti.LTIError("Deep linking request has no return URL")
            token = secrets.token_urlsafe(32)
            lti.store.put("dl:" + token, claims, lti.STATE_TTL)
            return redirect(f"/api/lti/deep-link?token={quote(token)}", code=303)

        user = resolve_user(issuer, sub, role, name, contact)
        course_id, module = lti.parse_target(claims)
        code = secrets.token_urlsafe(32)
        lti.store.put("code:" + code, {**user, "path": lti.landing_path(course_id, module)}, lti.CODE_TTL)
        return redirect(f"{cfg.tool_base_url.rstrip('/')}/lti/callback?code={quote(code)}", code=303)
    except lti.LTIError as e:
        return _error_response(e)


@lti_bp.route("/api/lti/session", methods=["POST"])
def exchange_code():
    """One-time code → identity the SPA feeds into its existing login()."""
    code = (request.get_json(silent=True) or {}).get("code", "")
    data = lti.store.pop("code:" + code) if isinstance(code, str) and code else None
    if not data:
        return jsonify({"error": "Invalid or expired launch code", "lti": True}), 401
    return jsonify(data), 200


# ── Deep linking ──────────────────────────────────────────────────────────────

def _page(body: str):
    html = ("<!doctype html><meta charset=utf-8><title>Plot Ark – choose content</title>"
            "<body style='font-family:system-ui;max-width:42rem;margin:2rem auto'>" + body)
    resp = make_response(html)
    resp.headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action *"
    return resp


@lti_bp.route("/api/lti/deep-link", methods=["GET"])
def deep_link_picker():
    token = request.args.get("token", "")
    if not lti.store.peek("dl:" + token):
        return jsonify({"error": "Invalid or expired deep-linking session", "lti": True}), 401
    try:
        courses = list_courses()
    except lti.LTIError as e:
        return _error_response(e)
    rows = []
    for c in courses:
        label = escape(f"{c['course_code']} {c['topic']}".strip() or f"Course {c['id']}")
        rows.append(f"<h3>{label}</h3><label><input type=radio name=pick value='{c['id']}:0'> Whole course</label><br>")
        for m in c["modules"]:
            rows.append(f"<label><input type=radio name=pick value='{c['id']}:{m['index']}'> "
                        f"{escape(m['title'])}</label><br>")
    body = ("<h2>Choose a Plot Ark course or module</h2>"
            "<form method=post action='/api/lti/deep-link'>"
            f"<input type=hidden name=token value='{escape(token)}'>" + "".join(rows) +
            "<p><button type=submit>Add to Moodle</button></p></form>")
    return _page(body)


@lti_bp.route("/api/lti/deep-link", methods=["POST"])
def deep_link_response():
    try:
        cfg = _cfg()
        dl_claims = lti.store.pop("dl:" + request.form.get("token", ""))
        if not dl_claims:
            raise lti.LTIError("Invalid or expired deep-linking session", 401)
        try:
            cid_s, mod_s = request.form.get("pick", "").split(":")
            course_id, module = int(cid_s), int(mod_s)
        except ValueError:
            raise lti.LTIError("Invalid selection")
        course = next((c for c in list_courses() if c["id"] == course_id), None)
        if not course:
            raise lti.LTIError("Unknown course", 404)
        title = f"{course['course_code']} {course['topic']}".strip()
        if module:
            mod = next((m for m in course["modules"] if m["index"] == module), None)
            if not mod:
                raise lti.LTIError("Unknown module", 404)
            title = f"{title} – {mod['title']}"
        items = lti.build_content_items(cfg, [{"course_id": course_id, "module": module or None, "title": title}])
        signed = lti.sign_deep_link_response(cfg, dl_claims, items)
        return_url = dl_claims[lti.DL_SETTINGS]["deep_link_return_url"]
    except lti.LTIError as e:
        return _error_response(e)
    return _page(
        f"<form id=f method=post action='{escape(return_url)}'>"
        f"<input type=hidden name=JWT value='{escape(signed)}'><noscript><button>Continue</button></noscript></form>"
        "<script>document.getElementById('f').submit()</script>"
    )


@lti_bp.route("/api/lti/jwks", methods=["GET"])
def tool_jwks():
    """Public half of the Tool's signing key, for the platform to verify deep-link responses."""
    import jwt as _jwt
    from cryptography.hazmat.primitives import serialization
    cfg = lti.load_platform_config()
    if not cfg or not cfg.tool_private_key_pem:
        return jsonify({"keys": []}), 200
    priv = serialization.load_pem_private_key(cfg.tool_private_key_pem.encode(), password=None)
    jwk = json.loads(_jwt.algorithms.RSAAlgorithm.to_jwk(priv.public_key()))
    jwk.update({"kid": cfg.tool_kid, "alg": "RS256", "use": "sig"})
    return jsonify({"keys": [jwk]}), 200
