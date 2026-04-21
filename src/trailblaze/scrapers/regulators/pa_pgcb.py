"""Pennsylvania Gaming Control Board.

PGCB maintains a page of monthly revenue reports at:
    https://gamingcontrolboard.pa.gov/?p=monthly_revenue_reports

Reports are published as PDFs, one per vertical per month (iGaming, Sports
Wagering, Land-Based, etc.). We scrape the index, pick links whose anchor text
names a vertical + month, and extract state totals from each PDF.
"""

from __future__ import annotations

import calendar
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.common import http_client
from trailblaze.scrapers.regulators._pdf import download_pdf_text, find_labeled_amount

_MONTHS = {calendar.month_name[i].lower(): i for i in range(1, 13)}
_MONTHS_ABBR = {calendar.month_abbr[i].lower(): i for i in range(1, 13)}


def _parse_month_year(text: str) -> tuple[int, int] | None:
    """Pull (year, month) from anchor text like 'iGaming — March 2026'."""
    t = text.lower()
    year_match = re.search(r"(20\d{2})", t)
    if not year_match:
        return None
    year = int(year_match.group(1))
    for name, num in _MONTHS.items():
        if name in t:
            return year, num
    for name, num in _MONTHS_ABBR.items():
        if re.search(rf"\b{name}\b", t):
            return year, num
    return None


class PennsylvaniaPGCBScraper(RegulatorScraper):
    name = "PA PGCB"
    market_slug = "us-pennsylvania"
    base_url = "https://gamingcontrolboard.pa.gov/?p=monthly_revenue_reports"
    # Index at base_url loads (200) but no PDF links match the vertical filter —
    # page structure changed. Needs live inspection + link-filter rewrite.
    scraper_status = "broken_needs_research"

    def __init__(self, session, months: int = 6) -> None:
        super().__init__(session)
        self.months = months

    def scrape(self) -> list[ScrapedMetric]:
        records: list[ScrapedMetric] = []
        with http_client() as client:
            try:
                index_html = client.get(self.base_url).text
            except Exception as exc:
                self.log.warning("PGCB: cannot fetch index %s (%s)", self.base_url, exc)
                return records

            soup = BeautifulSoup(index_html, "lxml")
            candidates: list[tuple[str, int, int, str]] = []  # (vertical, year, month, url)
            for a in soup.find_all("a", href=True):
                href = a["href"]
                text = a.get_text(" ", strip=True)
                if not href.lower().endswith(".pdf"):
                    continue
                my = _parse_month_year(text)
                if my is None:
                    continue
                year, month = my
                t = text.lower()
                if "igaming" in t or "internet" in t:
                    vertical = "igaming"
                elif "sports" in t:
                    vertical = "sports"
                else:
                    continue
                candidates.append((vertical, year, month, urljoin(self.base_url, href)))

            # Sort newest first, keep the most recent `months` (per vertical).
            candidates.sort(key=lambda c: (c[1], c[2]), reverse=True)
            seen_per_vertical: dict[str, int] = {"igaming": 0, "sports": 0}
            for vertical, year, month, url in candidates:
                if seen_per_vertical[vertical] >= self.months:
                    continue
                seen_per_vertical[vertical] += 1
                try:
                    text = download_pdf_text(client, url)
                except Exception as exc:
                    self.log.warning("PGCB %s %04d-%02d: fetch failed (%s)",
                                     vertical, year, month, exc)
                    continue
                records.extend(self._parse(text, vertical, year, month, url))

        return records

    def _parse(self, text: str, vertical: str, year: int, month: int,
               source_url: str) -> list[ScrapedMetric]:
        recs: list[ScrapedMetric] = []

        def add(code: str, amount) -> None:
            if amount is None:
                return
            recs.append(ScrapedMetric(
                metric_code=code,
                period_year=year,
                period_month=month,
                value_numeric=amount,
                currency="USD",
                market_id=self.market_id,
                notes=f"PGCB {vertical} monthly report {year}-{month:02d}",
                source_url=source_url,
            ))

        if vertical == "igaming":
            add("online_ggr", find_labeled_amount(text, [
                r"total\s+internet\s+gaming\s+revenue",
                r"igaming\s+(?:gross\s+)?revenue",
            ]))
        elif vertical == "sports":
            add("sportsbook_handle", find_labeled_amount(text, [
                r"total\s+(?:sports?\s*wagering\s+)?handle",
                r"sports?\s*wagering\s+handle",
            ]))
            add("sportsbook_revenue", find_labeled_amount(text, [
                r"total\s+(?:sports?\s*wagering\s+)?(?:gross\s+)?revenue",
                r"taxable\s+sports?\s*wagering\s+revenue",
            ]))

        return recs
