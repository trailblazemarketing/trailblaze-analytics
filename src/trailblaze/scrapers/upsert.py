"""Idempotent writes for metric_values.

No unique constraint exists on metric_values for the natural key
(entity, market, metric, period, source), so we implement
lookup-then-insert/update here. Re-running any scraper must not duplicate
rows for the same fact.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from trailblaze.db.models import Entity, Metric, MetricValue, Source

log = logging.getLogger(__name__)


@dataclass
class UpsertStats:
    inserted: int = 0
    updated: int = 0
    unchanged: int = 0

    def record(self, *, changed: bool, new: bool) -> None:
        if new:
            self.inserted += 1
        elif changed:
            self.updated += 1
        else:
            self.unchanged += 1

    def merge(self, other: "UpsertStats") -> None:
        self.inserted += other.inserted
        self.updated += other.updated
        self.unchanged += other.unchanged


def resolve_source_id(session: Session, source_type: str) -> uuid.UUID:
    row = session.execute(
        select(Source.id).where(Source.source_type == source_type)
    ).first()
    if row is None:
        raise RuntimeError(
            f"Source {source_type!r} not seeded. Run `trailblaze-seed` first."
        )
    return row[0]


def build_metric_code_map(session: Session) -> dict[str, uuid.UUID]:
    return {code: mid for code, mid in session.execute(select(Metric.code, Metric.id))}


def build_ticker_entity_map(session: Session) -> dict[str, tuple[uuid.UUID, str | None]]:
    """ticker → (entity_id, exchange) for every entity with a ticker."""
    out: dict[str, tuple[uuid.UUID, str | None]] = {}
    rows = session.execute(
        select(Entity.id, Entity.ticker, Entity.exchange).where(Entity.ticker.is_not(None))
    )
    for eid, ticker, exchange in rows:
        out[ticker] = (eid, exchange)
    return out


def upsert_metric_value(
    session: Session,
    *,
    metric_id: uuid.UUID,
    period_id: uuid.UUID,
    source_id: uuid.UUID,
    entity_id: uuid.UUID | None = None,
    market_id: uuid.UUID | None = None,
    value_numeric: Decimal | float | int | None = None,
    value_text: str | None = None,
    currency: str | None = None,
    unit_multiplier: str | None = None,
    disclosure_status: str = "disclosed",
    notes: str | None = None,
    confidence_score: Decimal | float | None = None,
    report_id: uuid.UUID | None = None,
) -> tuple[bool, bool]:
    """Insert or update a metric_value. Returns (new, changed).

    Natural key used for idempotency:
        (entity_id, market_id, metric_id, period_id, source_id)
    """
    if entity_id is None and market_id is None:
        raise ValueError("metric_value requires at least one of entity_id or market_id")

    if value_numeric is not None and not isinstance(value_numeric, Decimal):
        value_numeric = Decimal(str(value_numeric))

    filters = [
        MetricValue.metric_id == metric_id,
        MetricValue.period_id == period_id,
        MetricValue.source_id == source_id,
    ]
    filters.append(
        MetricValue.entity_id == entity_id if entity_id is not None
        else MetricValue.entity_id.is_(None)
    )
    filters.append(
        MetricValue.market_id == market_id if market_id is not None
        else MetricValue.market_id.is_(None)
    )

    existing = session.execute(select(MetricValue).where(and_(*filters))).scalar_one_or_none()

    if existing is None:
        session.add(MetricValue(
            entity_id=entity_id,
            market_id=market_id,
            metric_id=metric_id,
            period_id=period_id,
            source_id=source_id,
            report_id=report_id,
            value_numeric=value_numeric,
            value_text=value_text,
            currency=currency,
            unit_multiplier=unit_multiplier,
            disclosure_status=disclosure_status,
            is_canonical=False,
            confidence_score=(
                Decimal(str(confidence_score)) if confidence_score is not None else None
            ),
            notes=notes,
        ))
        return True, True

    # Detect change on value fields — if nothing differs we skip the write.
    changed = False
    if existing.value_numeric != value_numeric:
        existing.value_numeric = value_numeric
        changed = True
    if existing.value_text != value_text:
        existing.value_text = value_text
        changed = True
    if existing.currency != currency:
        existing.currency = currency
        changed = True
    if existing.unit_multiplier != unit_multiplier:
        existing.unit_multiplier = unit_multiplier
        changed = True
    if existing.disclosure_status != disclosure_status:
        existing.disclosure_status = disclosure_status
        changed = True
    if notes is not None and existing.notes != notes:
        existing.notes = notes
        changed = True
    return False, changed
