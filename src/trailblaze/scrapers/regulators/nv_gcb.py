"""Nevada Gaming Control Board — monthly gaming revenue reports."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.regulators._index import (
    IndexWalkConfig,
    VerticalSpec,
    scrape_pdf_monthly_index,
)

# NV reports come as one consolidated PDF that covers both casino and
# sports-pool win; we extract both from the same file.
_CONSOLIDATED = VerticalSpec(
    key="consolidated",
    link_filter=lambda t, h: "revenue" in t or "monthly" in t or "grc" in t or "nvgcb" in h,
    labels={
        "ggr": [
            r"total\s+(?:gross\s+)?gaming\s+(?:win|revenue)",
            r"statewide\s+total\s+(?:win|revenue)",
        ],
        "sportsbook_revenue": [
            r"total\s+sports?\s*pool\s+(?:win|revenue)",
            r"race\s+book\s+and\s+sports?\s*pool",
        ],
    },
)


class NevadaGCBScraper(RegulatorScraper):
    name = "NV GCB"
    market_slug = "us-nevada"
    base_url = "https://gaming.nv.gov/index.aspx?page=149"

    def __init__(self, session, months: int = 6) -> None:
        super().__init__(session)
        self.months = months

    def scrape(self) -> list[ScrapedMetric]:
        return scrape_pdf_monthly_index(IndexWalkConfig(
            index_url=self.base_url,
            market_id=self.market_id,
            verticals=[_CONSOLIDATED],
            months=self.months,
            regulator_name=self.name,
        ))
