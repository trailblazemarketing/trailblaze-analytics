"""Base class for company IR scrapers.

IR pages vary wildly — some publish a clean PDF per release, others link to
a third-party investor microsite, a few use dynamic JS. The contract here is
intentionally narrow: subclasses locate the most recent earnings / trading
update PDFs and emit ``ScrapedMetric`` records with ``source_type='company_ir'``.

For any release where the subclass can't confidently parse headline metrics,
it should still record a ``company_ir`` report-style row (empty-value shell)
and log the URL so humans can pick it up later. The parser handles that kind
of thing; the scraper layer stays lightweight.

What gets extracted (headline only)
-----------------------------------
* ``revenue`` — total revenue (any currency)
* ``ebitda`` — adjusted or reported EBITDA if labelled

Scrapers can add their own labels via subclass overrides. Currency defaults
to the company's reporting currency (``cls.reporting_currency``).
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from sqlalchemy import select
from sqlalchemy.orm import Session

from trailblaze.db.models import Entity
from trailblaze.scrapers.common import http_client
from trailblaze.scrapers.periods import PeriodCache
from trailblaze.scrapers.regulators._index import parse_month_year
from trailblaze.scrapers.regulators._pdf import download_pdf_text, find_labeled_amount
from trailblaze.scrapers.upsert import (
    UpsertStats,
    build_metric_code_map,
    resolve_source_id,
    upsert_metric_value,
)

log = logging.getLogger(__name__)


@dataclass
class IRMetric:
    metric_code: str
    value: Decimal
    currency: str
    unit_multiplier: str | None
    period_year: int
    period_quarter: int | None
    period_full_year: bool
    source_url: str
    notes: str


@dataclass
class IRLabels:
    """metric_code → list of case-insensitive regex fragments for find_labeled_amount."""

    revenue: list[str] = field(default_factory=lambda: [
        r"total\s+revenue",
        r"net\s+revenue",
        r"revenue\s+from\s+operations",
    ])
    ebitda: list[str] = field(default_factory=lambda: [
        r"adjusted\s+ebitda",
        r"ebitda",
    ])
    extra: dict[str, list[str]] = field(default_factory=dict)

    def all(self) -> dict[str, list[str]]:
        out = {"revenue": self.revenue, "ebitda": self.ebitda}
        out.update(self.extra)
        return out


class IRScraper:
    """Base class for company investor-relations scrapers."""

    #: Human-friendly name used in logs / CLI output.
    name: str = "IR"
    #: Entity slug in the seed. Used to resolve entity_id on startup.
    entity_slug: str = ""
    #: Where to find the IR release index (HTML page with PDF links).
    ir_url: str = ""
    #: Currency the issuer reports in (GBP, USD, EUR, SEK, CAD, ...).
    reporting_currency: str = "USD"
    #: Unit multiplier the issuer reports at (most gaming issuers use millions).
    reporting_unit: str | None = "millions"
    #: How many recent releases to pull each run.
    max_releases: int = 4
    #: Substrings that identify an earnings/trading-update PDF (lowercase match).
    link_includes: tuple[str, ...] = (
        "trading update", "results", "interim", "annual report",
        "quarterly", "press release", "half year", "h1", "h2", "q1", "q2", "q3", "q4",
    )
    #: Lifecycle status — CLIs filter on this.
    scraper_status: str = "scaffolded_untested"

    def __init__(self, session: Session) -> None:
        self.session = session
        self.source_id = resolve_source_id(session, "company_ir")
        self.metric_ids = build_metric_code_map(session)
        self.periods = PeriodCache(session)
        self.entity_id = self._resolve_entity()
        self.labels = self.build_labels()
        self.log = logging.getLogger(f"{__name__}.{type(self).__name__}")

    def _resolve_entity(self) -> uuid.UUID:
        if not self.entity_slug:
            raise RuntimeError(f"{type(self).__name__}.entity_slug is required")
        row = self.session.execute(
            select(Entity.id).where(Entity.slug == self.entity_slug)
        ).first()
        if row is None:
            raise RuntimeError(
                f"{type(self).__name__}: entity slug {self.entity_slug!r} not found. "
                "Run `trailblaze-seed` to add the new entities."
            )
        return row[0]

    def build_labels(self) -> IRLabels:
        """Subclasses may override to tune label regexes for their issuer."""
        return IRLabels()

    # ---- subclass hooks ---------------------------------------------------

    def discover_releases(self) -> list[tuple[int, int, str, str]]:
        """Default discovery: walk ``ir_url`` for PDFs whose link text matches
        ``link_includes`` and carries a parseable month+year.

        Returns (year, month, url, link_text) sorted newest first.
        """
        candidates: list[tuple[int, int, str, str]] = []
        with http_client() as client:
            try:
                html = client.get(self.ir_url).text
            except Exception as exc:
                self.log.warning("%s: fetch index %s failed (%s)",
                                 self.name, self.ir_url, exc)
                return candidates
            soup = BeautifulSoup(html, "lxml")
            for a in soup.find_all("a", href=True):
                href = a["href"]
                text = a.get_text(" ", strip=True)
                if not href.lower().endswith(".pdf"):
                    continue
                lower = text.lower()
                if not any(s in lower for s in self.link_includes):
                    continue
                my = parse_month_year(text) or parse_month_year(href)
                if my is None:
                    continue
                candidates.append((my[0], my[1], urljoin(self.ir_url, href), text))
        candidates.sort(reverse=True)
        return candidates[: self.max_releases]

    # ---- driver -----------------------------------------------------------

    def run(self) -> UpsertStats:
        stats = UpsertStats()
        try:
            releases = self.discover_releases()
        except Exception as exc:
            self.log.exception("%s: discover_releases failed: %s", self.name, exc)
            return stats

        if not releases:
            self.log.info("%s: no releases discovered at %s", self.name, self.ir_url)
            return stats

        self.log.info("%s: processing %d releases", self.name, len(releases))
        with http_client() as client:
            for year, month, url, link_text in releases:
                try:
                    pdf_text = download_pdf_text(client, url)
                except Exception as exc:
                    self.log.warning("%s %04d-%02d: fetch/parse failed (%s)",
                                     self.name, year, month, exc)
                    continue
                for rec in self.extract(pdf_text, year, month, url, link_text):
                    mid = self.metric_ids.get(rec.metric_code)
                    if mid is None:
                        self.log.warning("unknown metric_code=%r", rec.metric_code)
                        continue
                    if rec.period_full_year:
                        pid = self.periods.full_year(rec.period_year)
                    elif rec.period_quarter is not None:
                        pid = self.periods.quarter(rec.period_year, rec.period_quarter)
                    else:
                        # Fall back to quarterly based on release month.
                        q = (month - 1) // 3 + 1
                        pid = self.periods.quarter(year, q)
                    new, changed = upsert_metric_value(
                        self.session,
                        metric_id=mid,
                        period_id=pid,
                        source_id=self.source_id,
                        entity_id=self.entity_id,
                        value_numeric=rec.value,
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

    # ---- extraction -------------------------------------------------------

    def extract(
        self, text: str, year: int, month: int, url: str, link_text: str,
    ) -> Iterable[IRMetric]:
        """Default extractor: walk ``self.labels.all()`` and emit anything found."""
        # Infer periodicity from the link text: "Q1/Q2/H1/H2/annual".
        low = link_text.lower()
        period_quarter: int | None = None
        period_full_year = False
        if "annual" in low or "full year" in low or "fy" in low:
            period_full_year = True
        elif "q1" in low:
            period_quarter = 1
        elif "q2" in low or "h1" in low or "interim" in low:
            period_quarter = 2
        elif "q3" in low:
            period_quarter = 3
        elif "q4" in low or "h2" in low:
            period_quarter = 4

        for metric_code, patterns in self.labels.all().items():
            amount = find_labeled_amount(text, patterns)
            if amount is None:
                continue
            yield IRMetric(
                metric_code=metric_code,
                value=amount,
                currency=self.reporting_currency,
                unit_multiplier=self.reporting_unit,
                period_year=year,
                period_quarter=period_quarter,
                period_full_year=period_full_year,
                source_url=url,
                notes=f"{self.name} IR: {link_text[:100]}",
            )
