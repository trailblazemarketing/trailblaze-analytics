"""Method 2 — year-over-year growth."""

from __future__ import annotations

from trailblaze.beacon.gap_finder import find_gaps
from trailblaze.beacon.methods import yoy_growth

from tests.beacon.conftest import make_series


def test_yoy_with_anchor_and_adjacent_rates():
    """Classic scenario: prior-year Q4 disclosed, adjacent quarters have
    consistent YoY growth, gap is this-year Q4."""
    series = make_series(
        [
            ("2024-Q1", "100.0", "disclosed"),
            ("2024-Q2", "110.0", "disclosed"),
            ("2024-Q3", "120.0", "disclosed"),
            ("2024-Q4", "130.0", "disclosed"),
            ("2025-Q1", "115.0", "disclosed"),  # YoY 1.15
            ("2025-Q2", "126.5", "disclosed"),  # YoY 1.15
            ("2025-Q3", "138.0", "disclosed"),  # YoY 1.15
            ("2025-Q4", None, "not_disclosed"),
            ("2026-Q1", "132.25", "disclosed"),  # YoY 1.15 vs 115
        ]
    )
    gap = find_gaps(series)[0]
    result = yoy_growth.run(series, gap)
    assert result is not None
    # 130 × 1.15 = 149.5
    assert 148.5 <= float(result.value) <= 150.5
    # All growth rates identical → CV = 0 → confidence = 1.0.
    assert result.confidence >= 0.99


def test_yoy_skips_when_anchor_missing():
    """If prior-year same-quarter isn't disclosed, method returns None."""
    series = make_series(
        [
            # 2023-Q4 (would be the anchor for 2024-Q4) absent
            ("2024-Q1", "100.0", "disclosed"),
            ("2024-Q2", "110.0", "disclosed"),
            ("2024-Q3", "120.0", "disclosed"),
            ("2024-Q4", None, "not_disclosed"),  # gap, but no anchor
            ("2025-Q1", "140.0", "disclosed"),
        ]
    )
    gap = find_gaps(series)[0]
    assert yoy_growth.run(series, gap) is None


def test_yoy_skips_when_insufficient_adjacent_rates():
    """Anchor present but not enough adjacent YoY pairs to compute an
    average — method skips rather than emit a 1-rate estimate.

    Construction: 2024-Q4 is disclosed (anchor for 2025-Q4); 2026-Q2 is
    disclosed (makes 2025-Q4 interior, not edge). But the adjacent-window
    partners needed to compute YoY rates around 2025-Q4 (their
    corresponding 2024 quarters) are absent, so only ONE rate is available
    (2026-Q2 / 2025-Q2 — but 2025-Q2 is also absent) → the method can't
    hit the ≥2-rate threshold and skips.
    """
    series = make_series(
        [
            ("2024-Q4", "130.0", "disclosed"),   # anchor for 2025-Q4
            # 2025-Q1, Q2, Q3 all absent — their anchor partners also absent
            ("2025-Q4", None, "not_disclosed"),  # interior gap thanks to 2026-Q2
            # 2026-Q1 absent → no Q1/Q1 rate
            ("2026-Q2", "140.0", "disclosed"),   # 2025-Q2 absent → no Q2/Q2 rate
        ]
    )
    gaps = find_gaps(series)
    q4 = next(g for g in gaps if g.period_code == "2025-Q4")
    # Anchor present (2024-Q4) but zero adjacent YoY pairs are computable
    # — method must skip.
    assert yoy_growth.run(series, q4) is None


def test_volatile_growth_lowers_confidence():
    """When YoY rates swing, CV is large, confidence drops sharply."""
    series = make_series(
        [
            ("2024-Q1", "100.0", "disclosed"),
            ("2024-Q2", "100.0", "disclosed"),
            ("2024-Q3", "100.0", "disclosed"),
            ("2024-Q4", "100.0", "disclosed"),
            ("2025-Q1", "200.0", "disclosed"),  # YoY 2.0
            ("2025-Q2", "50.0", "disclosed"),  # YoY 0.5
            ("2025-Q3", "300.0", "disclosed"),  # YoY 3.0
            ("2025-Q4", None, "not_disclosed"),
            ("2026-Q1", "80.0", "disclosed"),  # YoY 0.4 vs 200
        ]
    )
    gap = find_gaps(series)[0]
    result = yoy_growth.run(series, gap)
    assert result is not None
    # With such volatile rates CV is high → confidence well below 0.5.
    assert result.confidence < 0.5
