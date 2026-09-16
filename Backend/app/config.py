"""Application settings loaded from environment variables.

Nothing in this codebase should read os.environ directly — go through
get_settings() so that configuration stays auditable and testable.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_REPO_ROOT = _BACKEND_DIR.parent


class Settings(BaseSettings):
    """Central configuration — reads from .env file or environment."""

    # Absolute paths so settings resolve identically whether uvicorn is
    # started from the repo root (`npm run backend`) or from Backend/.
    # Later files win, so Backend/.env overrides a repo-root .env.
    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT / ".env", _BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── Environment ───
    environment: Literal["development", "staging", "production"] = Field(
        default="development",
        description="Deployment environment. Guards development-only behaviour.",
    )

    # ─── LLM Provider ───
    # Provider-neutral by design (AI Thesis §26: architecture must be
    # model-agnostic; Impact should not depend on one AI vendor).
    llm_provider: str = Field(
        default="nvidia",
        description="LLM provider: nvidia | openai | anthropic",
    )
    llm_model_name: str = Field(default="meta/llama-3.1-70b-instruct")
    llm_api_key: str = Field(
        default="",
        description="API key for the configured provider. Server-side only.",
    )

    # Routing target for high-volume, low-stakes calls (AI Thesis §26,
    # Priority 8 and Risk 6: AI cost must not scale faster than revenue).
    llm_model_name_fast: str = Field(default="meta/llama-3.1-8b-instruct")

    # ─── Retrieval (ARC) ───
    # Grounding the AI in approved Impact knowledge is thesis 27 Priority 3.
    # See Docs/Decisions/ADR-002-retrieval.md for why each default is set here.
    rag_enabled: bool = Field(
        default=True,
        description="Ground evidence review in retrieved Capability Spine rubrics.",
    )

    embedding_provider: str = Field(
        default="openai",
        description="openai | voyage | local. Local keeps evidence text in-house.",
    )
    embedding_model: str = Field(default="text-embedding-3-large")
    openai_api_key: str = Field(default="", description="Embeddings only in this build.")
    voyage_api_key: str = Field(default="")

    rerank_model: str = Field(default="rerank-v3.5")
    cohere_api_key: str = Field(
        default="",
        description="Cohere reranking. Falls back to a listwise LLM reranker.",
    )

    # How many rubric passages are packed into the evidence review prompt.
    # rerank_keep in the ARC config is 8; the review needs fewer and tighter.
    rag_rubric_passages: int = Field(default=7, ge=3, le=20)

    # ─── Firebase ───
    firebase_project_id: str = Field(default="cognitive-mirror-im")
    google_application_credentials: str = Field(
        default="",
        description="Path to the Firebase service account JSON. Never commit this file.",
    )

    # ─── Security ───
    allow_insecure_token_fallback: bool = Field(
        default=False,
        description=(
            "Development escape hatch: accept Firebase ID tokens without "
            "verifying their signature. NEVER enable outside local development."
        ),
    )

    # ─── Database ───
    database_url: str = Field(
        default="sqlite+aiosqlite:///./cognitive_mirror.db",
        description=(
            "SQLite by default so the stack runs with no infrastructure. "
            "Production uses PostgreSQL: "
            "postgresql+asyncpg://user:pass@host:5432/cognitive_mirror"
        ),
    )

    # ─── Application ───
    log_level: str = Field(default="INFO")
    cors_origins: list[str] = Field(
        default=["http://localhost:3000", "http://127.0.0.1:3000"],
    )

    # ─── AI Defaults ───
    ai_default_temperature: float = Field(default=0.1, ge=0.0, le=2.0)
    ai_max_tokens: int = Field(default=2048, gt=0)

    @field_validator("allow_insecure_token_fallback")
    @classmethod
    def _forbid_insecure_fallback_outside_dev(cls, value: bool, info) -> bool:
        """Refuse to start with signature verification disabled in production."""
        environment = info.data.get("environment", "development")
        if value and environment != "development":
            raise ValueError(
                "ALLOW_INSECURE_TOKEN_FALLBACK cannot be enabled when "
                f"ENVIRONMENT={environment}. It disables token signature "
                "verification and would allow forged credentials."
            )
        return value


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — avoids re-reading .env on every call."""
    return Settings()
