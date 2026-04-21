"""Kambi Group IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper, IRLabels


class KambiIRScraper(IRScraper):
    name = "Kambi"
    entity_slug = "kambi-group"
    ir_url = "https://www.kambi.com/investors/financial-reports/"
    reporting_currency = "EUR"
    reporting_unit = "millions"

    def build_labels(self) -> IRLabels:
        lbl = IRLabels()
        # Kambi additionally reports operator turnover — maps to handle.
        lbl.extra["handle"] = [r"operator\s+turnover", r"total\s+turnover"]
        return lbl
