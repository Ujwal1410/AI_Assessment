from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AI Assessment Platform API"
    debug: bool = False
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "ai_assessment"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_exp_minutes: int = 60 * 24 * 7  # 7 days
    google_client_id: str | None = None
    aws_access_key: str | None = None
    aws_secret_key: str | None = None
    aws_region: str | None = None
    aws_email_source: str | None = None
    # Azure Communication Services
    azure_comm_connection_string: str | None = None
    azure_comm_sender_address: str | None = None
    # SendGrid
    sendgrid_api_key: str | None = None
    sendgrid_from_email: str | None = None
    sendgrid_from_name: str | None = None
    # Email provider selection: "sendgrid", "azure", or "aws"
    email_provider: str = "sendgrid"
    openai_api_key: str | None = None
    otp_ttl_minutes: int = 5
    email_verification_code_ttl_minutes: int = 1

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
