"""Indiana Gaming Commission — sports wagering + casino monthly reports."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.regulators._index import (
    IndexWalkConfig,
    VerticalSpec,
    scrape_pdf_monthly_index,
)

_SPORTS = VerticalSpec(
    key="sports",
    link_filter=lambda t, h: "sports" in t or "wager" in t,
    labels={
        "sportsbook_handle": [r"total\s+(?:sports?\s*wagering\s+)?handle"],
        "sportsbook_revenue": [
            r"adjusted\s+gross\s+revenue",
            r"taxable\s+(?:sports?\s*wagering\s+)?revenue",
        ],
    },
)
_CASINO = VerticalSpec(
    key="casino",
    link_filter=lambda t, h: "casino" in t or "racino" in t,
    labels={
        "casino_revenue": [r"total\s+(?:adjusted\s+)?gross\s+revenue", r"total\s+agr"],
    },
)


class IndianaGamingScraper(RegulatorScraper):
    name = "IN IGC"
    market_slug = "us-indiana"
    base_url = "https://www.in.gov/igc/revenue/"

    def __init__(self, session, months: int = 6) -> None:
        super().__init__(session)
        self.months = months

    def scrape(self) -> list[ScrapedMetric]:
        return scrape_pdf_monthly_index(IndexWalkConfig(
            index_url=self.base_url,
            market_id=self.market_id,
            verticals=[_SPORTS, _CASINO],
            months=self.months,
            regulator_name=self.name,
            extensions=(".pdf", ".xlsx"),
        ))
