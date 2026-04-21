"""Caesars Entertainment IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper


class CaesarsIRScraper(IRScraper):
    name = "Caesars"
    entity_slug = "caesars"
    ir_url = "https://investor.caesars.com/financials/sec-filings"
    reporting_currency = "USD"
    reporting_unit = "millions"
