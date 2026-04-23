"""Persist parser outputs into the database.

Idempotency contract (§parser req 6): re-parsing the same PDF must not
duplicate rows. We use ``reports.file_hash`` as the dedup key — if a report
already exists for the hash, we short-circuit and return the existing id.
"""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

# Trademark / copyright / degree glyphs occasionally bleed into the
# LLM's `value_text` when the source PDF rendered them next to a number
# (e.g. Italy "€5.30B™" where ™ belonged to a Beacon badge but was
# concatenated into the value string). Strip them defensively at ingest
# so downstream formatters don't have to special-case the same char
# repeatedly.
_GLYPH_STRIP_RE = re.compile(r"[™®©°]")


def _strip_glyphs(s: str | None) -> str | None:
    if s is None:
        return None
    cleaned = _GLYPH_STRIP_RE.sub("", s).strip()
    return cleaned if cleaned else None


# Percentage-metric codes should always land in a sane range. Negative
# values are legitimate (net margins can go negative under losses), and
# a small overshoot over 100% is tolerable (market shares occasionally
# exceed 100% on rounded + aggregated scopes), but values outside
# [-100, 200] are almost always parser unit errors — BetMGM "22/15" and
# similar bare integers were likely percentage extractions that lost
# the % scale cue, or the opposite (an absolute value parked in a
# percentage slot).
_PCT_PATTERNS: tuple[str, ...] = ("_pct", "margin", "market_share")


def _is_percentage_metric(code: str | None) -> bool:
    if not code:
        return False
    return any(p in code for p in _PCT_PATTERNS)

from trailblaze.db.models import (
    Entity,
    MetricValue,
    Narrative,
    Report,
    ReportEntity,
    ReportMarket,
    Source,
)
from trailblaze.parser.resolve import Resolver
from trailblaze.parser.schemas import ClassificationOutput, ExtractionOutput

log = logging.getLogger(__name__)


@dataclass
class IngestResult:
    report_id: uuid.UUID
    metric_count: int
    narrative_count: int
    warnings: list[str]
    was_already_ingested: bool
    parse_status: str


def _pdf_source_id(session: Session) -> uuid.UUID:
    row = session.execute(
        select(Source.id).where(Source.source_type == "trailblaze_pdf")
    ).first()
    if row is None:
        raise RuntimeError("trailblaze_pdf source not seeded. Run `trailblaze-seed` first.")
    return row[0]


