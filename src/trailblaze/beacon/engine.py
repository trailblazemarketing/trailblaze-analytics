"""Top-level orchestrator — TimeSeries in, list[BeaconEstimate] out.

Flow:

    1. gap_finder.find_gaps(series)              → list[Gap]
    2. for each gap, run every method            → list[MethodResult]
    3. ensemble.combine(series, gap, results)    → BeaconEstimate | None
    4. filter out suppressed (confidence < 0.30) estimates

v1 only supports ``unit_type in {"currency", "count"}``. Percentage and
ratio metrics need different math (group ≠ sum of parts etc.) and are out
of scope.
"""

from __future__ import annotations

from trailblaze.beacon.ensemble import combine
from trailblaze.beacon.gap_finder import find_gaps
from trailblaze.beacon.methods import ALL_METHODS
from trailblaze.beacon.types import BeaconEstimate, TimeSeries


_SUPPORTED_UNITS = frozenset({"currency", "count"})
_SUPPRESS_BELOW = 0.30


def estimate_series(series: TimeSeries) -> list[BeaconEstimate]:
    """Produce Beacon estimates for every interior gap in ``series``.

    Returns an empty list if the unit type is unsupported, the series is
    too sparse for any method, or all produced estimates fall below the
    render-suppression threshold.
    """
    if series.unit_type not in _SUPPORTED_UNITS:
        return []

    gaps = find_gaps(series)
    if not gaps:
        return []

    estimates: list[BeaconEstimate] = []
    for gap in gaps:
        results = []
        for method in ALL_METHODS:
            out = method.run(series, gap)
            if out is not None:
                results.append(out)
        estimate = combine(series, gap, results)
        if estimate is None:
            continue
        if estimate.confidence < _SUPPRESS_BELOW:
            continue  # UI renders a visible gap, not this estimate
        estimates.append(estimate)
    return estimates
