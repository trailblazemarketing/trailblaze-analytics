"""Michigan Gaming Control Board.

MGCB publishes monthly internet-gaming and internet-sports-betting revenue
summaries under its Detroit-casinos resources. The summary pages list links to
monthly PDFs; for each month the PDF has a state-total row with iGaming
adjusted gross receipts and internet sports handle + AGR.

Index page (stable through 2025):
    https://www.michigan.gov/mgcb/detroit-casinos/resources/
        revenues-and-wagering-tax-information

The page embeds a table whose rows link to per-month PDFs. We walk the table,
parse month/year from the row header, and extract totals from each PDF.
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


class MichiganMGCBScraper(RegulatorScraper):
    name = "MI MGCB"
    market_slug = "us-michigan"
    base_url = (
        "https://www.michigan.gov/mgcb/detroit-casinos/resources/"
        "revenues-and-wagering-tax-information"
    )
    # Index at base_url returns 403 to default UA. Fix is to use browser-style
    # User-Agent header like NJ DGE scraper does. Flagged for follow-up.
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
                self.log.warning("MGCB: fetch index failed (%s)", exc)
                return records

            soup = BeautifulSoup(html, "lxml")
            candidates: list[tuple[str, int, int, str]] = []
            for a in soup.find_all("a", href=True):
                href = a["href"]
                text = a.get_text(" ", strip=True)
                if not href.lower().endswith(".pdf"):
                    continue
                my = _month_from_text(text)
                if my is None:
                    continue
                t = text.lower()
                if "sport" in t:
                    vertical = "sports"
                elif "igaming" in t or "internet gaming" in t or "casino" in t:
                    vertical = "igaming"
                else:
                    continue
                candidates.append((vertical, my[0], my[1], urljoin(self.base_url, href)))

            candidates.sort(key=lambda c: (c[1], c[2]), reverse=True)
            seen: dict[str, int] = {"igaming": 0, "sports": 0}
            for vertical, year, month, url in candidates:
                if seen[vertical] >= self.months:
                    continue
                seen[vertical] += 1
                try:
                    text = download_pdf_text(client, url)
                except Exception as exc:
                    self.log.warning("MGCB %s %04d-%02d: fetch failed (%s)",
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
                notes=f"MGCB {vertical} monthly report {year}-{month:02d}",
                source_url=source_url,
            ))

        if vertical == "igaming":
            add("online_ggr", find_labeled_amount(text, [
                r"total\s+(?:internet\s+)?adjusted\s+gross\s+receipts",
                r"total\s+igaming\s+(?:gross\s+)?receipts",
                r"internet\s+gaming\s+agr",
            ]))
        else:  # sports
            add("sportsbook_handle", find_labeled_amount(text, [
                r"total\s+(?:internet\s+)?sports?\s*betting\s+handle",
                r"total\s+handle",
            ]))
            add("sportsbook_revenue", find_labeled_amount(text, [
                r"total\s+(?:internet\s+)?sports?\s*betting\s+adjusted\s+gross\s+receipts",
                r"total\s+agr",
            ]))

        return recs