def ingest(
    *,
    session: Session,
    pdf_path: Path,
    file_hash: str,
    published_ts: datetime,
    raw_text: str,
    classification: ClassificationOutput,
    extraction: ExtractionOutput | None,
    parser_version: str,
) -> IngestResult:
    # Idempotency — if this hash was already ingested, stop.
    existing = session.execute(
        select(Report.id, Report.parse_status).where(Report.file_hash == file_hash)
    ).first()
    if existing is not None:
        return IngestResult(
            report_id=existing[0],
            metric_count=0,
            narrative_count=0,
            warnings=[],
            was_already_ingested=True,
            parse_status=existing[1],
        )

    resolver = Resolver.build(session)

    # Primary period — we prefer the classification's code_hint, fall back to nothing
    period_id: uuid.UUID | None = None
    if classification.primary_period and classification.primary_period.code_hint:
        period_id = resolver.period(classification.primary_period.code_hint)

    warnings: list[str] = []
    metric_count = 0
    narrative_count = 0

    if extraction is None or not extraction.metrics:
        parse_status = "parsed_shell"
    else:
        parse_status = "parsed_clean"

    # Create the report row first so FK references work
    report = Report(
        source_id=_pdf_source_id(session),
        filename=pdf_path.name,
        original_path=None,
        local_path=str(pdf_path),
        file_hash=file_hash,
        document_type=classification.document_type,
        published_timestamp=published_ts,
        period_id=period_id,
        parsed_at=datetime.now(tz=timezone.utc),
        parser_version=parser_version,
        parse_status=parse_status,
        metric_count=0,
        parse_warnings=None,
        raw_text=raw_text,
    )
    session.add(report)
    session.flush()  # populate report.id

    # Link entities & markets the classifier identified. Unknown entities are
    # auto-created with status='auto_added_needs_review' so we don't lose the
    # association — the catalog gets curated asynchronously.
    for mention in classification.primary_entities:
        eid = resolver.entity(mention.name, auto_create=True)
        if eid is None:
            warnings.append(f"Unknown entity in classification: {mention.name!r}")
            continue
        session.add(ReportEntity(report_id=report.id, entity_id=eid, is_primary_subject=True))
    for mention in classification.primary_markets:
        mid = resolver.market(mention.name)
        if mid is None:
            warnings.append(f"Unknown market in classification: {mention.name!r}")
            continue
        session.add(ReportMarket(report_id=report.id, market_id=mid, is_primary_subject=True))

    pdf_source_id = _pdf_source_id(session)

    # Ingest metric values
    if extraction is not None:
        for m in extraction.metrics:
            metric_id = resolver.metric(m.metric_code)
            if metric_id is None:
                warnings.append(f"Unknown metric code: {m.metric_code!r}")
                continue
            period_id_m = resolver.period(m.period_code)
            if period_id_m is None:
                warnings.append(f"Unknown period code: {m.period_code!r}")
                continue
            entity_id = (
                resolver.entity(m.entity_name, auto_create=True) if m.entity_name else None
            )
            market_id = resolver.market(m.market_name) if m.market_name else None
            if m.market_name and market_id is None:
                warnings.append(f"Unknown market in metric: {m.market_name!r}")

            # A metric value needs at minimum a metric+period and either entity or market
            if entity_id is None and market_id is None:
                warnings.append(
                    f"Skipping metric {m.metric_code!r} for {m.period_code!r}: "
                    "no entity or market resolved."
                )
                continue

            # Sanitiser 3.3 — percentage range enforcement.
            # Flag (don't mutate) percentage-family metrics whose value sits
            # outside [-100, 200]. Preserves the original value for audit
            # while surfacing the anomaly on reports.parse_warnings.
            if _is_percentage_metric(m.metric_code) and m.value_numeric is not None:
                _v = float(m.value_numeric)
                if _v < -100 or _v > 200:
                    warnings.append(
                        f"[needs_review] Percentage out of range for "
                        f"{m.metric_code!r} {m.period_code}: {_v} "
                        f"(expected [-100, 200]) — unit cue likely dropped."
                    )

            session.add(MetricValue(
                entity_id=entity_id,
                market_id=market_id,
                metric_id=metric_id,
                period_id=period_id_m,
                report_id=report.id,
                source_id=pdf_source_id,
                value_numeric=m.value_numeric,
                value_text=_strip_glyphs(m.value_text),
                currency=m.currency,
                unit_multiplier=m.unit_multiplier,
                yoy_change_pct=m.yoy_change_pct,
                qoq_change_pct=m.qoq_change_pct,
                disclosure_status=m.disclosure_status,
                is_canonical=False,  # canonicalisation happens in the materialized view
                confidence_score=m.confidence,
                notes=m.notes,
                extracted_from_section=m.extracted_from_section,
                extracted_from_table_id=m.extracted_from_table_id,
            ))
            metric_count += 1

        # Ingest narratives
        for n in extraction.narratives:
            entity_id = (
                resolver.entity(n.entity_name, auto_create=True) if n.entity_name else None
            )
            market_id = resolver.market(n.market_name) if n.market_name else None
            session.add(Narrative(
                report_id=report.id,
                entity_id=entity_id,
                market_id=market_id,
                section_code=n.section_code,
                content=n.content,
            ))
            narrative_count += 1

        warnings.extend(extraction.warnings)

        # Sanitiser 3.1 — NGR > Revenue sanity flag.
        # NGR is definitionally <= Revenue (Revenue minus bonuses/promos).
        # When extraction emits NGR > Revenue for the same (entity, period)
        # at the entity level (market_name null), the pair is almost always
        # a unit-mismatch or scale error at parser time — flag for review
        # without mutating the stored values. Only compare when currency
        # matches; mixed-currency pairs need FX-aware comparison that
        # belongs in the canonical view, not here.
        _bucket: dict[tuple[str | None, str], dict[str, object]] = {}
        for em in extraction.metrics:
            if em.market_name:
                continue  # entity-level only
            if em.metric_code not in ("ngr", "revenue"):
                continue
            _bucket.setdefault((em.entity_name, em.period_code), {})[em.metric_code] = em
        for (ent_name, per_code), pair in _bucket.items():
            ngr = pair.get("ngr")
            rev = pair.get("revenue")
            if ngr is None or rev is None:
                continue
            if ngr.value_numeric is None or rev.value_numeric is None:
                continue
            if ngr.currency != rev.currency:
                continue
            _mult = {"billions": 10**9, "millions": 10**6, "thousands": 10**3}
            ngr_native = float(ngr.value_numeric) * _mult.get(ngr.unit_multiplier or "", 1)
            rev_native = float(rev.value_numeric) * _mult.get(rev.unit_multiplier or "", 1)
            if ngr_native > rev_native:
                warnings.append(
                    f"[needs_review] NGR > Revenue for {ent_name or '(unnamed)'} "
                    f"{per_code}: ngr={ngr.value_numeric} {ngr.unit_multiplier or 'units'} "
                    f"{ngr.currency}, rev={rev.value_numeric} {rev.unit_multiplier or 'units'} "
                    f"{rev.currency} — parser unit/scale mismatch suspected."
                )

    # Surface auto-created entities so the catalog can be curated later.
    if resolver.auto_added_entities:
        warnings.append(
            f"Auto-added {len(resolver.auto_added_entities)} entities "
            f"(status=auto_added_needs_review) — review in entities table."
        )

    # Reconcile parse_status based on actual outcomes
    if metric_count == 0:
        parse_status = "parsed_shell"
    elif warnings:
        parse_status = "parsed_with_warnings"
    else:
        parse_status = "parsed_clean"

    report.parse_status = parse_status
    report.metric_count = metric_count
    report.parse_warnings = {"messages": warnings} if warnings else None

    return IngestResult(
        report_id=report.id,
        metric_count=metric_count,
        narrative_count=narrative_count,
        warnings=warnings,
        was_already_ingested=False,
        parse_status=parse_status,
    )
