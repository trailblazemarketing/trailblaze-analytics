"""Super Group (SGHC) IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper


class SuperGroupIRScraper(IRScraper):
    name = "Super Group"
    entity_slug = "super-group"
    ir_url = "https://investors.sghc.com/financials/sec-filings"
    reporting_currency = "EUR"
    reporting_unit = "millions"
