"""Ohio Casino Control Commission — sports gaming + casino monthly revenue."""

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
        "sportsbook_handle": [r"total\s+(?:sports?\s*gaming\s+)?handle"],
        "sportsbook_revenue": [
            r"taxable\s+(?:sports?\s*gaming\s+)?revenue",
            r"adjusted\s+gross\s+(?:sports?\s*)?receipts",
        ],
    },
)
_CASINO = VerticalSpec(
    key="casino",
    link_filter=lambda t, h: "casino" in t or "revenue" in t,
    labels={
        "casino_revenue": [r"total\s+gross\s+casino\s+revenue", r"total\s+ggr"],
    },
)


class OhioCCCScraper(RegulatorScraper):
    name = "OH CCC"
    market_slug = "us-ohio"
    base_url = "https://casinocontrol.ohio.gov/Reports"

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
