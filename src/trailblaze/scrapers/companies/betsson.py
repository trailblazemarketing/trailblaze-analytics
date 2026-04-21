"""Betsson AB IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper


class BetssonIRScraper(IRScraper):
    name = "Betsson"
    entity_slug = "betsson"
    ir_url = "https://www.betssonab.com/en/investors/financial-reports/"
    reporting_currency = "EUR"
    reporting_unit = "millions"
