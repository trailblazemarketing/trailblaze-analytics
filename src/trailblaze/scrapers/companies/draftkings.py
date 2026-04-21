"""DraftKings Inc. IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper, IRLabels


class DraftKingsIRScraper(IRScraper):
    name = "DraftKings"
    entity_slug = "draftkings"
    ir_url = "https://investors.draftkings.com/financial-information/sec-filings"
    reporting_currency = "USD"
    reporting_unit = "millions"

    def build_labels(self) -> IRLabels:
        lbl = IRLabels()
        lbl.extra["monthly_actives"] = [r"monthly\s+unique\s+payers?", r"mup"]
        lbl.extra["arpu"] = [r"average\s+revenue\s+per\s+(?:monthly\s+)?unique\s+payer",
                             r"arpmup"]
        return lbl
