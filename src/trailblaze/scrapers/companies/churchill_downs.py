"""Churchill Downs Incorporated IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper


class ChurchillDownsIRScraper(IRScraper):
    name = "Churchill Downs"
    entity_slug = "churchill-downs"
    ir_url = "https://ir.churchilldowns.com/financial-information/sec-filings"
    reporting_currency = "USD"
    reporting_unit = "millions"
