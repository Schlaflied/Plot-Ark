import os
import sys
import types
import unittest
from unittest.mock import Mock, patch

from cryptography.fernet import Fernet
from flask import Flask


extensions_stub = types.ModuleType("extensions")
extensions_stub.redis_client = None
extensions_stub.reload_clients = Mock()
sys.modules.setdefault("extensions", extensions_stub)

from routes import settings  # noqa: E402


class SettingsSecurityTests(unittest.TestCase):
    def setUp(self):
        settings._mem_store.clear()
        extensions_stub.reload_clients.reset_mock()
        app = Flask(__name__)
        app.register_blueprint(settings.settings_bp)
        self.client = app.test_client()

    def test_api_key_is_encrypted_and_get_is_masked(self):
        key = Fernet.generate_key().decode()
        with patch.dict(os.environ, {"API_KEY_ENCRYPTION_KEY": key}, clear=False):
            response = self.client.post(
                "/api/settings/keys",
                json={"openai_key": "sk-test-secret", "openai_model": "gpt-4o"},
            )
            self.assertEqual(response.status_code, 200)
            stored = settings._mem_store["openai_key"]
            self.assertTrue(stored.startswith("fernet:"))
            self.assertNotIn("sk-test-secret", stored)

            result = self.client.get("/api/settings/keys").get_json()
            self.assertEqual(result["openai_key"], "****cret")
            self.assertEqual(result["openai_model"], "gpt-4o")

    def test_missing_key_rejects_entire_update(self):
        with patch.dict(os.environ, {}, clear=True):
            response = self.client.post(
                "/api/settings/keys",
                json={"openai_key": "sk-test-secret", "openai_model": "gpt-4o"},
            )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(settings._mem_store, {})
        extensions_stub.reload_clients.assert_not_called()


if __name__ == "__main__":
    unittest.main()
