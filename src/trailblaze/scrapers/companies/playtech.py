"""Playtech plc IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper


class PlaytechIRScraper(IRScraper):
    name = "Playtech"
    entity_slug = "playtech"
    ir_url = "https://www.playtech.com/investor-relations/reports-and-presentations"
    reporting_currency = "EUR"
    reporting_unit = "millions"
