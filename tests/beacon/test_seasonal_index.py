"""Method 3 — seasonal index."""

from __future__ import annotations

from trailblaze.beacon.gap_finder import find_gaps
from trailblaze.beacon.methods import seasonal_index

from tests.beacon.conftest import make_series


def test_seasonal_with_two_complete_years():
    """Two full years of history → method fires with medium-tier confidence."""
    series = make_series(
        [
            # 2023 complete; seasonal shares Q1/Q2/Q3/Q4 = 0.2 / 0.25 / 0.25 / 0.3
            ("2023-Q1", "200.0", "disclosed"),
            ("2023-Q2", "250.0", "disclosed"),
            ("2023-Q3", "250.0", "disclosed"),
            ("2023-Q4", "300.0", "disclosed"),
            # 2024 complete, same seasonal profile (scaled 2x)
            ("2024-Q1", "400.0", "disclosed"),
            ("2024-Q2", "500.0", "disclosed"),
            ("2024-Q3", "500.0", "disclosed"),
            ("2024-Q4", "600.0", "disclosed"),
            # 2025 with Q1+Q3 disclosed, Q2 and Q4 gaps
            ("2025-Q1", "500.0", "disclosed"),
            ("2025-Q2", None, "not_disclosed"),
            ("2025-Q3", "625.0", "disclosed"),  # matches seasonal profile
            ("2025-Q4", None, "not_disclosed"),
        ]
    )
    q2 = next(g for g in find_gaps(series) if g.period_code == "2025-Q2")
    result = seasonal_index.run(series, q2)
    assert result is not None
    # Q1+Q3 combined share is 0.45 of annual; disclosed sum is 500+625 = 1125.
    # Expected annual = 1125 / 0.45 = 2500. Q2 share 0.25 → 625.
    assert 620.0 <= float(result.value) <= 630.0
    # Two complete years, zero variance in shares across years → base 0.60
    # with zero history bonus and zero variance penalty.
    assert 0.55 <= result.confidence <= 0.65


def test_seasonal_skips_with_one_complete_year():
    """Only one complete year = insufficient history, method returns None."""
    series = make_series(
        [
            ("2024-Q1", "100.0", "disclosed"),
            ("2024-Q2", "110.0", "disclosed"),
            ("2024-Q3", "120.0", "disclosed"),
            ("2024-Q4", "130.0", "disclosed"),
            ("2025-Q1", "110.0", "disclosed"),
            ("2025-Q2", None, "not_disclosed"),
            ("2025-Q3", "130.0", "disclosed"),
        ]
    )
    gap = find_gaps(series)[0]
    assert seasonal_index.run(series, gap) is None


def test_seasonal_skips_when_gap_year_has_no_disclosed_quarters():
    """If the gap year has zero disclosed quarters we can't scale an
    expected annual; method skips."""
    series = make_series(
        [
            ("2023-Q1", "100.0", "disclosed"),
            ("2023-Q2", "110.0", "disclosed"),
            ("2023-Q3", "120.0", "disclosed"),
            ("2023-Q4", "130.0", "disclosed"),
            ("2024-Q1", "110.0", "disclosed"),
            ("2024-Q2", "121.0", "disclosed"),
            ("2024-Q3", "132.0", "disclosed"),
            ("2024-Q4", "143.0", "disclosed"),
            # 2025 entirely absent → no data to scale
            ("2026-Q1", "150.0", "disclosed"),
        ]
    )
    # Build a synthetic Gap for 2025-Q2 (which won't be in find_gaps output
    # because gap_finder won't traverse across full absent years where
    # ordinals still run — but it WILL list them; this test is defensive).
    gaps = find_gaps(series)
    for g in gaps:
        if g.period_code.startswith("2025-"):
            assert seasonal_index.run(series, g) is None


def test_seasonal_history_bonus():
    """Three complete years should bump confidence above the 2-year baseline."""
    series = make_series(
        [
            ("2022-Q1", "200.0", "disclosed"),
            ("2022-Q2", "250.0", "disclosed"),
            ("2022-Q3", "250.0", "disclosed"),
            ("2022-Q4", "300.0", "disclosed"),
            ("2023-Q1", "220.0", "disclosed"),
            ("2023-Q2", "275.0", "disclosed"),
            ("2023-Q3", "275.0", "disclosed"),
            ("2023-Q4", "330.0", "disclosed"),
            ("2024-Q1", "240.0", "disclosed"),
            ("2024-Q2", "300.0", "disclosed"),
            ("2024-Q3", "300.0", "disclosed"),
            ("2024-Q4", "360.0", "disclosed"),
            ("2025-Q1", "260.0", "disclosed"),
            ("2025-Q2", None, "not_disclosed"),
            ("2025-Q3", "325.0", "disclosed"),
        ]
    )
    gap = next(g for g in find_gaps(series) if g.period_code == "2025-Q2")
    result = seasonal_index.run(series, gap)
    assert result is not None
    # 3 complete years → history bonus +0.05 for the extra year beyond 2.
    assert result.confidence > 0.6
