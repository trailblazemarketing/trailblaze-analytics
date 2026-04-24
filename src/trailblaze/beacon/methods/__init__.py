"""Four estimation methods. Each module exposes:

    NAME:  str
    def run(series, gap) -> Optional[MethodResult]

The engine tries each in order, collects non-None results, and hands the
set to ``ensemble.combine``.
"""

from trailblaze.beacon.methods import linear_trend, narrative_hint, seasonal_index, yoy_growth

ALL_METHODS = [linear_trend, yoy_growth, seasonal_index, narrative_hint]

__all__ = ["ALL_METHODS", "linear_trend", "yoy_growth", "seasonal_index", "narrative_hint"]
