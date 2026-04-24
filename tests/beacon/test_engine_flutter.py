"""Multi-gap scenario — Flutter fixture has two interior gaps."""

from __future__ import annotations

from trailblaze.beacon import estimate_series

from tests.beacon.conftest import load_fixture


def test_flutter_two_gaps_estimated():
    """Expect two BeaconEstimates, one per gap, both in plausible ranges."""
    series = load_fixture("flutter_revenue")
    estimates = estimate_series(series)

    periods = sorted(e.period_code for e in estimates)
    assert periods == ["2024-Q2", "2025-Q2"]
    # USD values; sanity-check that neither is negative or wildly out of band.
    for est in estimates:
        assert float(est.value) > 0
        assert 1500.0 <= float(est.value) <= 5000.0
        assert est.confidence > 0.30
