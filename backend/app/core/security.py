from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import base64
import bcrypt
import hashlib
import hmac
import json
from fastapi import HTTPException, status

from .config import get_settings


class TokenError(HTTPException):
    def __init__(self, detail: str = "Invalid authentication credentials") -> None:
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def _get_secret_and_algorithm() -> tuple[str, str]:
    settings = get_settings()
    return settings.jwt_secret, settings.jwt_algorithm


def _urlsafe_b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _urlsafe_b64decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(f"{data}{padding}")


def _hmac_sha256(secret: str, message: str) -> bytes:
    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).digest()


def _encode_jwt(payload: Dict[str, Any], secret: str, algorithm: str) -> str:
    if algorithm != "HS256":
        raise TokenError("Unsupported JWT algorithm")

    header = {"alg": "HS256", "typ": "JWT"}
    segments = [
        _urlsafe_b64encode(json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")),
        _urlsafe_b64encode(json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")),
    ]
    signing_input = ".".join(segments)
    signature = _urlsafe_b64encode(_hmac_sha256(secret, signing_input))
    segments.append(signature)
    return ".".join(segments)


def _decode_jwt(token: str, secret: str, algorithm: str) -> Dict[str, Any]:
    if algorithm != "HS256":
        raise TokenError("Unsupported JWT algorithm")

    try:
        header_segment, payload_segment, signature_segment = token.split(".")
    except ValueError as exc:  # pragma: no cover - runtime guard
        raise TokenError("Token structure invalid") from exc

    signing_input = f"{header_segment}.{payload_segment}"
    expected_signature = _urlsafe_b64encode(_hmac_sha256(secret, signing_input))
    if not hmac.compare_digest(expected_signature, signature_segment):
        raise TokenError("Token signature invalid")

    try:
        payload_data = json.loads(_urlsafe_b64decode(payload_segment))
    except json.JSONDecodeError as exc:  # pragma: no cover - runtime guard
        raise TokenError("Token payload invalid") from exc

    now = datetime.now(timezone.utc).timestamp()
    exp = payload_data.get("exp")
    if exp is not None and now > float(exp):
        raise TokenError("Token expired")

    return payload_data


def create_access_token(subject: str, role: str) -> str:
    settings = get_settings()
    secret, algorithm = _get_secret_and_algorithm()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.jwt_exp_minutes)

    payload: Dict[str, Any] = {
        "sub": subject,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return _encode_jwt(payload, secret, algorithm)


def decode_token(token: str) -> Dict[str, Any]:
    secret, algorithm = _get_secret_and_algorithm()
    return _decode_jwt(token, secret, algorithm)


def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        return False
