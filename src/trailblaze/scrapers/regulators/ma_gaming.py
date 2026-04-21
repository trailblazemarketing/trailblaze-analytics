"""Massachusetts Gaming Commission — sports wagering + casino monthly revenue."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.regulators._index import (
    IndexWalkConfig,
    VerticalSpec,
    scrape_pdf_monthly_index,
)

_SPORTS = VerticalSpec(
    key="sports",
    link_filter=lambda t, h: "sports" in t or "wagering" in t,
    labels={
        "sportsbook_handle": [r"total\s+(?:sports?\s*wagering\s+)?handle"],
        "sportsbook_revenue": [
            r"taxable\s+(?:sports?\s*wagering\s+)?(?:gaming\s+)?revenue",
            r"total\s+(?:adjusted\s+)?gross\s+(?:sports?\s*wagering\s+)?revenue",
        ],
    },
)
_CASINO = VerticalSpec(
    key="casino",
    link_filter=lambda t, h: "casino" in t or "gross gaming" in t,
    labels={
        "casino_revenue": [
            r"total\s+gross\s+gaming\s+revenue",
            r"ggr",
        ],
    },
)


class MassachusettsGamingScraper(RegulatorScraper):
    name = "MA GC"
    market_slug = "us-massachusetts"
    base_url = "https://massgaming.com/regulations/sports-wagering-reports/"

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
        ))
