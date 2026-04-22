"""Gmail ingestion orchestrator — the end-to-end pipeline.

Responsibilities:
  * Resolve idempotency via ``gmail_ingested_messages.message_id``.
  * Gate processing on the ``TRUSTED_SENDERS`` allowlist.
  * Render each email to a synthetic PDF and hand it to the existing parser
    (``trailblaze.parser.pipeline.parse_pdf``).
  * Retarget the report + metric_values at the ``analyst_note`` source so the
    confidence-tier + display-label propagate through the UI.
  * Manage Gmail labels so the user's inbox reflects the ingestion outcome.

Label state machine per successful pass:
    Trailblaze-Ingest  →  Trailblaze-Ingested
  On allowlist miss:
    Trailblaze-Ingest  →  Trailblaze-Rejected-Sender
  On any error:
    Trailblaze-Ingest  →  Trailblaze-Error (ingest label stays so the user
    can re-apply it after fixing the root cause)
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from trailblaze.db.models import GmailIngestedMessage, MetricValue, Report, Source
from trailblaze.db.session import session_scope
from trailblaze.parser.pipeline import parse_pdf
from trailblaze.scrapers.gmail import client as gclient
from trailblaze.scrapers.gmail.config import (
    ERROR_LABEL,
    INGEST_LABEL,
    INGESTED_LABEL,
    REJECTED_SENDER_LABEL,
    SYNTHETIC_PDF_DIR,
    TRUSTED_SENDERS,
)
from trailblaze.scrapers.gmail.render import analyst_header_text, render_email_to_pdf

log = logging.getLogger(__name__)

_TRUSTED_LOWER = {s.lower() for s in TRUSTED_SENDERS}


@dataclass
class IngestSummary:
    found: int = 0
    ingested: int = 0
    skipped_duplicate: int = 0
    rejected_sender: int = 0
    errors: int = 0
    reprocessed: int = 0
    error_details: list[tuple[str, str]] = field(default_factory=list)

    def as_dict(self) -> dict[str, int]:
        return {
            "found": self.found,
            "ingested": self.ingested,
            "skipped_duplicate": self.skipped_duplicate,
            "rejected_sender": self.rejected_sender,
            "reprocessed": self.reprocessed,
            "errors": self.errors,
        }


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _analyst_note_source_id(session: Session) -> uuid.UUID:
    row = session.execute(
        select(Source.id).where(Source.source_type == "analyst_note")
    ).first()
    if row is None:
        raise RuntimeError(
            "analyst_note source missing — run `trailblaze-seed` after applying "
            "migration 0003."
        )
    return row[0]


def _retarget_to_analyst_note(session: Session, report_id: uuid.UUID) -> None:
    """Swap source_id from trailblaze_pdf → analyst_note on the report + its metric_values."""
    source_id = _analyst_note_source_id(session)
    session.execute(
        update(Report).where(Report.id == report_id).values(source_id=source_id)
    )
    session.execute(
        update(MetricValue).where(MetricValue.report_id == report_id).values(source_id=source_id)
    )


def _already_ingested(session: Session, message_id: str) -> bool:
    row = session.execute(
        select(GmailIngestedMessage.status).where(
            GmailIngestedMessage.message_id == message_id
        )
    ).first()
    return row is not None and row[0] == "ingested"


def _record_ingest_row(
    session: Session,
    *,
    message_id: str,
    sender_email: str,
    sender_name: str | None,
    subject: str | None,
    received_at: datetime | None,
    report_id: uuid.UUID | None,
    status: str,
    error_message: str | None,
    pdf_filename: str | None,
) -> None:
    """Upsert into ``gmail_ingested_messages`` keyed by ``message_id``."""
    stmt = pg_insert(GmailIngestedMessage).values(
        message_id=message_id,
        sender_email=sender_email,
        sender_name=sender_name,
        subject=subject,
        received_at=received_at,
        ingested_at=datetime.now(tz=timezone.utc),
        report_id=report_id,
        status=status,
        error_message=error_message,
        pdf_filename=pdf_filename,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["message_id"],
        set_={
            "status": stmt.excluded.status,
            "error_message": stmt.excluded.error_message,
            "report_id": stmt.excluded.report_id,
            "pdf_filename": stmt.excluded.pdf_filename,
            "ingested_at": stmt.excluded.ingested_at,
        },
    )
    session.execute(stmt)


# ---------------------------------------------------------------------------
# main entry point
# ---------------------------------------------------------------------------


def ingest_labeled_emails(
    *,
    dry_run: bool = False,
    limit: int | None = None,
    force: bool = False,
    reprocess_existing: bool = False,
) -> IngestSummary:
    """Process messages for the Gmail ingestion pipeline.

    Default mode lists every Gmail message currently wearing
    ``INGEST_LABEL`` and runs the full ingestion flow. When
    ``reprocess_existing`` is set, the message set instead comes from
    ``gmail_ingested_messages.status='ingested'`` (matches messages that
    already wear ``INGESTED_LABEL`` in Gmail); the orchestrator deletes the
    old ``reports`` + ``metric_values`` rows and re-renders / re-parses each
    from scratch, so a renderer or parser change can be retroactively
    applied.
    """
    SYNTHETIC_PDF_DIR.mkdir(parents=True, exist_ok=True)

    service = gclient.build_gmail_service()
    label_map = gclient.ensure_labels_exist(service)
    log.info("Trailblaze labels present: %s", sorted(label_map))

    if reprocess_existing:
        return _reprocess_existing(
            service=service,
            label_map=label_map,
            dry_run=dry_run,
            limit=limit,
        )

    message_ids = gclient.list_labeled_messages(
        service, INGEST_LABEL, label_map=label_map, max_results=limit
    )
    summary = IngestSummary(found=len(message_ids))
    log.info("found %d messages with label %r", summary.found, INGEST_LABEL)

    if dry_run:
        for mid in message_ids:
            msg = gclient.get_message(service, mid)
            trusted = msg.sender_email in _TRUSTED_LOWER
            log.info(
                "[dry-run] %s from=%s trusted=%s subject=%r",
                mid, msg.sender_email, trusted, msg.subject,
            )
        return summary

    for mid in message_ids:
        _process_one(
            service=service,
            label_map=label_map,
            message_id=mid,
            force=force,
            summary=summary,
        )

    return summary


def _reprocess_existing(
    *,
    service,
    label_map: dict[str, str],
    dry_run: bool,
    limit: int | None,
) -> IngestSummary:
    """Rerun render + parse against every already-ingested email.

    Drives from ``gmail_ingested_messages`` rather than a Gmail label query
    so the Gmail-side labels (``Trailblaze-Ingested``) don't need flipping.
    Deletes ``metric_values`` explicitly because their FK to ``reports.id``
    is ``ON DELETE SET NULL`` — letting them go to NULL would leave orphan
    rows visible in the UI with no report link.
    """
    with session_scope() as s:
        rows = s.execute(
            select(
                GmailIngestedMessage.message_id,
                GmailIngestedMessage.report_id,
                GmailIngestedMessage.subject,
            ).where(GmailIngestedMessage.status == "ingested")
        ).all()
    if limit is not None:
        rows = rows[:limit]

    summary = IngestSummary(found=len(rows))
    log.info("reprocess_existing: %d previously-ingested messages", summary.found)

    if dry_run:
        for r in rows:
            log.info("[dry-run reprocess] %s (report_id=%s) subject=%r",
                     r.message_id, r.report_id, r.subject)
        return summary

    for r in rows:
        # 1. Delete the stale report + its metric_values. Narratives,
        #    report_entities, report_markets cascade via ON DELETE CASCADE.
        if r.report_id is not None:
            with session_scope() as s:
                s.execute(delete(MetricValue).where(MetricValue.report_id == r.report_id))
                s.execute(delete(Report).where(Report.id == r.report_id))
            log.info("reprocess_existing: deleted stale report %s", r.report_id)

        # 2. Re-fetch + run the normal single-message flow with force=True so
        #    the gmail_ingested_messages idempotency check doesn't short-
        #    circuit us.
        before = summary.ingested
        _process_one(
            service=service,
            label_map=label_map,
            message_id=r.message_id,
            force=True,
            summary=summary,
        )
        if summary.ingested > before:
            summary.reprocessed += 1

    return summary


def _process_one(
    *,
    service,
    label_map: dict[str, str],
    message_id: str,
    force: bool,
    summary: IngestSummary,
) -> None:
    # Idempotency check in its own short-lived session so pre-skip doesn't hold
    # locks during the (slow) LLM parse below.
    if not force:
        with session_scope() as s:
            if _already_ingested(s, message_id):
                log.info("%s: already ingested — skipping", message_id)
                summary.skipped_duplicate += 1
                return

    # Fetch the message outside any DB session.
    try:
        msg = gclient.get_message(service, message_id)
    except Exception as exc:
        log.exception("%s: Gmail fetch failed", message_id)
        with session_scope() as s:
            _record_ingest_row(
                s,
                message_id=message_id,
                sender_email="(fetch-failed)",
                sender_name=None,
                subject=None,
                received_at=None,
                report_id=None,
                status="error",
                error_message=f"gmail fetch: {exc}",
                pdf_filename=None,
            )
        try:
            gclient.add_label(service, message_id, ERROR_LABEL, label_map)
        except Exception:
            pass
        summary.errors += 1
        summary.error_details.append((message_id, f"gmail fetch: {exc}"))
        return

    # Sender allowlist gate.
    if msg.sender_email not in _TRUSTED_LOWER:
        log.warning(
            "%s: rejecting untrusted sender %r (subject=%r)",
            message_id, msg.sender_email, msg.subject,
        )
        with session_scope() as s:
            _record_ingest_row(
                s,
                message_id=message_id,
                sender_email=msg.sender_email,
                sender_name=msg.sender_name,
                subject=msg.subject,
                received_at=msg.received_at,
                report_id=None,
                status="rejected_sender",
                error_message=None,
                pdf_filename=None,
            )
        try:
            gclient.add_label(service, message_id, REJECTED_SENDER_LABEL, label_map)
            gclient.remove_label(service, message_id, INGEST_LABEL, label_map)
        except Exception:
            log.exception("%s: label update failed after sender rejection", message_id)
        summary.rejected_sender += 1
        return

    # Render synthetic PDF.
    try:
        rendered = render_email_to_pdf(
            sender_email=msg.sender_email,
            sender_name=msg.sender_name,
            subject=msg.subject,
            received_at=msg.received_at,
            html_body=msg.html_body,
            text_body=msg.text_body,
        )
        pdf_path = SYNTHETIC_PDF_DIR / rendered.filename
        pdf_path.write_bytes(rendered.pdf_bytes)
        log.info("%s: rendered -> %s (%d bytes)", message_id, pdf_path.name, len(rendered.pdf_bytes))
    except Exception as exc:
        log.exception("%s: render failed", message_id)
        _handle_error(
            service=service,
            label_map=label_map,
            message_id=message_id,
            msg=msg,
            error_message=f"render: {exc}",
            summary=summary,
        )
        return

    # Parse + retarget source, in one session so retarget stays transactional.
    # Overrides give the LLM classifier analyst-note context (subject line is
    # often the clearest cue for company/period) and force published_timestamp
    # onto the email's sent date rather than the synthetic PDF's file mtime.
    header_text = analyst_header_text(
        sender_email=msg.sender_email,
        sender_name=msg.sender_name,
        subject=msg.subject,
        received_at=msg.received_at,
    )
    try:
        result = parse_pdf(
            pdf_path,
            raw_text_prefix=header_text,
            published_ts_override=msg.received_at,
        )
        with session_scope() as s:
            _retarget_to_analyst_note(s, result.report_id)
            _record_ingest_row(
                s,
                message_id=message_id,
                sender_email=msg.sender_email,
                sender_name=msg.sender_name,
                subject=msg.subject,
                received_at=msg.received_at,
                report_id=result.report_id,
                status="ingested",
                error_message=None,
                pdf_filename=rendered.filename,
            )
    except Exception as exc:
        log.exception("%s: parse/retarget failed", message_id)
        _handle_error(
            service=service,
            label_map=label_map,
            message_id=message_id,
            msg=msg,
            error_message=f"parse: {exc}",
            summary=summary,
            pdf_filename=rendered.filename,
        )
        return

    # Success — update labels.
    try:
        gclient.add_label(service, message_id, INGESTED_LABEL, label_map)
        gclient.remove_label(service, message_id, INGEST_LABEL, label_map)
    except Exception:
        log.exception("%s: label update failed after successful ingest", message_id)

    log.info(
        "%s: ingested (report_id=%s, metrics=%d, narratives=%d, warnings=%d, dup=%s)",
        message_id,
        result.report_id,
        result.metric_count,
        result.narrative_count,
        len(result.warnings),
        result.was_already_ingested,
    )
    summary.ingested += 1


def _handle_error(
    *,
    service,
    label_map: dict[str, str],
    message_id: str,
    msg: gclient.ParsedMessage,
    error_message: str,
    summary: IngestSummary,
    pdf_filename: str | None = None,
) -> None:
    with session_scope() as s:
        _record_ingest_row(
            s,
            message_id=message_id,
            sender_email=msg.sender_email,
            sender_name=msg.sender_name,
            subject=msg.subject,
            received_at=msg.received_at,
            report_id=None,
            status="error",
            error_message=error_message,
            pdf_filename=pdf_filename,
        )
    try:
        gclient.add_label(service, message_id, ERROR_LABEL, label_map)
    except Exception:
        log.exception("%s: could not apply error label", message_id)
    summary.errors += 1
    summary.error_details.append((message_id, error_message))
