"""Beacon(tm) v1 — gap-fill estimator for disclosed time series.

Public surface:
    from beacon import estimate_series, TimeSeries, TimeSeriesPoint, BeaconEstimate

See ``docs/METHODOLOGY.md`` for the plain-English writeup and
``docs/INTEGRATION.md`` for integration into the Trailblaze main repo.
"""

from trailblaze.beacon.types import (
    BeaconEstimate,
    Gap,
    MethodResult,
    TimeSeries,
    TimeSeriesPoint,
)
from trailblaze.beacon.engine import estimate_series

__all__ = [
    "BeaconEstimate",
    "Gap",
    "MethodResult",
    "TimeSeries",
    "TimeSeriesPoint",
    "estimate_series",
]
