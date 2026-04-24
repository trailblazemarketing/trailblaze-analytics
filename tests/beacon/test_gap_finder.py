"""Gap finder — identify interior missing quarters only."""

from __future__ import annotations

from trailblaze.beacon.gap_finder import find_gaps

from tests.beacon.conftest import load_fixture, make_series


def test_single_interior_gap_identified():
    """Betsson fixture — 2025-Q4 is the only interior gap."""
    series = load_fixture("betsson_revenue")
    gaps = find_gaps(series)
    assert [g.period_code for g in gaps] == ["2025-Q4"]


def test_multiple_interior_gaps_identified():
    """Flutter fixture — 2024-Q2 and 2025-Q2 are both gaps."""
    series = load_fixture("flutter_revenue")
    gaps = find_gaps(series)
    assert [g.period_code for g in gaps] == ["2024-Q2", "2025-Q2"]


def test_no_gaps_for_clean_series():
    """Evolution fixture — fully disclosed → zero gaps."""
    series = load_fixture("evolution_revenue")
    assert find_gaps(series) == []


def test_edge_gap_before_first_disclosed_ignored():
    """A not_disclosed row BEFORE the first disclosed quarter is not a gap.
    The engine does not extrapolate backwards — that's v2 territory."""
    series = make_series(
        [
            ("2024-Q1", None, "not_disclosed"),
            ("2024-Q2", "100.0", "disclosed"),
            ("2024-Q3", "110.0", "disclosed"),
            ("2024-Q4", "120.0", "disclosed"),
        ]
    )
    assert find_gaps(series) == []


def test_edge_gap_after_last_disclosed_ignored():
    """A not_disclosed row AFTER the last disclosed quarter is not a gap."""
    series = make_series(
        [
            ("2024-Q1", "100.0", "disclosed"),
            ("2024-Q2", "110.0", "disclosed"),
            ("2024-Q3", "120.0", "disclosed"),
            ("2024-Q4", None, "not_disclosed"),
        ]
    )
    assert find_gaps(series) == []


def test_absent_interior_quarter_is_a_gap_even_without_placeholder():
    """If a quarter is entirely absent from the series (no row at all),
    it still counts as a gap if it sits between disclosed quarters."""
    series = make_series(
        [
            ("2024-Q1", "100.0", "disclosed"),
            # 2024-Q2 absent
            ("2024-Q3", "120.0", "disclosed"),
        ]
    )
    gaps = find_gaps(series)
    assert [g.period_code for g in gaps] == ["2024-Q2"]


def test_partially_disclosed_treated_as_gap():
    """``partially_disclosed`` status means the UI has something but the
    underlying value is unreliable — Beacon should estimate over it."""
    series = make_series(
        [
            ("2024-Q1", "100.0", "disclosed"),
            ("2024-Q2", "55.0", "partially_disclosed"),
            ("2024-Q3", "130.0", "disclosed"),
        ]
    )
    gaps = find_gaps(series)
    assert [g.period_code for g in gaps] == ["2024-Q2"]


def test_empty_series():
    """Empty input yields empty output, not a crash."""
    series = make_series([])
    assert find_gaps(series) == []


def test_single_disclosed_point_no_gaps():
    """Nothing to interpolate between → empty gaps."""
    series = make_series([("2024-Q1", "100.0", "disclosed")])
    assert find_gaps(series) == []


def test_ordinals_align_with_full_range():
    """Gap ordinals should index into the first→last full quarter range."""
    series = make_series(
        [
            ("2024-Q1", "100.0", "disclosed"),  # ordinal 0
            ("2024-Q2", None, "not_disclosed"),  # ordinal 1
            ("2024-Q3", "120.0", "disclosed"),  # ordinal 2
            ("2024-Q4", None, "not_disclosed"),  # ordinal 3
            ("2025-Q1", "140.0", "disclosed"),  # ordinal 4
        ]
    )
    gaps = find_gaps(series)
    ords = {g.period_code: g.ordinal for g in gaps}
    assert ords == {"2024-Q2": 1, "2024-Q4": 3}
