"""Application settings loaded from environment variables."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration — reads from .env file or environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── LLM Provider ───
    llm_provider: str = Field(default="nvidia", description="LLM provider: nvidia | openai | anthropic")
    llm_model_name: str = Field(default="meta/llama-3.1-70b-instruct")
    nvidia_api_key: str = Field(default="")

    # ─── Database ───
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/cognitive_mirror",
    )

    # ─── Application ───
    log_level: str = Field(default="INFO")
    cors_origins: list[str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"],
    )

    # ─── AI Defaults ───
    ai_default_temperature: float = Field(default=0.1)
    ai_max_tokens: int = Field(default=2048)


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — avoids re-reading .env on every call."""
    return Settings()
