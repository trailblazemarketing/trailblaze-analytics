"""PDF reading, file hashing, and filename-timestamp extraction.

Filename timestamps look like ``ATG_Q3_report_1761213600.pdf``: a 10-digit
Unix timestamp before the ``.pdf`` extension. Files without a timestamp
(``..._0.pdf``) fall back to file mtime per §reports.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader

_FILENAME_TS_RE = re.compile(r"_(\d{10})\.pdf$", re.IGNORECASE)


def extract_text(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    parts: list[str] = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:
            # pypdf occasionally chokes on malformed pages; skip rather than die.
            parts.append("")
    return "\n".join(parts).strip()


def file_sha256(pdf_path: Path) -> str:
    h = hashlib.sha256()
    with open(pdf_path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def published_timestamp(pdf_path: Path) -> datetime:
    """Prefer filename Unix timestamp, fall back to file mtime (both tz-aware UTC)."""
    match = _FILENAME_TS_RE.search(pdf_path.name)
    if match:
        ts = int(match.group(1))
        if ts > 0:
            return datetime.fromtimestamp(ts, tz=timezone.utc)
    return datetime.fromtimestamp(pdf_path.stat().st_mtime, tz=timezone.utc)
