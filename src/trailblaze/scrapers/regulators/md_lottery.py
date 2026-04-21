"""Maryland Lottery & Gaming — mobile sports wagering + casino monthly reports."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.regulators._index import (
    IndexWalkConfig,
    VerticalSpec,
    scrape_pdf_monthly_index,
)

_SPORTS = VerticalSpec(
    key="sports",
    link_filter=lambda t, h: "sports" in t or "mobile" in t,
    labels={
        "sportsbook_handle": [r"total\s+(?:mobile\s+)?(?:sports?\s*wagering\s+)?handle"],
        "sportsbook_revenue": [
            r"taxable\s+win",
            r"total\s+(?:sports?\s*wagering\s+)?(?:gross\s+|adjusted\s+)?revenue",
        ],
    },
)
_CASINO = VerticalSpec(
    key="casino",
    link_filter=lambda t, h: "casino" in t or "gaming revenue" in t,
    labels={
        "casino_revenue": [r"total\s+revenue", r"gross\s+gaming\s+revenue"],
    },
)


class MarylandLotteryScraper(RegulatorScraper):
    name = "MD Lottery"
    market_slug = "us-maryland"
    base_url = "https://www.mdgaming.com/mobile-sports-wagering-performance/"

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
