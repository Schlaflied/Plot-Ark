"""LTI 1.3 tool tests — fixture Moodle platform, throwaway RSA keys only."""

import json
import os
import re
import sys
import time
import types
import unittest
from unittest.mock import Mock, patch
from urllib.parse import urlparse, parse_qs

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from flask import Flask

extensions_stub = types.ModuleType("extensions")
extensions_stub.redis_client = None
extensions_stub.reload_clients = Mock()
sys.modules.setdefault("extensions", extensions_stub)

from routes import lti as lti_routes  # noqa: E402
from services import lti  # noqa: E402

ISS = "https://moodle.fixture.test"
CLIENT = "plotark-client-fixture"
DEPLOY = "1"
BASE = "https://plotark.fixture.test"
INSTRUCTOR = "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor"
LEARNER = "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner"


def _keypair():
    k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = k.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                          serialization.NoEncryption()).decode()
    return k, pem


PLATFORM_KEY, PLATFORM_PEM = _keypair()
ROGUE_KEY, ROGUE_PEM = _keypair()
TOOL_KEY, TOOL_PEM = _keypair()
PLATFORM_JWKS = {"keys": [{**json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(PLATFORM_KEY.public_key())),
                           "kid": "plat-1", "alg": "RS256", "use": "sig"}]}

ENV = {
    "LTI_ISSUER": ISS, "LTI_CLIENT_ID": CLIENT, "LTI_DEPLOYMENT_ID": DEPLOY,
    "LTI_AUTH_URL": ISS + "/mod/lti/auth.php", "LTI_TOOL_BASE_URL": BASE,
    "LTI_STATE_SECRET": "test-state-secret", "LTI_TOOL_PRIVATE_KEY": TOOL_PEM,
}


def _load_cfg():
    cfg = lti.PlatformConfig(
        issuer=ISS, client_id=CLIENT, deployment_id=DEPLOY, auth_url=ENV["LTI_AUTH_URL"],
        jwks=PLATFORM_JWKS, tool_private_key_pem=TOOL_PEM, tool_base_url=BASE,
        state_secret="test-state-secret",
    )
    return cfg


COURSES = [{"id": 7, "topic": "Intro Biology", "course_code": "BIO101",
            "modules": [{"index": 1, "title": "Cells"}, {"index": 2, "title": "Genes"}]}]


