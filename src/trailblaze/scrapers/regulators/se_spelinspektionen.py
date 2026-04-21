"""Spelinspektionen (Sweden) — quarterly gambling market statistics.

Publishes ``branschstatistik`` as XLSX each quarter covering licensed verticals
(online casino + online betting + state lottery + horseracing). Reports land on
the statistics page; we walk the listing for the most recent releases.
"""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.common import http_client
from trailblaze.scrapers.regulators._index import parse_month_year
from trailblaze.scrapers.regulators._pdf import download_pdf_text, find_labeled_amount


class SpelinspektionenScraper(RegulatorScraper):
    name = "Spelinspektionen"
    market_slug = "sweden"
    base_url = "https://www.spelinspektionen.se/en/facts-and-statistics/market-data/"

    def __init__(self, session, months: int = 12) -> None:
        super().__init__(session)
        self.max_quarters = max(months // 3, 2)

    def scrape(self) -> list[ScrapedMetric]:
        from urllib.parse import urljoin

        from bs4 import BeautifulSoup

        records: list[ScrapedMetric] = []
        with http_client() as client:
            try:
                html = client.get(self.base_url).text
            except Exception as exc:
                self.log.warning("Spelinspektionen: index fetch failed (%s)", exc)
                return records

            soup = BeautifulSoup(html, "lxml")
            candidates: list[tuple[int, int, str, str]] = []
            for a in soup.find_all("a", href=True):
                href = a["href"]
                text = a.get_text(" ", strip=True)
                if not (href.lower().endswith(".pdf") or href.lower().endswith(".xlsx")):
                    continue
                my = parse_month_year(text) or parse_month_year(href)
                if my is None:
                    continue
                candidates.append((my[0], my[1], urljoin(self.base_url, href), text))

            candidates.sort(reverse=True)
            seen = 0
            for year, month, url, link_text in candidates:
                if seen >= self.max_quarters:
                    break
                seen += 1
                if not url.lower().endswith(".pdf"):
                    # XLSX parsing for Spelinspektionen needs per-sheet logic we
                    # don't want to bake in yet; log and skip.
                    self.log.info("Spelinspektionen: skipping non-PDF %s", url)
                    continue
                try:
                    text = download_pdf_text(client, url)
                except Exception as exc:
                    self.log.warning("Spelinspektionen %04d-%02d: %s", year, month, exc)
                    continue
                records.extend(self._parse(text, year, month, url, link_text))

        return records

    def _parse(self, text: str, year: int, month: int, url: str,
               link_text: str) -> list[ScrapedMetric]:
        quarter = (month - 1) // 3 + 1
        recs: list[ScrapedMetric] = []

        def add(code: str, patterns: list[str]) -> None:
            amt = find_labeled_amount(text, patterns)
            if amt is None:
                return
            recs.append(ScrapedMetric(
                metric_code=code,
                period_year=year,
                period_quarter=quarter,
                value_numeric=amt,
                currency="SEK",
                unit_multiplier="millions",
                market_id=self.market_id,
                notes=f"Spelinspektionen Q{quarter} {year} (link: {link_text[:80]})",
                source_url=url,
            ))

        add("online_ggr", [
            r"(?:online\s+|commercial\s+)?(?:casino|gambling)\s+(?:net|gross)\s+gaming\s+revenue",
            r"licensed\s+online\s+gambling",
        ])
        add("sportsbook_revenue", [
            r"(?:online\s+)?betting\s+(?:net|gross)\s+gaming\s+revenue",
        ])
        add("ggr", [
            r"total\s+(?:net|gross)\s+gaming\s+revenue",
            r"total\s+ggr",
        ])
        return recs
