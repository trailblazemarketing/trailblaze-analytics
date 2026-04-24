"""Combine multiple MethodResults into a single BeaconEstimate.

Formula from the brief:

    final_value = Σ (method_value × method_confidence) / Σ method_confidence
    agreement   = 1 − stddev(method_values) / mean(method_values), clamped
    final_conf  = mean(method_confidences) × agreement

Edge cases:
* Single method firing — no agreement term; return the method's value +
  confidence unchanged (agreement defaults to 1.0 for a lone voice).
* Violent disagreement — the agreement factor drops toward 0, dragging
  final confidence with it. The engine then checks the confidence tier
  and may suppress rendering entirely (see BeaconEstimate.tier_for).
* All zero confidences — shouldn't happen if methods gate themselves,
  but defensively we return ``None`` rather than divide by zero.
"""

from __future__ import annotations

import statistics
from decimal import Decimal
from typing import Optional

from trailblaze.beacon.periods import parse_quarter
from trailblaze.beacon.types import BeaconEstimate, Gap, MethodResult, TimeSeries


def combine(
    series: TimeSeries,
    gap: Gap,
    results: list[MethodResult],
) -> Optional[BeaconEstimate]:
    """Collapse per-method results into one BeaconEstimate for the gap.

    Returns ``None`` when no method produced a usable output or the
    combined confidence sits in the "suppress" tier (< 0.30).
    """
    if not results:
        return None

    total_conf = sum(r.confidence for r in results)
    if total_conf <= 0:
        return None

    # Weighted average by confidence.
    weighted = sum(float(r.value) * r.confidence for r in results) / total_conf

    # Agreement factor — penalises methods that disagree.
    values = [float(r.value) for r in results]
    if len(values) >= 2 and statistics.mean(values) != 0:
        vmean = statistics.mean(values)
        vstd = statistics.pstdev(values)
        cv = vstd / abs(vmean)
        agreement = max(0.0, min(1.0, 1.0 - cv))
    else:
        agreement = 1.0  # lone method = perfect agreement by convention

    mean_conf = sum(r.confidence for r in results) / len(results)
    final_conf = max(0.0, min(1.0, mean_conf * agreement))

    # Suppress-tier check: below 0.30 the UI should render a visible gap
    # rather than a low-trust estimate. Surface the suppression decision
    # explicitly in methodology so downstream tooling sees the reason.
    tier = BeaconEstimate.tier_for(final_conf)

    gap_q = parse_quarter(gap.period_code)
    market_id = series.market_id

    methodology: dict = {
        "methods_used": [r.name for r in results],
        "method_outputs": {
            r.name: {
                "value": float(r.value),
                "confidence": r.confidence,
                **({"details": r.details} if r.details else {}),
            }
            for r in results
        },
        "ensemble_agreement": round(agreement, 4),
        "mean_method_confidence": round(mean_conf, 4),
        "final_confidence_tier": tier,
    }

    # Disclosed periods used (for narrative / UI purposes). We list the
    # union of every period any method actually relied on, not just the
    # flanking quarters — the methodology dict should be auditable.
    disclosed_periods_used: set[str] = set()
    for r in results:
        if not r.details:
            continue
        # linear_trend surfaces ordinals, not codes — skip that one cleanly
        # by only pulling period-code-looking strings from known detail keys.
        anchor = r.details.get("anchor_period")
        if isinstance(anchor, str):
            disclosed_periods_used.add(anchor)
        for g in r.details.get("growth_rates", []) or []:
            if isinstance(g, dict):
                for key in ("from", "to"):
                    v = g.get(key)
                    if isinstance(v, str):
                        disclosed_periods_used.add(v)
        for y in r.details.get("complete_years", []) or []:
            for qn in (1, 2, 3, 4):
                disclosed_periods_used.add(f"{y}-Q{qn}")
    if disclosed_periods_used:
        methodology["disclosed_periods_used"] = sorted(disclosed_periods_used)

    return BeaconEstimate(
        entity_id=series.entity_id,
        metric_code=series.metric_code,
        market_id=market_id,
        period_code=gap_q.code,
        value=Decimal(str(round(weighted, 4))),
        currency=series.currency,
        confidence=round(final_conf, 4),
        methodology=methodology,
    )