class LTITestBase(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(lti_routes.lti_bp)
        self.client = app.test_client()
        self.users = {}
        patches = [
            patch.object(lti, "load_platform_config", _load_cfg),
            patch.object(lti_routes, "resolve_user", self._resolve_user),
            patch.object(lti_routes, "list_courses", lambda: COURSES),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        lti.store._data.clear()

    def _resolve_user(self, issuer, sub, role, name, contact):
        # Mirrors the DB behaviour: keyed by (issuer, sub), identity email synthetic.
        self.users[(issuer, sub)] = {"email": lti.synthetic_email(issuer, sub), "role": role,
                                     "display_name": name}
        return self.users[(issuer, sub)]

    # -- helpers --------------------------------------------------------------
    def start_login(self):
        resp = self.client.post("/api/lti/login", data={
            "iss": ISS, "login_hint": "u42", "client_id": CLIENT,
            "target_link_uri": BASE + "/api/lti/launch", "lti_message_hint": "m1"})
        self.assertEqual(resp.status_code, 302)
        q = parse_qs(urlparse(resp.headers["Location"]).query)
        return resp, q

    def token(self, q, roles=(LEARNER,), key=PLATFORM_PEM, msg=lti.MSG_RESOURCE_LINK,
              exp_delta=300, extra=None, **over):
        now = int(time.time())
        claims = {
            "iss": ISS, "aud": CLIENT, "sub": "u42", "iat": now, "exp": now + exp_delta,
            "nonce": q["nonce"][0], "name": "Ada <b>Lovelace</b>", "email": "ada@example.com",
            lti.VERSION: "1.3.0", lti.MSG_TYPE: msg, lti.DEPLOYMENT_ID: DEPLOY,
            lti.ROLES: list(roles), lti.CUSTOM: {"course_id": "7", "module": "2"},
        }
        claims.update(extra or {})
        claims.update(over)
        return jwt.encode(claims, key, algorithm="RS256", headers={"kid": "plat-1"})

    def launch(self, token, q):
        return self.client.post("/api/lti/launch", data={"id_token": token, "state": q["state"][0]})


class ValidLaunchTests(LTITestBase):
    def test_oidc_login_redirect_shape(self):
        resp, q = self.start_login()
        self.assertTrue(resp.headers["Location"].startswith(ENV["LTI_AUTH_URL"]))
        self.assertEqual(q["response_type"], ["id_token"])
        self.assertEqual(q["redirect_uri"], [BASE + "/api/lti/launch"])
        self.assertEqual(q["client_id"], [CLIENT])
        self.assertEqual(q["login_hint"], ["u42"])
        self.assertTrue(q["state"][0] and q["nonce"][0])
        self.assertIn(lti_routes.BINDING_COOKIE, resp.headers["Set-Cookie"])

    def test_login_rejects_unknown_issuer(self):
        resp = self.client.post("/api/lti/login", data={
            "iss": "https://evil.test", "login_hint": "x", "target_link_uri": BASE + "/api/lti/launch"})
        self.assertEqual(resp.status_code, 400)

    def test_valid_launch_lands_student_on_course_page(self):
        _, q = self.start_login()
        resp = self.launch(self.token(q), q)
        self.assertEqual(resp.status_code, 303)
        loc = urlparse(resp.headers["Location"])
        self.assertEqual(loc.path, "/lti/callback")
        code = parse_qs(loc.query)["code"][0]
        sess = self.client.post("/api/lti/session", json={"code": code})
        self.assertEqual(sess.status_code, 200)
        data = sess.get_json()
        self.assertEqual(data["role"], "student")
        self.assertEqual(data["path"], "/course/7?module=2")
        self.assertEqual(data["email"], lti.synthetic_email(ISS, "u42"))
        # code is single-use
        self.assertEqual(self.client.post("/api/lti/session", json={"code": code}).status_code, 401)

    def test_account_matched_by_sub_not_email(self):
        _, q = self.start_login()
        self.launch(self.token(q, email="victim@school.edu"), q)
        _, q2 = self.start_login()
        self.launch(self.token(q2, email="someone-else@school.edu"), q2)
        self.assertEqual(len(self.users), 1)  # same sub → same account
        _, q3 = self.start_login()
        self.launch(self.token(q3, sub="u99", email="victim@school.edu"), q3)
        self.assertEqual(len(self.users), 2)  # same email, different sub → different account
        emails = {u["email"] for u in self.users.values()}
        self.assertNotIn("victim@school.edu", emails)

    def test_claims_are_sanitized(self):
        self.assertEqual(lti.clean_text("Ada <b>Lovelace</b>\x00"), "Ada bLovelace/b")
        self.assertEqual(lti.clean_email("not an email"), "")
        _, q = self.start_login()
        self.launch(self.token(q, extra={lti.CUSTOM: {"course_id": "7; DROP TABLE", "module": "-1"}}), q)
        self.assertEqual(lti.parse_target({lti.CUSTOM: {"course_id": "7; DROP", "module": "-1"}}), (None, None))
        self.assertEqual(lti.landing_path(None, None), "/courses")


class RejectedLaunchTests(LTITestBase):
    def assert_rejected(self, resp, status=401):
        self.assertEqual(resp.status_code, status)
        self.assertTrue(resp.get_json()["error"])
        self.assertNotIn("Location", resp.headers)  # no session, no redirect

    def test_invalid_signature(self):
        _, q = self.start_login()
        self.assert_rejected(self.launch(self.token(q, key=ROGUE_PEM), q))

    def test_expired_token(self):
        _, q = self.start_login()
        resp = self.launch(self.token(q, exp_delta=-3600), q)
        self.assert_rejected(resp)
        self.assertIn("expired", resp.get_json()["error"])

    def test_unsigned_token(self):
        _, q = self.start_login()
        now = int(time.time())
        unsigned = jwt.encode({"iss": ISS, "aud": CLIENT, "sub": "u42", "iat": now, "exp": now + 300,
                               "nonce": q["nonce"][0]}, None, algorithm="none")
        self.assert_rejected(self.launch(unsigned, q))

    def test_wrong_nonce(self):
        _, q = self.start_login()
        self.assert_rejected(self.launch(self.token(q, nonce="forged"), q))

    def test_unknown_state_and_replay(self):
        _, q = self.start_login()
        tok = self.token(q)
        self.assertEqual(self.launch(tok, q).status_code, 303)
        self.assert_rejected(self.launch(tok, q))  # replayed state
        resp = self.client.post("/api/lti/launch", data={"id_token": tok, "state": "nope"})
        self.assert_rejected(resp)

    def test_missing_browser_binding_cookie(self):
        _, q = self.start_login()
        self.client.delete_cookie(lti_routes.BINDING_COOKIE, path="/api/lti")
        self.assert_rejected(self.launch(self.token(q), q))

    def test_wrong_audience_and_deployment(self):
        _, q = self.start_login()
        self.assert_rejected(self.launch(self.token(q, aud="someone-else"), q))
        _, q = self.start_login()
        self.assert_rejected(self.launch(self.token(q, extra={lti.DEPLOYMENT_ID: "999"}), q), 403)

    def test_unsupported_role_rejected(self):
        _, q = self.start_login()
        self.assert_rejected(self.launch(self.token(q, roles=("http://x/Other",)), q), 403)


class RoleMappingTests(LTITestBase):
    def test_instructor_maps_to_professor(self):
        self.assertEqual(lti.map_role({lti.ROLES: [INSTRUCTOR]}), "professor")
        _, q = self.start_login()
        code = parse_qs(urlparse(self.launch(self.token(q, roles=(INSTRUCTOR,)), q)
                                 .headers["Location"]).query)["code"][0]
        self.assertEqual(self.client.post("/api/lti/session", json={"code": code}).get_json()["role"],
                         "professor")

    def test_learner_maps_to_student(self):
        self.assertEqual(lti.map_role({lti.ROLES: [LEARNER]}), "student")

    def test_instructor_wins_when_both(self):
        self.assertEqual(lti.map_role({lti.ROLES: [LEARNER, INSTRUCTOR]}), "professor")

    def test_garbage_roles_rejected(self):
        for bad in (None, "Instructor", [], [123]):
            with self.assertRaises(lti.LTIError):
                lti.map_role({lti.ROLES: bad})


class DeepLinkingTests(LTITestBase):
    DL_RETURN = ISS + "/mod/lti/contentitem_return.php"

    def dl_token(self, q, roles=(INSTRUCTOR,)):
        return self.token(q, roles=roles, msg=lti.MSG_DEEP_LINK_REQUEST, extra={
            lti.DL_SETTINGS: {"deep_link_return_url": self.DL_RETURN, "accept_types": ["ltiResourceLink"],
                              "accept_presentation_document_targets": ["iframe"], "data": "opaque-123"}})

    def test_deep_link_flow_returns_valid_content_item(self):
        _, q = self.start_login()
        resp = self.launch(self.dl_token(q), q)
        self.assertEqual(resp.status_code, 303)
        picker_url = resp.headers["Location"]
        picker = self.client.get(picker_url)
        self.assertEqual(picker.status_code, 200)
        self.assertIn("BIO101", picker.get_data(as_text=True))
        token = parse_qs(urlparse(picker_url).query)["token"][0]

        out = self.client.post("/api/lti/deep-link", data={"token": token, "pick": "7:2"})
        self.assertEqual(out.status_code, 200)
        html = out.get_data(as_text=True)
        self.assertIn(f"action='{self.DL_RETURN}'", html)
        signed = re.search(r"name=JWT value='([^']+)'", html).group(1)

        claims = jwt.decode(signed, TOOL_KEY.public_key(), algorithms=["RS256"], audience=ISS)
        self.assertEqual(claims["iss"], CLIENT)
        self.assertEqual(claims[lti.MSG_TYPE], "LtiDeepLinkingResponse")
        self.assertEqual(claims[lti.VERSION], "1.3.0")
        self.assertEqual(claims[lti.DEPLOYMENT_ID], DEPLOY)
        self.assertEqual(claims[lti.DL_CLAIM + "data"], "opaque-123")
        item, = claims[lti.DL_CLAIM + "content_items"]
        self.assertEqual(item["type"], "ltiResourceLink")
        self.assertEqual(item["url"], BASE + "/api/lti/launch")
        self.assertEqual(item["custom"], {"course_id": "7", "module": "2"})
        self.assertIn("Intro Biology", item["title"])
        # token is single-use
        again = self.client.post("/api/lti/deep-link", data={"token": token, "pick": "7:0"})
        self.assertEqual(again.status_code, 401)

    def test_deep_link_rejected_for_learner(self):
        _, q = self.start_login()
        resp = self.launch(self.dl_token(q, roles=(LEARNER,)), q)
        self.assertEqual(resp.status_code, 403)

    def test_unknown_course_rejected(self):
        _, q = self.start_login()
        token = parse_qs(urlparse(self.launch(self.dl_token(q), q).headers["Location"]).query)["token"][0]
        self.assertEqual(self.client.post("/api/lti/deep-link",
                                          data={"token": token, "pick": "999:0"}).status_code, 404)

    def test_tool_jwks_publishes_public_key(self):
        keys = self.client.get("/api/lti/jwks").get_json()["keys"]
        self.assertEqual(keys[0]["kid"], "plotark-lti-1")
        self.assertNotIn("d", keys[0])  # never the private exponent


class DisabledTests(unittest.TestCase):
    def test_lti_disabled_without_config(self):
        app = Flask(__name__)
        app.register_blueprint(lti_routes.lti_bp)
        with patch.dict(os.environ, {}, clear=True):
            resp = app.test_client().post("/api/lti/launch", data={"id_token": "x", "state": "y"})
        self.assertEqual(resp.status_code, 404)


if __name__ == "__main__":
    unittest.main()
