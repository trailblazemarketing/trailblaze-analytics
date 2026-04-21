"""Kindred Group IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper


class KindredIRScraper(IRScraper):
    name = "Kindred"
    entity_slug = "kindred-group"
    ir_url = "https://www.kindredgroup.com/investors/financial-reports/"
    reporting_currency = "GBP"
    reporting_unit = "millions"
