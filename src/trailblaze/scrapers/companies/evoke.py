"""Evoke plc (formerly 888 Holdings) IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper


class EvokeIRScraper(IRScraper):
    name = "Evoke"
    entity_slug = "evoke"
    ir_url = "https://www.evokeplc.com/investors/results-reports-and-presentations/"
    reporting_currency = "GBP"
    reporting_unit = "millions"
