from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = ROOT_DIR / "backend"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    jsearch_api_key: str | None = Field(default=None, alias="JSEARCH_API_KEY")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    google_client_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices("GOOGLE_CLIENT_ID", "GOOGLE_Client_ID"),
    )
    google_client_secret: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "GOOGLE_CLIENT_SECRET",
            "GOOGLE_Client_Secret",
            "GOOGLE_Client_SECRET",
        ),
    )
    google_redirect_uri: AnyHttpUrl = Field(
        default="http://localhost:8000/auth/google/callback",
        alias="GOOGLE_REDIRECT_URI",
    )
    google_token_path: str = Field(default="backend/google_token.json", alias="GOOGLE_TOKEN_PATH")
    google_calendar_id: str = Field(default="primary", alias="GOOGLE_CALENDAR_ID")
    google_calendar_timezone: str = Field(default="America/New_York", alias="GOOGLE_CALENDAR_TIMEZONE")
    email_from: str | None = Field(default=None, alias="EMAIL_FROM")
    frontend_origin: AnyHttpUrl = Field(default="http://localhost:3000", alias="FRONTEND_ORIGIN")
    rubric_version: str = Field(default="v1", alias="RUBRIC_VERSION")
    leena_careers_url: AnyHttpUrl = Field(default="https://leena.ai/careers", alias="LEENA_CAREERS_URL")
    leena_fallback_urls_raw: str = Field(default="", alias="LEENA_FALLBACK_URLS")
    database_path: str = Field(default="backend/jobs.db", alias="DATABASE_PATH")
    log_path: str = Field(default="backend/logs/app.log", alias="LOG_PATH")
    http_timeout_seconds: int = Field(default=20, alias="HTTP_TIMEOUT_SECONDS")

    @property
    def database_file(self) -> Path:
        return ROOT_DIR / self.database_path

    @property
    def token_file(self) -> Path:
        return ROOT_DIR / self.google_token_path

    @property
    def log_file(self) -> Path:
        return ROOT_DIR / self.log_path

    @property
    def leena_fallback_urls(self) -> list[str]:
        if not self.leena_fallback_urls_raw:
            return []
        return [item.strip() for item in self.leena_fallback_urls_raw.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
