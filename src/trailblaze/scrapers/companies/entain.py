"""Entain plc IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper, IRLabels


class EntainIRScraper(IRScraper):
    name = "Entain"
    entity_slug = "entain"
    ir_url = "https://www.entaingroup.com/investors/results-centre/"
    reporting_currency = "GBP"
    reporting_unit = "millions"

    def build_labels(self) -> IRLabels:
        lbl = IRLabels()
        lbl.extra["net_income"] = [r"profit\s+for\s+the\s+(?:year|period)",
                                    r"net\s+income"]
        return lbl
