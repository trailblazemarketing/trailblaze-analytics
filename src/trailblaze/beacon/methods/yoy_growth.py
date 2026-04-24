"""Method 2 — year-over-year same-quarter comparison.

Requires the prior-year same quarter to be disclosed (the anchor). Uses the
disclosed YoY growth factors of adjacent quarters (within ±2 quarters of
the gap on either side) to estimate a growth factor for the gap quarter,
then applies that to the anchor:

    estimate = prior_year_same_quarter × avg_yoy_growth_factor

Confidence
----------
``1 - coefficient_of_variation(yoy_growth_rates)``, clamped [0, 1]. When
the business is growing steadily, CV is small and confidence is high; when
adjacent quarters' YoY swings wildly, CV is big and we back off.

Skip conditions
---------------
* Prior-year same quarter is not disclosed — no anchor, return ``None``.
* Fewer than 2 adjacent-quarter YoY rates computable — return ``None``.
"""

from __future__ import annotations

import statistics
from decimal import Decimal
from typing import Optional

from trailblaze.beacon.periods import Quarter, parse_quarter
from trailblaze.beacon.types import Gap, MethodResult, TimeSeries


NAME = "yoy_growth"

# How many quarters either side of the gap we consult for adjacent YoY
# growth rates. Keep this small — the intuition is "nearby behaviour, not
# full business-cycle averaging".
_ADJACENT_WINDOW = 2


def _disclosed_map(series: TimeSeries) -> dict[Quarter, Decimal]:
    return {
        parse_quarter(p.period_code): p.value
        for p in series.points
        if p.disclosure_status == "disclosed" and p.value is not None
    }


def run(series: TimeSeries, gap: Gap) -> Optional[MethodResult]:
    disclosed = _disclosed_map(series)
    if not disclosed:
        return None

    gap_q = parse_quarter(gap.period_code)
    anchor_q = gap_q.prior_year_same_quarter()
    if anchor_q not in disclosed:
        return None
    anchor = disclosed[anchor_q]
    if float(anchor) <= 0:
        return None  # can't compute a growth factor against zero

    # Collect YoY growth rates from adjacent quarters — each rate pairs a
    # disclosed quarter with its own prior-year partner (also disclosed).
    growth_rates: list[float] = []
    growth_details: list[dict[str, float | str]] = []
    for offset in range(-_ADJACENT_WINDOW, _ADJACENT_WINDOW + 1):
        if offset == 0:
            continue  # that's the gap itself
        cur = _shifted(gap_q, offset)
        prev = cur.prior_year_same_quarter()
        if cur not in disclosed or prev not in disclosed:
            continue
        if float(disclosed[prev]) <= 0:
            continue
        rate = float(disclosed[cur]) / float(disclosed[prev])
        growth_rates.append(rate)
        growth_details.append(
            {"from": prev.code, "to": cur.code, "rate": round(rate, 6)}
        )

    if len(growth_rates) < 2:
        return None

    avg_rate = sum(growth_rates) / len(growth_rates)
    predicted = float(anchor) * avg_rate
    if predicted <= 0:
        return None

    # CV-based confidence. pstdev (population) keeps small-sample behaviour
    # predictable; stddev/mean isolates the dispersion regardless of
    # absolute growth level.
    try:
        stddev = statistics.pstdev(growth_rates)
    except statistics.StatisticsError:
        stddev = 0.0
    cv = stddev / abs(avg_rate) if avg_rate else 0.0
    confidence = max(0.0, min(1.0, 1.0 - cv))

    return MethodResult(
        name=NAME,
        value=Decimal(str(round(predicted, 4))),
        confidence=round(confidence, 4),
        details={
            "anchor_period": anchor_q.code,
            "anchor_value": float(anchor),
            "growth_rates": growth_details,
            "avg_growth_rate": round(avg_rate, 6),
            "coefficient_of_variation": round(cv, 6),
        },
    )


def _shifted(q: Quarter, by_quarters: int) -> Quarter:
    """Move ``q`` forward (positive) or backward (negative) by quarters."""
    cur = q
    if by_quarters > 0:
        for _ in range(by_quarters):
            cur = cur.next()
    else:
        for _ in range(-by_quarters):
            cur = cur.prev()
    return cur
