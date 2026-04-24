"""Core dataclasses for Beacon(tm) v1.

Shapes mirror the brief exactly so the eventual Trailblaze-main integration
layer can map 1:1 between these and the ``metric_values`` / ``metrics`` /
``periods`` schema. See ``docs/INTEGRATION.md`` for that mapping.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any, Optional


# ---------------------------------------------------------------------------
# Input shapes
# ---------------------------------------------------------------------------


@dataclass
class TimeSeriesPoint:
    """One (period, value, disclosure_status) tuple on a series."""

    period_code: str
    period_start_date: date
    period_end_date: date
    value: Optional[Decimal]
    disclosure_status: str


@dataclass
class TimeSeries:
    """A single (entity, metric, market) series over quarterly periods.

    Points may be in any order; the engine sorts internally by
    ``period_start_date`` before running anything.
    """

    entity_id: str
    metric_code: str
    market_id: Optional[str]
    currency: str
    unit_type: str  # "currency" | "count" — v1 only supports these two.
    points: list[TimeSeriesPoint]


# ---------------------------------------------------------------------------
# Intermediate
# ---------------------------------------------------------------------------


@dataclass
class Gap:
    """An interior period that needs a Beacon estimate.

    ``ordinal`` is the index into the sorted full quarter sequence the gap
    finder enumerates between the first and last disclosed point — useful
    for linear-trend x-coordinates.
    """

    period_code: str
    period_start_date: date
    period_end_date: date
    ordinal: int


@dataclass
class MethodResult:
    """Output of one estimation method for one gap."""

    name: str
    value: Decimal
    confidence: float  # 0.0..1.0
    details: dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Output shape
# ---------------------------------------------------------------------------


@dataclass
class BeaconEstimate:
    """A Beacon(tm) gap-fill estimate for one (entity, metric, market, period).

    Written to Trailblaze's ``metric_values`` row with
    ``disclosure_status='beacon_estimate'`` and this object's ``methodology``
    dict serialised into the row's JSONB ``metadata`` column.
    """

    entity_id: str
    metric_code: str
    market_id: Optional[str]
    period_code: str
    value: Decimal
    currency: str
    confidence: float
    methodology: dict[str, Any]

    # Confidence-tier thresholds from the brief. Static — UI can re-derive
    # without round-tripping these, but we expose the helper so the
    # integration layer has one source of truth.
    @staticmethod
    def tier_for(confidence: float) -> str:
        if confidence >= 0.80:
            return "high"
        if confidence >= 0.50:
            return "medium"
        if confidence >= 0.30:
            return "low"
        return "suppress"  # UI should render a visible gap, not the estimate
