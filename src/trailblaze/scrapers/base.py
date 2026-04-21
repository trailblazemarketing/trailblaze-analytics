"""Shared regulator-scraper base class.

Each regulator has its own quirks (PDF vs HTML vs XLSX), so subclasses override
``scrape()`` and yield ``ScrapedMetric`` records. The base class handles the
heavy lifting: period resolution, source/market lookup, and idempotent writes.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from trailblaze.db.models import Market
from trailblaze.scrapers.periods import PeriodCache
from trailblaze.scrapers.upsert import (
    UpsertStats,
    build_metric_code_map,
    resolve_source_id,
    upsert_metric_value,
)

log = logging.getLogger(__name__)


@dataclass
class ScrapedMetric:
    """One fact pulled from a regulator filing.

    At least one of ``entity_id`` / ``market_id`` must be set — the upsert layer
    enforces this. Operator-level regulator reports set entity_id; aggregated
    state-level totals set market_id.

    Period granularity
    ------------------
    Exactly one of ``period_month`` / ``period_quarter`` / ``period_full_year``
    must be set. Monthly is the default for US state regulators; quarterly and
    annual are used by most European regulators.
    """

    metric_code: str
    period_year: int
    period_month: int | None = None
    period_quarter: int | None = None  # 1..4; mutually exclusive with period_month
    period_full_year: bool = False  # True → use the full calendar year
    value_numeric: Decimal | float | int | None = None
    value_text: str | None = None
    currency: str | None = "USD"
    unit_multiplier: str | None = None
    entity_id: uuid.UUID | None = None
    market_id: uuid.UUID | None = None
    notes: str | None = None
    source_url: str | None = None


#: Valid values for scraper_status.
#:   production          — verified live end-to-end; included in default runs.
#:   scaffolded_untested — code exists but URLs/regex never verified live.
#:   broken_needs_research — tried, couldn't land rows in 2-3 attempts.
#:   deferred            — intentionally not running (e.g. IR scrapers).
SCRAPER_STATUSES = frozenset({
    "production",
    "scaffolded_untested",
    "broken_needs_research",
    "deferred",
})


class RegulatorScraper:
    """Abstract base. Subclasses set class attrs + implement ``scrape``."""

    #: Human display name for logs.
    name: str = "regulator"
    #: Market slug this regulator covers (from seed data).
    market_slug: str = ""
    #: Landing URL; subclasses may add more-specific URLs as needed.
    base_url: str = ""
    #: Lifecycle status — CLIs filter on this. See SCRAPER_STATUSES above.
    scraper_status: str = "scaffolded_untested"

    def __init__(self, session: Session) -> None:
        self.session = session
        self.source_id = resolve_source_id(session, "regulator_filing")
        self.metric_ids = build_metric_code_map(session)
        self.periods = PeriodCache(session)
        self.market_id = self._resolve_market()
        self.log = logging.getLogger(f"{__name__}.{type(self).__name__}")

    def _resolve_market(self) -> uuid.UUID:
        if not self.market_slug:
            raise RuntimeError(f"{type(self).__name__}.market_slug is required")
        row = self.session.execute(
            select(Market.id).where(Market.slug == self.market_slug)
        ).first()
        if row is None:
            raise RuntimeError(
                f"{type(self).__name__}: market slug {self.market_slug!r} not found. "
                "Run `trailblaze-seed` first."
            )
        return row[0]

    # ---- subclass hook -----------------------------------------------------

    def scrape(self) -> list[ScrapedMetric]:
        """Return all metrics pulled this run. Must be implemented by subclasses."""
        raise NotImplementedError

    def _period_for(self, rec: ScrapedMetric) -> uuid.UUID | None:
        if rec.period_full_year:
            return self.periods.full_year(rec.period_year)
        if rec.period_quarter is not None:
            return self.periods.quarter(rec.period_year, rec.period_quarter)
        if rec.period_month is not None:
            return self.periods.month(rec.period_year, rec.period_month)
        return None

    # ---- driver ------------------------------------------------------------

    def run(self) -> UpsertStats:
        stats = UpsertStats()
        try:
            records = self.scrape()
        except Exception as exc:
            self.log.exception("%s: scrape() failed: %s", self.name, exc)
            return stats

        self.log.info("%s: %d records to persist", self.name, len(records))
        for rec in records:
            metric_id = self.metric_ids.get(rec.metric_code)
            if metric_id is None:
                self.log.warning("unknown metric_code=%r, skipping", rec.metric_code)
                continue

            period_id = self._period_for(rec)
            if period_id is None:
                self.log.warning(
                    "record for metric=%r has no resolvable period (year=%d month=%s q=%s fy=%s); skipping",
                    rec.metric_code, rec.period_year, rec.period_month,
                    rec.period_quarter, rec.period_full_year,
                )
                continue

            # Default to state-level market if the record left both slots empty.
            entity_id = rec.entity_id
            market_id = rec.market_id if rec.market_id is not None else (
                self.market_id if entity_id is None else None
            )

            new, changed = upsert_metric_value(
                self.session,
                metric_id=metric_id,
                period_id=period_id,
                source_id=self.source_id,
                entity_id=entity_id,
                market_id=market_id,
                value_numeric=rec.value_numeric,
                value_text=rec.value_text,
                currency=rec.currency,
                unit_multiplier=rec.unit_multiplier,
                notes=rec.notes,
            )
            stats.record(new=new, changed=changed)

        self.log.info(
            "%s: inserted=%d updated=%d unchanged=%d",
            self.name, stats.inserted, stats.updated, stats.unchanged,
        )
        return stats
