"""North Carolina State Lottery Commission — sports wagering monthly reports."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.regulators._index import (
    IndexWalkConfig,
    VerticalSpec,
    scrape_pdf_monthly_index,
)

_SPORTS = VerticalSpec(
    key="sports",
    link_filter=lambda t, h: "sport" in t or "wager" in t,
    labels={
        "sportsbook_handle": [r"total\s+(?:sports?\s*wagering\s+)?handle"],
        "sportsbook_revenue": [
            r"gross\s+wagering\s+revenue",
            r"total\s+(?:sports?\s*wagering\s+)?revenue",
        ],
    },
)


class NorthCarolinaLotteryScraper(RegulatorScraper):
    name = "NC SELC"
    market_slug = "us-north-carolina"
    base_url = "https://nclottery.com/SportsBetting"

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
