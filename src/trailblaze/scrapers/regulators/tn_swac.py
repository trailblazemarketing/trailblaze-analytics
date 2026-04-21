"""Tennessee Sports Wagering Council — monthly sports wagering revenue."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.regulators._index import (
    IndexWalkConfig,
    VerticalSpec,
    scrape_pdf_monthly_index,
)

_SPORTS = VerticalSpec(
    key="sports",
    link_filter=lambda t, h: "report" in t or "sport" in t or "wager" in t,
    labels={
        "sportsbook_handle": [r"gross\s+(?:sports?\s*wagering\s+)?handle", r"total\s+handle"],
        "sportsbook_revenue": [
            r"adjusted\s+gross\s+income",
            r"total\s+(?:sports?\s*wagering\s+)?(?:net|gross)\s+(?:win|revenue)",
        ],
    },
)


class TennesseeSWACScraper(RegulatorScraper):
    name = "TN SWC"
    market_slug = "us-tennessee"
    base_url = "https://www.tn.gov/swc/news/monthly-reports.html"

    def __init__(self, session, months: int = 6) -> None:
        super().__init__(session)
        self.months = months

    def scrape(self) -> list[ScrapedMetric]:
        return scrape_pdf_monthly_index(IndexWalkConfig(
            index_url=self.base_url,
            market_id=self.market_id,
            verticals=[_SPORTS],
            months=self.months,
            regulator_name=self.name,
        ))
