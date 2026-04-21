"""Rush Street Interactive IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper, IRLabels


class RushStreetIRScraper(IRScraper):
    name = "Rush Street Interactive"
    entity_slug = "rush-street"
    ir_url = "https://ir.rushstreetinteractive.com/financial-information/quarterly-results"
    reporting_currency = "USD"
    reporting_unit = "millions"

    def build_labels(self) -> IRLabels:
        lbl = IRLabels()
        lbl.extra["monthly_actives"] = [r"monthly\s+active\s+users?", r"mau"]
        return lbl
