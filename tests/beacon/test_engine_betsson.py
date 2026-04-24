"""Ship-gate scenario — Betsson Q4-2025 gap.

From the brief:

    2024-Q1  240.3
    2024-Q2  260.5
    2024-Q3  285.0
    2024-Q4  280.2
    2025-Q1  303.7
    2025-Q2  295.8
    2025-Q3  290.8
    2025-Q4  —          ← estimate this
    2026-Q1  285.0

Expected Beacon estimate:
    * value in the €275-300M range
    * confidence ≥ 0.70
    * methodology dict documents which methods fired
"""

from __future__ import annotations

import json

from trailblaze.beacon import estimate_series
from trailblaze.beacon.types import BeaconEstimate

from tests.beacon.conftest import load_fixture


def test_betsson_q4_2025_ship_gate():
    series = load_fixture("betsson_revenue")
    estimates = estimate_series(series)

    # Exactly one gap in the fixture.
    assert len(estimates) == 1
    est = estimates[0]
    assert isinstance(est, BeaconEstimate)
    assert est.entity_id == "betsson-ab"
    assert est.metric_code == "revenue"
    assert est.currency == "EUR"
    assert est.period_code == "2025-Q4"

    # Value sanity — within the brief's €275-300M band.
    assert 275.0 <= float(est.value) <= 300.0

    # Confidence — brief requires ≥ 0.70 for this fixture.
    assert est.confidence >= 0.70

    # Methodology dict documents which methods actually fired.
    methods = est.methodology["methods_used"]
    assert "linear_trend" in methods
    assert "yoy_growth" in methods
    # Seasonal needs 2 complete years — only 2024 is complete in this
    # fixture (2025 is missing Q4). Seasonal should have skipped.
    assert "seasonal_index" not in methods

    # Tier check — should land in high or medium, never low.
    tier = est.methodology["final_confidence_tier"]
    assert tier in {"high", "medium"}

    # Methodology must round-trip through JSON (integration layer will
    # serialise into metric_values.metadata JSONB column).
    json.dumps(est.methodology)
