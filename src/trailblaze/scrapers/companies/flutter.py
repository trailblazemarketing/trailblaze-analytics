"""Flutter Entertainment IR scraper."""

from __future__ import annotations

from trailblaze.scrapers.companies._base import IRScraper, IRLabels


class FlutterIRScraper(IRScraper):
    name = "Flutter"
    entity_slug = "flutter"
    ir_url = "https://www.flutter.com/investors/results-reports-and-presentations/"
    reporting_currency = "USD"
    reporting_unit = "millions"

    def build_labels(self) -> IRLabels:
        lbl = IRLabels()
        # Flutter publishes segment-level revenue — grab the group total + FanDuel AMP.
        lbl.extra["monthly_actives"] = [r"average\s+monthly\s+players?"]
        return lbl
