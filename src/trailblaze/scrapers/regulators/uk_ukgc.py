"""UK Gambling Commission — industry statistics (quarterly/half-yearly releases).

UKGC publishes aggregate GGY (gross gambling yield) numbers by vertical in
statistical bulletins. The landing page lists downloadable CSV/ODS files; we
walk the release index and parse the most recent headline PDFs.
"""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.common import http_client
from trailblaze.scrapers.regulators._index import VerticalSpec, parse_month_year
from trailblaze.scrapers.regulators._pdf import download_pdf_text, find_labeled_amount

_INDEX_URL = (
    "https://www.gamblingcommission.gov.uk/statistics-and-research/"
    "publication/industry-statistics"
)


class UKGCScraper(RegulatorScraper):
    name = "UKGC"
    market_slug = "united-kingdom"
    base_url = _INDEX_URL

    def __init__(self, session, months: int = 12) -> None:
        super().__init__(session)
        # UKGC publishes ~twice yearly; months is used as a maximum-release bound.
        self.max_releases = max(months // 3, 2)

    def scrape(self) -> list[ScrapedMetric]:
        records: list[ScrapedMetric] = []
        with http_client() as client:
            try:
                html = client.get(self.base_url).text
            except Exception as exc:
                self.log.warning("UKGC: index fetch failed (%s)", exc)
                return records

            from bs4 import BeautifulSoup
            from urllib.parse import urljoin
            soup = BeautifulSoup(html, "lxml")

            candidates: list[tuple[int, int, str, str]] = []
            for a in soup.find_all("a", href=True):
                href = a["href"]
                text = a.get_text(" ", strip=True)
                if not href.lower().endswith(".pdf"):
                    continue
                my = parse_month_year(text) or parse_month_year(href)
                if my is None:
                    continue
                candidates.append((my[0], my[1], urljoin(self.base_url, href), text))

            candidates.sort(reverse=True)
            seen = 0
            for year, month, url, link_text in candidates:
                if seen >= self.max_releases:
                    break
                seen += 1
                try:
                    text = download_pdf_text(client, url)
                except Exception as exc:
                    self.log.warning("UKGC %04d-%02d: fetch failed (%s)", year, month, exc)
                    continue
                records.extend(self._parse(text, year, month, url, link_text))

        return records

    def _parse(self, text: str, year: int, month: int, url: str,
               link_text: str) -> list[ScrapedMetric]:
        recs: list[ScrapedMetric] = []
        # UKGC bulletins report H1/H2/FY in GBP millions.
        # Map the reporting month to a half-year.
        if month <= 6:
            period_kwargs = {"period_quarter": 2, "period_year": year}
            label = f"UKGC H1 {year}"
        else:
            period_kwargs = {"period_quarter": 4, "period_year": year}
            label = f"UKGC H2 {year}"

        def add(code: str, patterns: list[str]) -> None:
            amt = find_labeled_amount(text, patterns)
            if amt is None:
                return
            recs.append(ScrapedMetric(
                metric_code=code,
                value_numeric=amt,
                currency="GBP",
                unit_multiplier="millions",
                market_id=self.market_id,
                notes=f"{label} (link: {link_text[:80]})",
                source_url=url,
                **period_kwargs,
            ))

        add("ggr", [
            r"total\s+(?:industry\s+)?(?:gross\s+)?gambling\s+yield",
            r"total\s+ggy",
        ])
        add("online_ggr", [
            r"online\s+(?:gross\s+)?gambling\s+yield",
            r"remote\s+ggy",
        ])
        add("sportsbook_revenue", [
            r"betting\s+(?:gross\s+)?gambling\s+yield",
            r"sports?\s+betting\s+ggy",
        ])
        return recs
