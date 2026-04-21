"""Rhode Island Lottery — sports + iGaming monthly revenue."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.regulators._index import (
    IndexWalkConfig,
    VerticalSpec,
    scrape_pdf_monthly_index,
)

_IGAMING = VerticalSpec(
    key="igaming",
    link_filter=lambda t, h: "igaming" in t or "online casino" in t or "internet" in t,
    labels={
        "online_ggr": [
            r"total\s+(?:igaming\s+|online\s+casino\s+)?(?:net|gross)\s+(?:gaming\s+)?(?:win|revenue)",
        ],
    },
)
_SPORTS = VerticalSpec(
    key="sports",
    link_filter=lambda t, h: "sport" in t,
    labels={
        "sportsbook_handle": [r"total\s+(?:sports?\s*)?(?:wagers|handle)"],
        "sportsbook_revenue": [
            r"total\s+(?:sports?\s*)?(?:net|gross)\s+(?:win|revenue)",
        ],
    },
)


class RhodeIslandLotteryScraper(RegulatorScraper):
    name = "RI Lottery"
    market_slug = "us-rhode-island"
    base_url = "https://www.rilot.com/en/sports-betting/reports.html"

    def __init__(self, session, months: int = 6) -> None:
        super().__init__(session)
        self.months = months

    def scrape(self) -> list[ScrapedMetric]:
        return scrape_pdf_monthly_index(IndexWalkConfig(
            index_url=self.base_url,
            market_id=self.market_id,
            verticals=[_IGAMING, _SPORTS],
            months=self.months,
            regulator_name=self.name,
        ))
