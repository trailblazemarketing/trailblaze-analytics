"""Method 1 — linear trend."""

from __future__ import annotations

from trailblaze.beacon.gap_finder import find_gaps
from trailblaze.beacon.methods import linear_trend

from tests.beacon.conftest import make_series


def test_4_point_series_with_interior_gap():
    """Classic scenario: 2 quarters before + 2 quarters after a lone gap.
    OLS on a nearly-linear ramp should predict close to the midpoint."""
    series = make_series(
        [
            ("2024-Q1", "100.0", "disclosed"),
            ("2024-Q2", "110.0", "disclosed"),
            ("2024-Q3", None, "not_disclosed"),  # gap
            ("2024-Q4", "130.0", "disclosed"),
            ("2025-Q1", "140.0", "disclosed"),
        ]
    )
    gap = find_gaps(series)[0]
    result = linear_trend.run(series, gap)
    assert result is not None
    # Perfect ramp +10 per quarter → 120 at the gap.
    assert 119.0 <= float(result.value) <= 121.0
    # Fit residuals are zero on a perfect ramp → confidence = 1.0.
    assert result.confidence >= 0.99


def test_method_skips_with_insufficient_surrounding_points():
    """Only one disclosed quarter before and one after — if fewer than 2
    surrounding points total are available the method skips."""
    series = make_series(
        [
            ("2024-Q1", "100.0", "disclosed"),
            # 2024-Q2 absent
        ]
    )
    # No gaps to even try; but also confirm the _select_surrounding branch
    # gates on count. Build a manufactured Gap to probe the method.
    from datetime import date

    from trailblaze.beacon.types import Gap

    manufactured = Gap(
        period_code="2024-Q2",
        period_start_date=date(2024, 4, 1),
        period_end_date=date(2024, 6, 30),
        ordinal=1,
    )
    assert linear_trend.run(series, manufactured) is None


def test_noisy_series_lowers_confidence():
    """A series that wiggles should produce lower linear-trend confidence
    than a smooth ramp."""
    series = make_series(
        [
            ("2024-Q1", "100.0", "disclosed"),
            ("2024-Q2", "130.0", "disclosed"),  # spike up
            ("2024-Q3", None, "not_disclosed"),
            ("2024-Q4", "95.0", "disclosed"),  # dip
            ("2025-Q1", "120.0", "disclosed"),
        ]
    )
    gap = find_gaps(series)[0]
    result = linear_trend.run(series, gap)
    assert result is not None
    # Residuals are substantial; confidence is nowhere near 1.0.
    assert result.confidence < 0.90


def test_two_surrounding_points_mid_confidence():
    """With exactly 2 points spanning the gap, we return a fixed 0.6 since
    residual variance is undefined (0 residuals on a 2-point line)."""
    series = make_series(
        [
            ("2024-Q1", "100.0", "disclosed"),
            ("2024-Q2", None, "not_disclosed"),
            ("2024-Q3", "120.0", "disclosed"),
        ]
    )
    gap = find_gaps(series)[0]
    result = linear_trend.run(series, gap)
    assert result is not None
    assert result.confidence == 0.6
    # Linear interpolation midpoint between 100 and 120 = 110.
    assert 109.0 <= float(result.value) <= 111.0
