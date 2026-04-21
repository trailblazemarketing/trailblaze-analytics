"""Shared index-walker for regulator scrapers.

Most US state regulators publish monthly revenue summaries as PDFs linked from
a single index page. Instead of repeating the fetch/link-walk/parse dance in
every scraper, this module exposes ``scrape_pdf_monthly_index`` which handles
the common case. Per-state scrapers supply:

* ``index_url`` — page that lists the reports.
* ``verticals`` — a list of ``VerticalSpec`` describing how to classify a link
  and which metric labels to extract from each PDF.

Each ``VerticalSpec`` can optionally override month parsing (for regulators
whose link text doesn't carry a human-readable date).
"""

from __future__ import annotations

import calendar
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from trailblaze.scrapers.base import ScrapedMetric
from trailblaze.scrapers.common import http_client
from trailblaze.scrapers.regulators._pdf import download_pdf_text, find_labeled_amount

log = logging.getLogger(__name__)

_MONTH_NAMES = {calendar.month_name[i].lower(): i for i in range(1, 13)}
_MONTH_ABBR = {calendar.month_abbr[i].lower(): i for i in range(1, 13)}


def parse_month_year(text: str) -> tuple[int, int] | None:
    """Return (year, month) parsed from free-form text like 'Feb 2026' or 'Mar-2026'."""
    if not text:
        return None
    t = text.lower()
    year_match = re.search(r"(20\d{2})", t)
    if not year_match:
        return None
    year = int(year_match.group(1))
    for name, num in _MONTH_NAMES.items():
        if name in t:
            return year, num
    for name, num in _MONTH_ABBR.items():
        if re.search(rf"\b{name}\b", t):
            return year, num
    return None


@dataclass
class VerticalSpec:
    """Maps a vertical (iGaming/sports/casino) to link filters + metric labels."""

    key: str
    #: Predicate on (anchor_text_lower, href_lower). True → this link belongs to this vertical.
    link_filter: Callable[[str, str], bool]
    #: metric_code → list of label regex fragments passed to ``find_labeled_amount``.
    labels: dict[str, list[str]]
    #: Default currency attached to scraped values (per the regulator's local currency).
    currency: str = "USD"


@dataclass
class IndexWalkConfig:
    index_url: str
    market_id: object  # uuid.UUID, but we keep it loose to avoid circular types
    verticals: list[VerticalSpec]
    months: int = 6
    regulator_name: str = "regulator"
    #: File extensions to consider (defaults to PDFs).
    extensions: tuple[str, ...] = (".pdf",)
    #: Optional: override link text parsing (e.g. extract month from href).
    link_text_for_date: Callable[[str, str], str] = field(
        default=lambda text, href: f"{text} {href}"
    )


def scrape_pdf_monthly_index(cfg: IndexWalkConfig) -> list[ScrapedMetric]:
    """Walk ``cfg.index_url`` for monthly report PDFs and extract labeled metrics."""
    records: list[ScrapedMetric] = []
    rlog = logging.getLogger(f"{__name__}.{cfg.regulator_name}")

    with http_client() as client:
        try:
            html = client.get(cfg.index_url).text
        except Exception as exc:
            rlog.warning("%s: cannot fetch index %s (%s)",
                         cfg.regulator_name, cfg.index_url, exc)
            return records

        soup = BeautifulSoup(html, "lxml")
        candidates: list[tuple[VerticalSpec, int, int, str, str]] = []

        for a in soup.find_all("a", href=True):
            href = a["href"]
            text = a.get_text(" ", strip=True)
            lower_href = href.lower()
            lower_text = text.lower()
            if not any(lower_href.endswith(ext) for ext in cfg.extensions):
                continue
            dated = parse_month_year(cfg.link_text_for_date(text, href))
            if dated is None:
                continue
            for vspec in cfg.verticals:
                if vspec.link_filter(lower_text, lower_href):
                    candidates.append(
                        (vspec, dated[0], dated[1], urljoin(cfg.index_url, href), text)
                    )
                    break  # one vertical per link

        candidates.sort(key=lambda c: (c[1], c[2]), reverse=True)

        kept_per_vertical: dict[str, int] = {v.key: 0 for v in cfg.verticals}
        for vspec, year, month, url, link_text in candidates:
            if kept_per_vertical[vspec.key] >= cfg.months:
                continue
            kept_per_vertical[vspec.key] += 1

            try:
                pdf_text = download_pdf_text(client, url)
            except Exception as exc:
                rlog.warning("%s %s %04d-%02d: fetch/parse failed (%s)",
                             cfg.regulator_name, vspec.key, year, month, exc)
                continue

            for metric_code, label_patterns in vspec.labels.items():
                amount: Decimal | None = find_labeled_amount(pdf_text, label_patterns)
                if amount is None:
                    continue
                records.append(ScrapedMetric(
                    metric_code=metric_code,
                    period_year=year,
                    period_month=month,
                    value_numeric=amount,
                    currency=vspec.currency,
                    market_id=cfg.market_id,
                    notes=(
                        f"{cfg.regulator_name} {vspec.key} {year}-{month:02d} "
                        f"(link: {link_text[:80]})"
                    ),
                    source_url=url,
                ))

    return records
