"""Evolution AB IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper


class EvolutionIRScraper(IRScraper):
    name = "Evolution"
    entity_slug = "evolution"
    ir_url = "https://www.evolution.com/investors/financial-reports"
    reporting_currency = "EUR"
    reporting_unit = "millions"
