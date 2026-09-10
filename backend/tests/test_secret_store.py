import os
import unittest
from unittest.mock import patch

from cryptography.fernet import Fernet

from services.secret_store import (
    SECRET_PREFIX,
    SecretStorageError,
    decrypt_secret,
    encrypt_secret,
)


class SecretStoreTests(unittest.TestCase):
    def test_round_trip_uses_ciphertext(self):
        key = Fernet.generate_key().decode()
        with patch.dict(os.environ, {"API_KEY_ENCRYPTION_KEY": key}, clear=False):
            stored = encrypt_secret("sk-test-secret")
            self.assertTrue(stored.startswith(SECRET_PREFIX))
            self.assertNotIn("sk-test-secret", stored)
            self.assertEqual(decrypt_secret(stored), "sk-test-secret")

    def test_missing_encryption_key_fails_closed(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(SecretStorageError):
                encrypt_secret("sk-test-secret")

    def test_invalid_encryption_key_fails_closed(self):
        with patch.dict(os.environ, {"API_KEY_ENCRYPTION_KEY": "not-a-fernet-key"}, clear=False):
            with self.assertRaises(SecretStorageError):
                encrypt_secret("sk-test-secret")

    def test_empty_value_can_clear_without_encryption_key(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(encrypt_secret(""), "")

    def test_legacy_plaintext_remains_readable_for_migration(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(decrypt_secret("legacy-value"), "legacy-value")


if __name__ == "__main__":
    unittest.main()
