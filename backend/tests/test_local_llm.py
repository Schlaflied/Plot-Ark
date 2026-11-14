"""Tests for the optional local-model mode (AI_PROVIDER=local). Synthetic data only."""

import io
import json
import socket
import sys
import types
import unittest
from unittest.mock import MagicMock, Mock, patch

import config

# Stub heavy/side-effectful modules before importing routes.
_ext = sys.modules.get("extensions") or types.ModuleType("extensions")
for _name in ("redis_client", "tavily_client", "openai_client"):
    if not hasattr(_ext, _name):
        setattr(_ext, _name, None)
if not hasattr(_ext, "reload_clients"):
    _ext.reload_clients = Mock()
sys.modules["extensions"] = _ext

from flask import Flask  # noqa: E402
from services import llm  # noqa: E402
from routes import sources, syllabus  # noqa: E402

SYNTHETIC_SYLLABUS = "Synthetic Course 101. Week 1: Intro. Week 2: Basics. Midterm 30%."
SYNTHETIC_TAGS_JSON = json.dumps(
    {"results": [{"tags": ["alpha", "beta"], "summary": "A synthetic summary."}]}
)
SYLLABUS_JSON = json.dumps(
    {
        "fields": {"title": "Synthetic Course 101"},
        "modules": [{"title": "Intro", "complexity_level": 1}],
        "references": [],
        "assignments": [{"title": "Midterm", "weight": "30%"}],
    }
)


def _unused_port_url():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return f"http://127.0.0.1:{port}"


def _ollama_response(content):
    resp = MagicMock()
    resp.raise_for_status.return_value = None
    resp.json.return_value = {"message": {"content": content}, "done": True}
    return resp


class LocalSwitchTests(unittest.TestCase):
    def test_default_is_hosted(self):
        with patch.object(config, "AI_PROVIDER", "openai"):
            self.assertFalse(llm.is_local())
            self.assertEqual(llm.status()["mode"], "hosted")

    def test_local_switch_and_status(self):
        with patch.object(config, "AI_PROVIDER", "local"), \
             patch.object(config, "LOCAL_LLM_BASE_URL", "http://ollama:11434"), \
             patch.object(config, "LOCAL_LLM_MODEL", "tiny"):
            self.assertTrue(llm.is_local())
            st = llm.status()
            self.assertEqual(st["mode"], "local")
            self.assertFalse(st["hosted_fallback"])
            self.assertEqual(st["model"], "tiny")
            self.assertIn("Local model mode", llm.startup_message())


