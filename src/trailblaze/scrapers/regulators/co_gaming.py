"""Colorado Division of Gaming — sports betting + commercial casino monthly reports."""

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
        "sportsbook_handle": [r"total\s+(?:sports?\s*betting\s+)?handle", r"amount\s+wagered"],
        "sportsbook_revenue": [
            r"net\s+sports?\s*betting\s+proceeds",
            r"adjusted\s+gross\s+(?:sports?\s*betting\s+)?proceeds",
        ],
    },
)
_CASINO = VerticalSpec(
    key="casino",
    link_filter=lambda t, h: "casino" in t or "gaming" in t and "sport" not in t,
    labels={
        "casino_revenue": [r"adjusted\s+gross\s+proceeds", r"total\s+ggr"],
    },
)


class ColoradoGamingScraper(RegulatorScraper):
    name = "CO DG"
    market_slug = "us-colorado"
    base_url = "https://sbg.colorado.gov/sports-betting-financial-information"

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
