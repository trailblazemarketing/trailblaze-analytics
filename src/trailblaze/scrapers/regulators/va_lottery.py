"""Virginia Lottery Board — sports betting monthly revenue reports."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.regulators._index import (
    IndexWalkConfig,
    VerticalSpec,
    scrape_pdf_monthly_index,
)

_SPORTS = VerticalSpec(
    key="sports",
    link_filter=lambda t, h: "sport" in t or "betting" in t,
    labels={
        "sportsbook_handle": [r"total\s+handle"],
        "sportsbook_revenue": [
            r"adjusted\s+gross\s+(?:sports?\s*betting\s+)?revenue",
            r"total\s+revenue",
        ],
    },
)


class VirginiaLotteryScraper(RegulatorScraper):
    name = "VA Lottery"
    market_slug = "us-virginia"
    base_url = (
        "https://www.valottery.com/aboutus/reportsandfinancials/sportsbettingmonthlyreports"
    )

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
