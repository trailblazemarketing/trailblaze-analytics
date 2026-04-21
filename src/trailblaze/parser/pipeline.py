"""Orchestrator for a single PDF: read → hash → dedup → classify → extract → ingest.

After a successful run we REFRESH the canonical materialized view so the
dashboard sees freshly-ingested values. Cheap for our expected volumes; if
it becomes a hotspot later, move to a scheduled refresh or CONCURRENTLY.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

from sqlalchemy import select, text

from trailblaze.config import settings
from trailblaze.db.models import Report
from trailblaze.db.session import session_scope
from trailblaze.parser import llm, pdf_io
from trailblaze.parser.ingest import IngestResult, ingest

log = logging.getLogger(__name__)


def parse_pdf(pdf_path: Path) -> IngestResult:
    pdf_path = pdf_path.resolve()
    if not pdf_path.exists():
        raise FileNotFoundError(pdf_path)

    log.info("Parsing %s", pdf_path.name)
    raw_text = pdf_io.extract_text(pdf_path)
    file_hash = pdf_io.file_sha256(pdf_path)
    published_ts = pdf_io.published_timestamp(pdf_path)

    # Dedup pre-check — skip LLM calls entirely if already ingested.
    with session_scope() as session:
        existing = session.execute(
            select(Report.id, Report.parse_status).where(Report.file_hash == file_hash)
        ).first()
        if existing is not None:
            log.info("Already ingested (hash match): %s", pdf_path.name)
            return IngestResult(
                report_id=existing[0],
                metric_count=0,
                narrative_count=0,
                warnings=[],
                was_already_ingested=True,
                parse_status=existing[1],
            )

    # Pass 1 — classify
    classification = llm.classify(raw_text)
    log.info(
        "Classified as %s (shell_likely=%s, confidence=%.2f)",
        classification.document_type, classification.shell_likely, classification.confidence,
    )

    # Pass 2 — extract (skip if the classifier flagged a shell)
    if classification.shell_likely or classification.document_type == "shell":
        extraction = None
    else:
        extraction = llm.extract(raw_text, classification)
        log.info(
            "Extracted %d metrics, %d narratives",
            len(extraction.metrics), len(extraction.narratives),
        )

    with session_scope() as session:
        result = ingest(
            session=session,
            pdf_path=pdf_path,
            file_hash=file_hash,
            published_ts=published_ts,
            raw_text=raw_text,
            classification=classification,
            extraction=extraction,
            parser_version=settings.parser_version,
        )
        # Refresh canonical view so downstream reads see the new values.
        # Skip during bulk backfills (set TRAILBLAZE_SKIP_MATVIEW_REFRESH=1) —
        # REFRESH takes an ACCESS EXCLUSIVE lock, so doing it 300+ times
        # serialises concurrent parses. Refresh once at the end of the batch.
        if not os.getenv("TRAILBLAZE_SKIP_MATVIEW_REFRESH"):
            session.execute(text("REFRESH MATERIALIZED VIEW metric_value_canonical"))

    log.info(
        "Ingested %s: status=%s metrics=%d narratives=%d warnings=%d",
        pdf_path.name, result.parse_status, result.metric_count,
        result.narrative_count, len(result.warnings),
    )
    return result
