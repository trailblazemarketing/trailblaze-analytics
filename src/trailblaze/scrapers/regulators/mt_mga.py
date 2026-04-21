"""Malta Gaming Authority — annual/half-yearly Gaming Industry Reports."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.common import http_client
from trailblaze.scrapers.regulators._index import parse_month_year
from trailblaze.scrapers.regulators._pdf import download_pdf_text, find_labeled_amount


class MaltaGamingAuthorityScraper(RegulatorScraper):
    name = "MGA"
    market_slug = "malta"
    base_url = "https://www.mga.org.mt/news-publications/publications/"

    def __init__(self, session, months: int = 12) -> None:
        super().__init__(session)
        self.max_releases = max(months // 6, 2)

    def scrape(self) -> list[ScrapedMetric]:
        from urllib.parse import urljoin

        from bs4 import BeautifulSoup

        records: list[ScrapedMetric] = []
        with http_client() as client:
            try:
                html = client.get(self.base_url).text
            except Exception as exc:
                self.log.warning("MGA: index fetch failed (%s)", exc)
                return records

            soup = BeautifulSoup(html, "lxml")
            candidates: list[tuple[int, int, str, str]] = []
            for a in soup.find_all("a", href=True):
                href = a["href"]
                text = a.get_text(" ", strip=True)
                low = text.lower()
                if "industry" not in low and "annual" not in low and "interim" not in low:
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
                if seen >= self.max_releases:
                    break
                seen += 1
                try:
                    text = download_pdf_text(client, url)
                except Exception as exc:
                    self.log.warning("MGA %04d-%02d: %s", year, month, exc)
                    continue
                records.extend(self._parse(text, year, month, url, link_text))

        return records

    def _parse(self, text: str, year: int, month: int, url: str,
               link_text: str) -> list[ScrapedMetric]:
        recs: list[ScrapedMetric] = []
        full_year = "annual" in link_text.lower()
        period_kwargs: dict = {"period_year": year}
        if full_year:
            period_kwargs["period_full_year"] = True
        else:
            period_kwargs["period_quarter"] = (month - 1) // 3 + 1

        def add(code: str, patterns: list[str]) -> None:
            amt = find_labeled_amount(text, patterns)
            if amt is None:
                return
            recs.append(ScrapedMetric(
                metric_code=code,
                value_numeric=amt,
                currency="EUR",
                unit_multiplier="millions",
                market_id=self.market_id,
                notes=f"MGA Industry Report (link: {link_text[:80]})",
                source_url=url,
                **period_kwargs,
            ))

        add("ggr", [r"total\s+(?:gross|net)\s+(?:gaming\s+)?revenue"])
        add("online_ggr", [
            r"remote\s+gaming\s+(?:gross|net)\s+(?:gaming\s+)?revenue",
            r"online\s+(?:gross|net)\s+(?:gaming\s+)?revenue",
        ])
        return recs
