"""Method 1 — linear trend from surrounding disclosed quarters.

Take up to 2 disclosed quarters immediately before the gap and up to 2
immediately after. Fit ``y = a + b·x`` by ordinary least squares where x
is the ordinal position in the full (no-gap) quarter sequence. Predict at
the gap's ordinal.

Confidence
----------
If the fit uses ≥ 3 surrounding points, confidence is
``1 - stddev(residuals) / |mean(surrounding_values)|``, clamped to [0, 1].
If the fit uses exactly 2 points (a single-line interpolation), the fit's
residuals are zero by construction so the formula would return 1.0 — which
overstates real confidence. In that case we return a fixed mid-confidence
(0.6): we know the direction but have no variance information to calibrate.
If < 2 points are available, we skip the method and return ``None``.
"""

from __future__ import annotations

import statistics
from decimal import Decimal
from typing import Optional

from trailblaze.beacon.periods import Quarter, parse_quarter, quarters_between
from trailblaze.beacon.types import Gap, MethodResult, TimeSeries


NAME = "linear_trend"


def _disclosed_points_with_ordinal(
    series: TimeSeries,
) -> dict[Quarter, tuple[int, Decimal]]:
    """Map disclosed Quarter → (ordinal_in_full_range, value)."""
    disclosed: dict[Quarter, Decimal] = {
        parse_quarter(p.period_code): p.value
        for p in series.points
        if p.disclosure_status == "disclosed" and p.value is not None
    }
    if not disclosed:
        return {}
    first = min(disclosed.keys())
    last = max(disclosed.keys())
    ordinal_of: dict[Quarter, int] = {
        q: idx for idx, q in enumerate(quarters_between(first, last))
    }
    return {q: (ordinal_of[q], v) for q, v in disclosed.items()}


def _select_surrounding(
    disclosed_map: dict[Quarter, tuple[int, Decimal]],
    gap_q: Quarter,
) -> list[tuple[int, Decimal]]:
    """Up to 2 disclosed quarters immediately before + 2 immediately after
    the gap, ordered chronologically."""
    before = sorted([(o, v) for q, (o, v) in disclosed_map.items() if q < gap_q])
    after = sorted([(o, v) for q, (o, v) in disclosed_map.items() if gap_q < q])
    return before[-2:] + after[:2]


def _ols(points: list[tuple[int, Decimal]]) -> tuple[float, float]:
    """Ordinary least squares linear fit. Returns (slope, intercept).

    Stdlib only — avoiding numpy keeps the integration layer dep-free.
    """
    xs = [float(o) for o, _ in points]
    ys = [float(v) for _, v in points]
    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((xs[i] - mean_x) * (ys[i] - mean_y) for i in range(n))
    den = sum((xs[i] - mean_x) ** 2 for i in range(n))
    if den == 0.0:
        # All x equal — degenerate, flat line at mean_y.
        return 0.0, mean_y
    slope = num / den
    intercept = mean_y - slope * mean_x
    return slope, intercept


def run(series: TimeSeries, gap: Gap) -> Optional[MethodResult]:
    disclosed_map = _disclosed_points_with_ordinal(series)
    if not disclosed_map:
        return None

    gap_q = parse_quarter(gap.period_code)
    surrounding = _select_surrounding(disclosed_map, gap_q)
    if len(surrounding) < 2:
        return None

    slope, intercept = _ols(surrounding)

    # The gap's ordinal in the full range. Recomputed here (not taken from
    # Gap.ordinal) because ``_disclosed_points_with_ordinal`` uses the same
    # first/last quarters as the gap finder; ordinals align.
    first = min(disclosed_map.keys())
    gap_ordinal = next(
        i for i, q in enumerate(quarters_between(first, max(disclosed_map.keys())))
        if q == gap_q
    )

    predicted = slope * gap_ordinal + intercept
    if predicted <= 0:
        # Negative or zero revenue is not meaningful. Skip the method rather
        # than emit a nonsense estimate.
        return None

    surrounding_values = [float(v) for _, v in surrounding]
    mean_surrounding = sum(surrounding_values) / len(surrounding_values)

    if len(surrounding) >= 3:
        residuals = [
            float(v) - (slope * o + intercept) for o, v in surrounding
        ]
        try:
            res_stddev = statistics.pstdev(residuals)
        except statistics.StatisticsError:
            res_stddev = 0.0
        confidence = 1.0 - (res_stddev / abs(mean_surrounding))
        confidence = max(0.0, min(1.0, confidence))
    else:
        # Exactly 2 points — linear interpolation with undefined variance.
        confidence = 0.6

    return MethodResult(
        name=NAME,
        value=Decimal(str(round(predicted, 4))),
        confidence=round(confidence, 4),
        details={
            "surrounding_ordinals": [o for o, _ in surrounding],
            "surrounding_values": [float(v) for _, v in surrounding],
            "slope": round(slope, 6),
            "intercept": round(intercept, 4),
            "gap_ordinal": gap_ordinal,
        },
    )
