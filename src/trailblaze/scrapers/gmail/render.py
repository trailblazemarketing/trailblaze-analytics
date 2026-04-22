"""Email → synthetic PDF rendering for the Gmail ingestion pipeline.

The parser only cares that the email content round-trips through ``pypdf``'s
text extractor, so we deliberately use ``fpdf2`` (pure-Python, no GTK/Pango
dependency on Windows) and flatten HTML to text rather than chasing visual
fidelity. Tables are preserved as whitespace-aligned plain text so the
classifier + extractor see the same tabular shape they'd see in a Trailblaze
PDF.

The PDF contains **only the email body** — the viewer overlay in the
dashboard already displays sender/date/subject chrome via the report-
metadata API, and the rendered chrome looked unprofessional inside the
overlay. Analyst context is still preserved for the parser + for
``reports.raw_text`` via ``analyst_header_text()``, which the orchestrator
prepends to the extracted PDF text via ``parse_pdf(raw_text_prefix=...)``.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime

from bs4 import BeautifulSoup, NavigableString
from fpdf import FPDF


@dataclass
class RenderedEmail:
    pdf_bytes: bytes
    filename: str
    text_preview: str  # flattened body text — handy for logs / quick checks


# ---------------------------------------------------------------------------
# HTML → plain text (preserve tables)
# ---------------------------------------------------------------------------


def _cell_text(cell) -> str:
    # Join NavigableStrings with a single space; collapse inner whitespace.
    raw = " ".join(cell.stripped_strings)
    return re.sub(r"\s+", " ", raw).strip()


def _render_table(table) -> str:
    """Render an HTML table as pipe-separated text with a header underline.

    Parser-friendly: preserves row boundaries (newlines) and column
    boundaries (pipes) so the extractor's table heuristics still fire.
    """
    rows: list[list[str]] = []
    for tr in table.find_all("tr"):
        cells = tr.find_all(["td", "th"])
        if not cells:
            continue
        rows.append([_cell_text(c) for c in cells])
    if not rows:
        return ""

    col_count = max(len(r) for r in rows)
    widths = [0] * col_count
    for r in rows:
        for i, cell in enumerate(r):
            widths[i] = max(widths[i], len(cell))
    lines: list[str] = []
    for i, r in enumerate(rows):
        padded = [r[j].ljust(widths[j]) if j < len(r) else " " * widths[j] for j in range(col_count)]
        lines.append(" | ".join(padded).rstrip())
        if i == 0:
            lines.append("-+-".join("-" * w for w in widths))
    return "\n".join(lines)


def html_to_text(html: str) -> str:
    """Flatten HTML into parser-friendly plain text. Tables preserved."""
    soup = BeautifulSoup(html, "lxml")

    # Kill <style>/<script> so their contents don't leak into the text.
    for tag in soup(["style", "script", "head"]):
        tag.decompose()

    # Replace each table with a rendered-text placeholder in situ.
    for table in soup.find_all("table"):
        rendered = _render_table(table)
        table.replace_with(NavigableString("\n" + rendered + "\n"))

    # Newlines for block-level elements (br/p/div/li/h*).
    for br in soup.find_all("br"):
        br.replace_with(NavigableString("\n"))
    for block in soup.find_all(["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr"]):
        block.append(NavigableString("\n"))

    text = soup.get_text()
    # Collapse 3+ blank lines to 2; strip trailing spaces per line.
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ---------------------------------------------------------------------------
# filename slug
# ---------------------------------------------------------------------------


def _slugify(s: str, maxlen: int = 48) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^A-Za-z0-9]+", "-", s).strip("-").lower()
    return (s[:maxlen] or "untitled").rstrip("-")


def suggested_filename(
    *, sender_email: str, subject: str, received_at: datetime | None
) -> str:
    local = sender_email.split("@", 1)[0] if "@" in sender_email else sender_email
    sender_slug = _slugify(local, 24)
    subject_slug = _slugify(subject, 40)
    date_str = (received_at or datetime.utcnow()).strftime("%Y%m%d")
    return f"gmail_{sender_slug}_{date_str}_{subject_slug}.pdf"


# ---------------------------------------------------------------------------
# PDF rendering (fpdf2)
# ---------------------------------------------------------------------------


# fpdf2's core fonts are Latin-1-only. Strip or replace anything outside that
# range so the renderer doesn't crash on em-dashes / smart quotes / etc.
_LATIN1_FIXUPS = {
    "–": "-",  # en dash
    "—": "-",  # em dash
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "…": "...",
    " ": " ",  # nbsp
    "•": "*",  # bullet
    "€": "EUR",  # euro sign (Latin-1 has it at 0x80 in cp1252 only)
}


def _latin1_safe(s: str) -> str:
    for k, v in _LATIN1_FIXUPS.items():
        s = s.replace(k, v)
    return s.encode("latin-1", "replace").decode("latin-1")


def analyst_header_text(
    *,
    sender_email: str,
    sender_name: str | None,
    subject: str,
    received_at: datetime | None,
) -> str:
    """Return the ``ANALYST NOTE`` context block as plain text.

    This used to render into the PDF but now lives only in
    ``reports.raw_text`` (prepended via ``parse_pdf(raw_text_prefix=...)``).
    Keeping the subject + sender in the LLM-visible text is important for
    classification — without it the parser would lose every cue about who
    sent the note and what the report covers.
    """
    display_from = f"{sender_name} <{sender_email}>" if sender_name else sender_email
    date_str = received_at.strftime("%Y-%m-%d %H:%M %Z").strip() if received_at else "(no date)"
    return (
        "ANALYST NOTE\n"
        f"From: {display_from}\n"
        f"Date: {date_str}\n"
        f"Subject: {subject or '(no subject)'}"
    )


def render_email_to_pdf(
    *,
    sender_email: str,
    sender_name: str | None,
    subject: str,
    received_at: datetime | None,
    html_body: str | None,
    text_body: str | None,
) -> RenderedEmail:
    """Produce a body-only synthetic PDF. Metadata stays out of the render.

    ``sender_email`` / ``sender_name`` / ``subject`` / ``received_at`` are
    only used for the filename and for upstream callers that may want to
    persist them elsewhere — the PDF itself contains just the flattened
    email body. See ``analyst_header_text`` for the prose form of the
    metadata block.
    """
    if html_body:
        body_text = html_to_text(html_body)
    elif text_body:
        body_text = text_body.strip()
    else:
        body_text = "(email had no readable body)"

    pdf = FPDF(format="Letter", unit="mm")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    # Monospace body preserves table alignment built by _render_table.
    pdf.set_font("Courier", size=9)
    pdf.multi_cell(0, 4.2, _latin1_safe(body_text))

    pdf_bytes = bytes(pdf.output())
    filename = suggested_filename(
        sender_email=sender_email, subject=subject, received_at=received_at
    )
    return RenderedEmail(pdf_bytes=pdf_bytes, filename=filename, text_preview=body_text)
