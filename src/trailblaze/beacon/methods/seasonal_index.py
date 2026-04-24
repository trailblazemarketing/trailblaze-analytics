"""Method 3 — seasonal index.

If at least 2 full calendar years of disclosed quarterly data exist, compute
each quarter's historical share of its annual total. The estimate is then

    expected_annual_total_for_gap_year × seasonal_index[gap_quarter]

where ``expected_annual_total_for_gap_year`` is inferred from the disclosed
quarters within the gap's calendar year — specifically by dividing their
summed value by the sum of their seasonal shares. This scales up partial
observations to a whole year in the seasonal proportion.

Confidence
----------
Medium tier by design. Seasonal inference is stable when history is long
and repeatable, but fragile on turning-point quarters. Baseline 0.60,
bumped toward 0.75 when ≥ 3 complete historical years exist, docked for
high variance across years in the gap quarter's historical shares.

Skip conditions
---------------
* Fewer than 2 complete calendar years of disclosed data — return ``None``.
* Zero disclosed quarters in the gap's calendar year (can't scale).
"""

from __future__ import annotations

import statistics
from decimal import Decimal
from typing import Optional

from trailblaze.beacon.periods import Quarter, parse_quarter
from trailblaze.beacon.types import Gap, MethodResult, TimeSeries


NAME = "seasonal_index"


def _complete_years(
    disclosed: dict[Quarter, Decimal],
) -> dict[int, dict[int, Decimal]]:
    """Return ``{year: {quarter: value}}`` for years with all 4 quarters
    disclosed."""
    by_year: dict[int, dict[int, Decimal]] = {}
    for q, v in disclosed.items():
        by_year.setdefault(q.year, {})[q.quarter] = v
    return {y: qs for y, qs in by_year.items() if len(qs) == 4}


def run(series: TimeSeries, gap: Gap) -> Optional[MethodResult]:
    disclosed: dict[Quarter, Decimal] = {
        parse_quarter(p.period_code): p.value
        for p in series.points
        if p.disclosure_status == "disclosed" and p.value is not None
    }

    complete = _complete_years(disclosed)
    if len(complete) < 2:
        return None

    # Seasonal shares per historical quarter — average across complete years.
    shares_by_q: dict[int, list[float]] = {1: [], 2: [], 3: [], 4: []}
    for year_qs in complete.values():
        annual = sum(float(v) for v in year_qs.values())
        if annual <= 0:
            continue
        for q_num, v in year_qs.items():
            shares_by_q[q_num].append(float(v) / annual)

    if any(not shares_by_q[i] for i in (1, 2, 3, 4)):
        return None  # shouldn't happen given complete-year filter, but guard.

    seasonal_index: dict[int, float] = {
        q_num: sum(shares_by_q[q_num]) / len(shares_by_q[q_num])
        for q_num in (1, 2, 3, 4)
    }

    # Sanity: shares should sum to ~1.0 across all 4 quarters.
    if not 0.95 <= sum(seasonal_index.values()) <= 1.05:
        return None

    gap_q = parse_quarter(gap.period_code)
    gap_year_disclosed = {
        q.quarter: v for q, v in disclosed.items() if q.year == gap_q.year
    }
    if not gap_year_disclosed:
        return None

    disclosed_share_total = sum(
        seasonal_index[q_num] for q_num in gap_year_disclosed
    )
    if disclosed_share_total <= 0:
        return None

    disclosed_value_total = sum(float(v) for v in gap_year_disclosed.values())
    expected_annual = disclosed_value_total / disclosed_share_total

    predicted = expected_annual * seasonal_index[gap_q.quarter]
    if predicted <= 0:
        return None

    # Confidence: start at 0.60, nudge upward for longer history, downward
    # for high variance in the gap quarter's historical share.
    base = 0.60
    history_bonus = 0.05 * max(0, len(complete) - 2)  # +0.05 per extra year
    gap_q_shares = shares_by_q[gap_q.quarter]
    if len(gap_q_shares) >= 2:
        try:
            gq_cv = (
                statistics.pstdev(gap_q_shares)
                / statistics.mean(gap_q_shares)
            )
        except statistics.StatisticsError:
            gq_cv = 0.0
    else:
        gq_cv = 0.0
    variance_penalty = min(0.2, gq_cv)  # cap penalty
    confidence = max(0.0, min(1.0, base + history_bonus - variance_penalty))

    return MethodResult(
        name=NAME,
        value=Decimal(str(round(predicted, 4))),
        confidence=round(confidence, 4),
        details={
            "complete_years": sorted(complete.keys()),
            "seasonal_index": {
                str(k): round(v, 6) for k, v in seasonal_index.items()
            },
            "gap_year_disclosed_quarters": sorted(gap_year_disclosed.keys()),
            "expected_annual_total": round(expected_annual, 4),
            "gap_quarter_share": round(seasonal_index[gap_q.quarter], 6),
        },
    )
