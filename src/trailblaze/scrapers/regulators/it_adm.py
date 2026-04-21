"""ADM (Agenzia delle Dogane e dei Monopoli) — Italian gaming market monthly statistics."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.regulators._index import (
    IndexWalkConfig,
    VerticalSpec,
    scrape_pdf_monthly_index,
)

_ONLINE = VerticalSpec(
    key="online",
    link_filter=lambda t, h: "online" in t or "gioco a distanza" in t or "gad" in t,
    labels={
        "online_ggr": [
            r"raccolta\s+netta",
            r"ngr",
            r"net\s+gaming\s+revenue",
        ],
        "handle": [r"raccolta", r"total\s+stakes"],
    },
    currency="EUR",
)


class ADMItalyScraper(RegulatorScraper):
    name = "ADM"
    market_slug = "italy"
    base_url = "https://www.adm.gov.it/portale/monopoli/giochi/dati-di-mercato"

    def __init__(self, session, months: int = 6) -> None:
        super().__init__(session)
        self.months = months

    def scrape(self) -> list[ScrapedMetric]:
        return scrape_pdf_monthly_index(IndexWalkConfig(
            index_url=self.base_url,
            market_id=self.market_id,
            verticals=[_ONLINE],
            months=self.months,
            regulator_name=self.name,
            extensions=(".pdf", ".xlsx", ".xls"),
        ))
