"""New York State Gaming Commission — mobile sports wagering monthly reports."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.regulators._index import (
    IndexWalkConfig,
    VerticalSpec,
    scrape_pdf_monthly_index,
)

_SPORTS = VerticalSpec(
    key="sports",
    link_filter=lambda t, h: "sports" in t or "mobile" in t or "wager" in t,
    labels={
        "sportsbook_handle": [
            r"total\s+(?:mobile\s+)?sports?\s*wagering\s+handle",
            r"total\s+handle",
        ],
        "sportsbook_revenue": [
            r"total\s+(?:mobile\s+)?sports?\s*wagering\s+gross\s+gaming\s+revenue",
            r"total\s+ggr",
        ],
    },
)


class NewYorkGamingScraper(RegulatorScraper):
    name = "NY GC"
    market_slug = "us-new-york"
    base_url = "https://www.gaming.ny.gov/gaming/index.php?ID=4"

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
