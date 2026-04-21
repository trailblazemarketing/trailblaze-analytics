"""iGaming Ontario — quarterly regulated iGaming market performance reports."""

from __future__ import annotations

from trailblaze.scrapers.base import RegulatorScraper, ScrapedMetric
from trailblaze.scrapers.regulators._index import (
    IndexWalkConfig,
    VerticalSpec,
    scrape_pdf_monthly_index,
)

_IGAMING = VerticalSpec(
    key="igaming",
    link_filter=lambda t, h: "market" in t or "performance" in t or "quarterly" in t,
    labels={
        "ggr": [r"total\s+gaming\s+revenue", r"total\s+ggr"],
        "online_ggr": [r"total\s+gaming\s+revenue", r"total\s+ggr"],
        "handle": [r"total\s+wagers", r"total\s+cash\s+wagers"],
    },
    currency="CAD",
)


class IGamingOntarioScraper(RegulatorScraper):
    name = "iGO"
    market_slug = "ca-ontario"
    base_url = "https://igamingontario.ca/en/resources/market-performance"

    def __init__(self, session, months: int = 12) -> None:
        super().__init__(session)
        self.months = months

    def scrape(self) -> list[ScrapedMetric]:
        # iGO publishes quarterly; scraper still walks the PDF index. Records
        # returned are monthly-tagged by the helper; we convert to quarters.
        monthly = scrape_pdf_monthly_index(IndexWalkConfig(
            index_url=self.base_url,
            market_id=self.market_id,
            verticals=[_IGAMING],
            months=self.months,
            regulator_name=self.name,
        ))
        # Re-key to quarterly periods (the link dates tend to reflect end-of-Q month).
        out: list[ScrapedMetric] = []
        for m in monthly:
            if m.period_month is None:
                out.append(m)
                continue
            q = (m.period_month - 1) // 3 + 1
            out.append(ScrapedMetric(
                metric_code=m.metric_code,
                period_year=m.period_year,
                period_quarter=q,
                value_numeric=m.value_numeric,
                currency=m.currency,
                unit_multiplier=m.unit_multiplier,
                entity_id=m.entity_id,
                market_id=m.market_id,
                notes=m.notes,
                source_url=m.source_url,
            ))
        return out
