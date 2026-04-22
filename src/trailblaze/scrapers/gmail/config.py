"""Gmail pipeline configuration — trusted senders + label names + path constants.

Sender allowlist (Option 2 gating): emails labeled ``Trailblaze-Ingest`` are
only processed when the sender address matches one of ``TRUSTED_SENDERS``.
Matches are case-insensitive. Other senders are rejected with a distinct
Gmail label and a ``status='rejected_sender'`` row in
``gmail_ingested_messages`` so the user can audit drops.
"""

from __future__ import annotations

from pathlib import Path

from trailblaze.config import REPO_ROOT

TRUSTED_SENDERS: list[str] = [
    "oyvindmiller@gmail.com",
    # add more analysts here as the team grows
]

# Labels this pipeline recognises / manages. The user applies INGEST_LABEL;
# the orchestrator applies one of the terminal labels after each message is
# handled.
INGEST_LABEL = "Trailblaze-Ingest"
INGESTED_LABEL = "Trailblaze-Ingested"
REJECTED_SENDER_LABEL = "Trailblaze-Rejected-Sender"
ERROR_LABEL = "Trailblaze-Error"

ALL_LABELS: tuple[str, ...] = (
    INGEST_LABEL,
    INGESTED_LABEL,
    REJECTED_SENDER_LABEL,
    ERROR_LABEL,
)

# Gmail OAuth scope — read messages + modify labels.
GMAIL_SCOPES: list[str] = ["https://www.googleapis.com/auth/gmail.modify"]

# Credential + token locations. `secrets/` is gitignored.
SECRETS_DIR: Path = REPO_ROOT / "secrets"
CREDENTIALS_PATH: Path = SECRETS_DIR / "gmail_credentials.json"
TOKEN_PATH: Path = SECRETS_DIR / "gmail_token.json"

# Where synthetic PDFs land. Parser picks them up from here and file_hash
# dedupes on content (not filename), so re-runs on the same email won't
# create duplicate reports even if the filename is regenerated.
SYNTHETIC_PDF_DIR: Path = REPO_ROOT / "pdfs"
