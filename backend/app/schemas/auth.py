from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class SuperAdminSignupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=255)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=255)


class OrgSignupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=255)


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

