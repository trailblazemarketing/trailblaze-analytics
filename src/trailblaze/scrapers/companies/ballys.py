"""Bally's Corporation IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper


class BallysIRScraper(IRScraper):
    name = "Bally's"
    entity_slug = "ballys"
    ir_url = "https://investors.ballys.com/financial-information/sec-filings"
    reporting_currency = "USD"
    reporting_unit = "millions"
