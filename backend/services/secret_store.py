"""Shared encryption helpers for API keys stored by Plot Ark."""

import os

from cryptography.fernet import Fernet, InvalidToken


SECRET_PREFIX = "fernet:"


class SecretStorageError(RuntimeError):
    """Raised when secrets cannot be stored or recovered safely."""


def _cipher() -> Fernet:
    key = os.getenv("API_KEY_ENCRYPTION_KEY", "").strip()
    if not key:
        raise SecretStorageError(
            "API key storage is unavailable. Configure API_KEY_ENCRYPTION_KEY."
        )
    try:
        return Fernet(key.encode())
    except (TypeError, ValueError) as exc:
        raise SecretStorageError(
            "API key storage is unavailable. API_KEY_ENCRYPTION_KEY is invalid."
        ) from exc


def encrypt_secret(value: str) -> str:
    """Encrypt a non-empty secret. Empty values remain empty for clear operations."""
    if not value:
        return ""
    token = _cipher().encrypt(value.encode()).decode()
    return SECRET_PREFIX + token


def decrypt_secret(value: str | None) -> str | None:
    """Decrypt new prefixed values and legacy Fernet tokens.

    Legacy plaintext is returned for backwards compatibility, but every new write
    goes through ``encrypt_secret`` and is therefore encrypted.
    """
    if not value:
        return value

    if value.startswith(SECRET_PREFIX):
        token = value[len(SECRET_PREFIX):]
        try:
            return _cipher().decrypt(token.encode()).decode()
        except InvalidToken as exc:
            raise SecretStorageError("Stored API key cannot be decrypted.") from exc

    # Older Plot Ark profile records used an unprefixed Fernet token. Try to
    # decrypt those when a key is configured, then fall back to legacy plaintext.
    if os.getenv("API_KEY_ENCRYPTION_KEY", "").strip():
        try:
            return _cipher().decrypt(value.encode()).decode()
        except InvalidToken:
            pass
    return value
