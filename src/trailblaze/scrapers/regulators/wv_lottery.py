"""West Virginia Lottery — interactive wagering + sports betting weekly/monthly."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.regulators._index import (
    IndexWalkConfig,
    VerticalSpec,
    scrape_pdf_monthly_index,
)

_IGAMING = VerticalSpec(
    key="igaming",
    link_filter=lambda t, h: "interactive" in t or "igaming" in t or "ilottery" in t,
    labels={
        "online_ggr": [
            r"total\s+(?:interactive\s+wagering\s+)?revenue",
            r"total\s+(?:igaming\s+)?gross\s+(?:gaming\s+)?revenue",
        ],
    },
)
_SPORTS = VerticalSpec(
    key="sports",
    link_filter=lambda t, h: "sports" in t and "wagering" in t,
    labels={
        "sportsbook_handle": [r"total\s+(?:sports?\s*wagering\s+)?handle"],
        "sportsbook_revenue": [
            r"total\s+(?:sports?\s*wagering\s+)?revenue",
            r"adjusted\s+gross\s+(?:sports?\s*wagering\s+)?revenue",
        ],
    },
)


class WestVirginiaLotteryScraper(RegulatorScraper):
    name = "WV Lottery"
    market_slug = "us-west-virginia"
    base_url = "https://wvlottery.com/games/interactive-wagering/"

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
