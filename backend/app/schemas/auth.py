from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


import re


def _validate_password_strength(password: str) -> None:
    """Validate password strength: 8+ chars, uppercase, lowercase, number, special char."""
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Password must contain at least one uppercase letter")
    if not re.search(r"[a-z]", password):
        raise ValueError("Password must contain at least one lowercase letter")
    if not re.search(r"\d", password):
        raise ValueError("Password must contain at least one number")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
        raise ValueError("Password must contain at least one special character")


class SuperAdminSignupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=255)
    
    def model_post_init(self, __context: dict[str, object]) -> None:
        try:
            _validate_password_strength(self.password)
        except ValueError as e:
            raise ValueError(str(e))


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=255)


class OrgSignupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=255)
    
    def model_post_init(self, __context: dict[str, object]) -> None:
        try:
            _validate_password_strength(self.password)
        except ValueError as e:
            raise ValueError(str(e))


class GoogleSignupRequest(BaseModel):
    credential: str = Field(..., min_length=10)


class OAuthLoginRequest(BaseModel):
    email: EmailStr
    name: str | None = None
    provider: str = Field(..., min_length=2, max_length=50)
    role: str | None = Field(default=None, pattern=r"^(org_admin|editor|viewer|super_admin)$")


class SendVerificationCodeRequest(BaseModel):
    email: EmailStr


class VerifyEmailCodeRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=4, max_length=10)

