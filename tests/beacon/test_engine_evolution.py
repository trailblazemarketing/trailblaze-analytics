"""Clean-series scenario — Evolution has no gaps → zero estimates."""

from __future__ import annotations

from trailblaze.beacon import estimate_series

from tests.beacon.conftest import load_fixture


def test_evolution_produces_no_estimates():
    series = load_fixture("evolution_revenue")
    assert estimate_series(series) == []
