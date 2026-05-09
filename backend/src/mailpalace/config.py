"""Application configuration loaded from environment."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Process-wide config. Environment prefix: MAILPALACE_."""

    model_config = SettingsConfigDict(
        env_prefix="MAILPALACE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ~/.mailpalace by default; overridable for tests.
    data_dir: Path = Field(default_factory=lambda: Path.home() / ".mailpalace")

    # Web server
    host: str = "127.0.0.1"
    port: int = 7330

    # LLM provider switch
    active_provider: Literal["ollama", "anthropic", "openai"] = "ollama"
    fallback_chain: list[str] = []  # opt-in, never auto-fallback to remote

    # Ollama
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.1:8b"

    # Optional remote providers
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-haiku-4-5"

    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"

    # Ingest scheduler
    poll_interval_minutes: int = 15
    triage_batch_size: int = 20

    # Summary locale (per user; default Russian per product brief)
    summary_locale: Literal["ru", "en"] = "ru"
    user_addressing: Literal["ty", "vy"] = "ty"  # Russian "ты" vs "вы"

    # When True, /api/inbox is allowed to serve mock data without a DB.
    demo_mode: bool = False

    @property
    def db_path(self) -> Path:
        return self.data_dir / "mail.db"

    @property
    def db_url(self) -> str:
        return f"sqlite:///{self.db_path}"

    @property
    def token_file(self) -> Path:
        return self.data_dir / "token"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"


_settings: Settings | None = None


def get_settings() -> Settings:
    """Cached settings accessor."""
    global _settings
    if _settings is None:
        _settings = Settings()
        _settings.data_dir.mkdir(parents=True, exist_ok=True)
    return _settings
