"""MGM Resorts International IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper


class MGMIRScraper(IRScraper):
    name = "MGM Resorts"
    entity_slug = "mgm"
    ir_url = "https://investors.mgmresorts.com/investors/financial-information/"
    reporting_currency = "USD"
    reporting_unit = "millions"
