"""DGOJ (Dirección General de Ordenación del Juego) — Spanish quarterly market report.

DGOJ publishes ``Mercado de juego online en España`` every quarter. Data is
released as PDFs + CSVs under ``ordenacionjuego.es``.
"""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.common import http_client
from trailblaze.scrapers.regulators._index import parse_month_year
from trailblaze.scrapers.regulators._pdf import download_pdf_text, find_labeled_amount


class DGOJSpainScraper(RegulatorScraper):
    name = "DGOJ"
    market_slug = "spain"
    base_url = (
        "https://www.ordenacionjuego.es/en/estudios-informes"
    )

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
                self.log.warning("DGOJ: index fetch failed (%s)", exc)
                return records

            soup = BeautifulSoup(html, "lxml")
            candidates: list[tuple[int, int, str, str]] = []
            for a in soup.find_all("a", href=True):
                href = a["href"]
                text = a.get_text(" ", strip=True)
                low = text.lower()
                if "mercado" not in low and "market" not in low and "quarter" not in low:
                    continue
                if not href.lower().endswith(".pdf"):
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
                try:
                    text = download_pdf_text(client, url)
                except Exception as exc:
                    self.log.warning("DGOJ %04d-%02d: %s", year, month, exc)
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
                currency="EUR",
                unit_multiplier="millions",
                market_id=self.market_id,
                notes=f"DGOJ Q{quarter} {year} (link: {link_text[:80]})",
                source_url=url,
            ))

        add("online_ggr", [
            r"(?:gross\s+)?gaming\s+revenue\s+\(ggr\)",
            r"margen\s+de\s+juego",
            r"total\s+ggr",
        ])
        add("sportsbook_revenue", [r"apuestas\s+deportivas", r"sports?\s*betting"])
        add("casino_revenue", [r"casino", r"slots?"])
        return recs
