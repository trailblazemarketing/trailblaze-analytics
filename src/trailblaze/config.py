"""Runtime configuration loaded from environment / .env."""

from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(
        default="postgresql+psycopg://trailblaze:trailblaze@localhost:5432/trailblaze",
        alias="DATABASE_URL",
    )
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    parser_model: str = Field(default="claude-opus-4-7", alias="PARSER_MODEL")
    parser_version: str = Field(default="2.0.0", alias="PARSER_VERSION")
    pdf_inbox_dir: Path = Field(default=REPO_ROOT / "pdfs", alias="PDF_INBOX_DIR")


settings = Settings()