class LocalClientTests(unittest.TestCase):
    def setUp(self):
        self.patches = [
            patch.object(config, "AI_PROVIDER", "local"),
            patch.object(config, "LOCAL_LLM_BASE_URL", "http://local.test:11434"),
            patch.object(config, "LOCAL_LLM_MODEL", "tiny"),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def test_reachable_endpoint_returns_text(self):
        with patch("services.llm.requests.post", return_value=_ollama_response("hello")) as post:
            self.assertEqual(llm.local_chat("hi"), "hello")
        url = post.call_args.args[0]
        self.assertEqual(url, "http://local.test:11434/api/chat")
        self.assertEqual(post.call_args.kwargs["json"]["model"], "tiny")

    def test_unreachable_endpoint_real_connection(self):
        with patch.object(config, "LOCAL_LLM_BASE_URL", _unused_port_url()), \
             patch.object(config, "LOCAL_LLM_TIMEOUT", 3.0):
            with self.assertRaises(llm.LocalModelUnavailable) as ctx:
                llm.local_chat("hi")
        self.assertIn("Nothing was sent to a hosted service", str(ctx.exception))

    def test_empty_output_is_error(self):
        with patch("services.llm.requests.post", return_value=_ollama_response("  ")):
            with self.assertRaises(llm.LocalModelOutputError):
                llm.local_chat("hi")

    def test_parse_json_object_malformed(self):
        with self.assertRaises(llm.LocalModelOutputError):
            llm.parse_json_object("sorry, I cannot do that")
        with self.assertRaises(llm.LocalModelOutputError):
            llm.parse_json_object('{"a": 1}', required_keys=("results",))
        self.assertEqual(llm.parse_json_object('```json\n{"a": 1}\n```'), {"a": 1})

    def test_stream_yields_deltas(self):
        lines = [
            json.dumps({"message": {"content": "a"}, "done": False}).encode(),
            json.dumps({"message": {"content": "b"}, "done": True}).encode(),
        ]
        resp = MagicMock()
        resp.raise_for_status.return_value = None
        resp.iter_lines.return_value = lines
        with patch("services.llm.requests.post", return_value=resp):
            self.assertEqual("".join(llm.local_stream("hi")), "ab")

    def test_stream_unreachable(self):
        with patch.object(config, "LOCAL_LLM_BASE_URL", _unused_port_url()), \
             patch.object(config, "LOCAL_LLM_TIMEOUT", 3.0):
            with self.assertRaises(llm.LocalModelUnavailable):
                list(llm.local_stream("hi"))


class LocalRouteTests(unittest.TestCase):
    """End-to-end through Flask routes on synthetic fixtures; hosted client is a tripwire."""

    def setUp(self):
        self.hosted = Mock(side_effect=AssertionError("hosted model was called in local mode"))
        hosted_client = MagicMock()
        hosted_client.chat.completions.create = self.hosted
        self.patches = [
            patch.object(config, "AI_PROVIDER", "local"),
            patch.object(config, "LOCAL_LLM_BASE_URL", "http://local.test:11434"),
            patch.object(sources, "openai_client", hosted_client),
            patch.object(syllabus, "openai_client", hosted_client),
            patch.object(sources, "redis_client", None),
            patch.object(sources, "research_sources", return_value=[
                {"url": "https://example.edu/a", "title": "Synthetic A", "type": "academic", "content": "synthetic"}
            ]),
            patch.object(syllabus, "extract_text_from_bytes", return_value=SYNTHETIC_SYLLABUS),
        ]
        for p in self.patches:
            p.start()
        app = Flask(__name__)
        app.register_blueprint(sources.sources_bp)
        app.register_blueprint(syllabus.syllabus_bp)
        self.client = app.test_client()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def _upload(self):
        return self.client.post(
            "/api/syllabus/parse",
            data={"file": (io.BytesIO(b"x"), "synthetic.pdf")},
            content_type="multipart/form-data",
        )

    def _preview(self):
        return self.client.post(
            "/api/sources/preview",
            json={"topic": "synthetic topic", "level": "intro", "audience": "synthetic"},
        )

    def test_syllabus_parse_runs_with_reachable_local_model(self):
        with patch("services.llm.requests.post", return_value=_ollama_response(SYLLABUS_JSON)):
            r = self._upload()
        self.assertEqual(r.status_code, 200)
        body = r.get_json()
        self.assertEqual(body["ai_mode"], "local")
        self.assertEqual(body["assignments"][0]["title"], "Midterm")
        self.hosted.assert_not_called()

    def test_syllabus_parse_unreachable_endpoint(self):
        with patch.object(config, "LOCAL_LLM_BASE_URL", _unused_port_url()), \
             patch.object(config, "LOCAL_LLM_TIMEOUT", 3.0):
            r = self._upload()
        self.assertEqual(r.status_code, 503)
        self.assertIn("Local model unavailable", r.get_json()["error"])
        self.hosted.assert_not_called()

    def test_syllabus_parse_malformed_output(self):
        with patch("services.llm.requests.post", return_value=_ollama_response("not json at all")):
            r = self._upload()
        self.assertEqual(r.status_code, 502)
        self.assertIn("not valid JSON", r.get_json()["error"])
        self.hosted.assert_not_called()

    def test_source_tagging_runs_with_reachable_local_model(self):
        with patch("services.llm.requests.post", return_value=_ollama_response(SYNTHETIC_TAGS_JSON)):
            body = self._preview().get_json()
        self.assertEqual(body["sources"][0]["tags"], ["alpha", "beta"])
        self.assertNotIn("tagging_error", body)
        self.hosted.assert_not_called()

    def test_source_tagging_unreachable_reports_error(self):
        with patch.object(config, "LOCAL_LLM_BASE_URL", _unused_port_url()), \
             patch.object(config, "LOCAL_LLM_TIMEOUT", 3.0):
            body = self._preview().get_json()
        self.assertIn("Local model unavailable", body["tagging_error"])
        self.hosted.assert_not_called()

    def test_source_tagging_malformed_reports_error(self):
        with patch("services.llm.requests.post", return_value=_ollama_response('{"wrong": 1}')):
            body = self._preview().get_json()
        self.assertIn("missing expected fields", body["tagging_error"])
        self.hosted.assert_not_called()


if __name__ == "__main__":
    unittest.main()
