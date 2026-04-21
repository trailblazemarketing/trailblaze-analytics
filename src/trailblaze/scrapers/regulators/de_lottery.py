"""Delaware Lottery — internet gaming + sports lottery monthly reports."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.regulators._index import (
    IndexWalkConfig,
    VerticalSpec,
    scrape_pdf_monthly_index,
)

_IGAMING = VerticalSpec(
    key="igaming",
    link_filter=lambda t, h: "internet" in t or "igaming" in t or "online" in t,
    labels={
        "online_ggr": [
            r"total\s+internet\s+(?:gaming\s+)?(?:gross\s+)?revenue",
            r"igaming\s+(?:net|gross)\s+(?:gaming\s+)?revenue",
        ],
    },
)
_SPORTS = VerticalSpec(
    key="sports",
    link_filter=lambda t, h: "sport" in t,
    labels={
        "sportsbook_handle": [r"total\s+(?:sports?\s*)?(?:wagers|handle)"],
        "sportsbook_revenue": [
            r"total\s+(?:sports?\s*)?(?:net\s+)?(?:win|revenue)",
        ],
    },
)


class DelawareLotteryScraper(RegulatorScraper):
    name = "DE Lottery"
    market_slug = "us-delaware"
    base_url = "https://delottery.com/sports/"

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
