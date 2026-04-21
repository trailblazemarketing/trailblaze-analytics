"""Shared PDF helpers for regulator scrapers.

Uses pypdf (already a top-level dep for the parser) to pull text out of the
small monthly PDFs that NJ, CT and some PGCB revisions publish. We look for
labelled currency figures and emit them as ``ScrapedMetric`` records.

Parsing is intentionally conservative: if a label is missing or the number
can't be coerced we log-and-skip rather than guessing.
"""

from __future__ import annotations

import io
import logging
import re
from decimal import Decimal, InvalidOperation

import httpx
import pypdf

log = logging.getLogger(__name__)


def download_pdf_text(client: httpx.Client, url: str) -> str:
    """Fetch a PDF and return its extracted text (all pages concatenated)."""
    resp = client.get(url)
    resp.raise_for_status()
    reader = pypdf.PdfReader(io.BytesIO(resp.content))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


_NUMBER_RE = re.compile(r"\$?\s*([-]?[\d,]+(?:\.\d+)?)")


def to_decimal(s: str) -> Decimal | None:
    """Parse a currency-ish string. Returns None on anything unexpected."""
    if s is None:
        return None
    m = _NUMBER_RE.search(s)
    if not m:
        return None
    try:
        return Decimal(m.group(1).replace(",", ""))
    except InvalidOperation:
        return None


def find_labeled_amount(text: str, label_patterns: list[str]) -> Decimal | None:
    """Find the first currency-looking number that appears after any label pattern.

    ``label_patterns`` are regex fragments. The search is case-insensitive and
    spans at most ~200 chars after the label to avoid picking up unrelated
    numbers from later in the document.
    """
    for pat in label_patterns:
        m = re.search(pat + r".{0,200}?" + _NUMBER_RE.pattern, text, re.IGNORECASE | re.DOTALL)
        if m:
            try:
                return Decimal(m.group(1).replace(",", ""))
            except InvalidOperation:
                continue
    return None
