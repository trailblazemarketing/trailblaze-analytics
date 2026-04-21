"""Arizona Department of Gaming — event wagering monthly reports."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.regulators._index import (
    IndexWalkConfig,
    VerticalSpec,
    scrape_pdf_monthly_index,
)

_SPORTS = VerticalSpec(
    key="sports",
    link_filter=lambda t, h: "event" in t or "wager" in t or "sport" in t,
    labels={
        "sportsbook_handle": [r"total\s+(?:event\s+wagering\s+|amount\s+)?wagered",
                              r"total\s+handle"],
        "sportsbook_revenue": [
            r"adjusted\s+gross\s+(?:event\s+wagering\s+)?receipts",
            r"total\s+gross\s+(?:event\s+wagering\s+)?revenue",
        ],
    },
)


class ArizonaGamingScraper(RegulatorScraper):
    name = "AZ DG"
    market_slug = "us-arizona"
    base_url = "https://gaming.az.gov/resources/reports"

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
