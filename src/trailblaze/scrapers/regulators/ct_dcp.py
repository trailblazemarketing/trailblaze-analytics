"""Connecticut — Department of Consumer Protection, Gaming Division.

CT DCP publishes monthly reports for online casino gaming and sports wagering
under two master tribes (Mashantucket Pequot / FanDuel and Mohegan / DraftKings)
plus the Connecticut Lottery. Reports land as PDFs on the DCP portal.

Index page:
    https://portal.ct.gov/DCP/Gaming-Division/Gaming-Division/
        Sports-Wagering-and-Online-Casino-Gaming-Reports
"""

from __future__ import annotations

import calendar
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.common import http_client
from trailblaze.scrapers.regulators._pdf import download_pdf_text, find_labeled_amount

_MONTH_NAMES = {calendar.month_name[i].lower(): i for i in range(1, 13)}
_MONTH_ABBR = {calendar.month_abbr[i].lower(): i for i in range(1, 13)}


def _month_from_text(text: str) -> tuple[int, int] | None:
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


class ConnecticutDCPScraper(RegulatorScraper):
    name = "CT DCP"
    market_slug = "us-connecticut"
    base_url = (
        "https://portal.ct.gov/DCP/Gaming-Division/Gaming-Division/"
        "Sports-Wagering-and-Online-Casino-Gaming-Reports"
    )
    # Index URL returns 404 — CT portal restructured. Needs new URL discovery.
    scraper_status = "broken_needs_research"

    def __init__(self, session, months: int = 6) -> None:
        super().__init__(session)
        self.months = months

    def scrape(self) -> list[ScrapedMetric]:
        records: list[ScrapedMetric] = []
        with http_client() as client:
            try:
                html = client.get(self.base_url).text
            except Exception as exc:
                self.log.warning("CT DCP: fetch index failed (%s)", exc)
                return records

            soup = BeautifulSoup(html, "lxml")
            candidates: list[tuple[int, int, str]] = []
            for a in soup.find_all("a", href=True):
                href = a["href"]
                text = a.get_text(" ", strip=True)
                if not href.lower().endswith(".pdf"):
                    continue
                my = _month_from_text(text)
                if my is None:
                    continue
                candidates.append((my[0], my[1], urljoin(self.base_url, href)))

            candidates.sort(reverse=True)
            seen = 0
            for year, month, url in candidates:
                if seen >= self.months:
                    break
                seen += 1
                try:
                    text = download_pdf_text(client, url)
                except Exception as exc:
                    self.log.warning("CT DCP %04d-%02d: fetch failed (%s)", year, month, exc)
                    continue
                records.extend(self._parse(text, year, month, url))

        return records

    def _parse(self, text: str, year: int, month: int, source_url: str) -> list[ScrapedMetric]:
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
                notes=f"CT DCP monthly report {year}-{month:02d}",
                source_url=source_url,
            ))

        add("online_ggr", find_labeled_amount(text, [
            r"total\s+online\s+casino\s+gaming\s+(?:gross\s+)?revenue",
            r"online\s+casino\s+win",
            r"total\s+(?:online\s+)?casino\s+gross\s+gaming\s+revenue",
        ]))
        add("sportsbook_handle", find_labeled_amount(text, [
            r"total\s+(?:online\s+)?sports?\s*wagering\s+handle",
            r"total\s+wagers",
        ]))
        add("sportsbook_revenue", find_labeled_amount(text, [
            r"total\s+(?:online\s+)?sports?\s*wagering\s+(?:gross\s+)?revenue",
            r"sports?\s*wagering\s+(?:gross\s+)?revenue",
        ]))
        return recs
