"""Ensemble combiner behaviour."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from trailblaze.beacon.ensemble import combine
from trailblaze.beacon.types import Gap, MethodResult, TimeSeries, TimeSeriesPoint


def _stub_series() -> TimeSeries:
    # Minimal series — combine() doesn't inspect points, only entity/metric/currency.
    return TimeSeries(
        entity_id="test-entity",
        metric_code="revenue",
        market_id=None,
        currency="EUR",
        unit_type="currency",
        points=[
            TimeSeriesPoint(
                period_code="2025-Q1",
                period_start_date=date(2025, 1, 1),
                period_end_date=date(2025, 3, 31),
                value=Decimal("100"),
                disclosure_status="disclosed",
            )
        ],
    )


def _stub_gap() -> Gap:
    return Gap(
        period_code="2025-Q3",
        period_start_date=date(2025, 7, 1),
        period_end_date=date(2025, 9, 30),
        ordinal=2,
    )


def test_all_three_methods_fire_and_agree():
    """All three methods return close values with high individual confidence.
    Agreement factor stays near 1; final confidence near the mean."""
    results = [
        MethodResult(name="linear_trend", value=Decimal("100.0"), confidence=0.9),
        MethodResult(name="yoy_growth", value=Decimal("101.0"), confidence=0.85),
        MethodResult(name="seasonal_index", value=Decimal("99.5"), confidence=0.7),
    ]
    est = combine(_stub_series(), _stub_gap(), results)
    assert est is not None
    assert 99.5 <= float(est.value) <= 100.5
    assert est.confidence > 0.80
    assert est.methodology["ensemble_agreement"] > 0.95
    assert set(est.methodology["methods_used"]) == {
        "linear_trend",
        "yoy_growth",
        "seasonal_index",
    }


def test_single_method_firing_agreement_defaults_to_one():
    """When only one method provides a result, agreement=1.0 by convention
    and final confidence equals that method's confidence."""
    results = [
        MethodResult(name="linear_trend", value=Decimal("100.0"), confidence=0.75),
    ]
    est = combine(_stub_series(), _stub_gap(), results)
    assert est is not None
    assert float(est.value) == 100.0
    assert est.confidence == 0.75
    assert est.methodology["ensemble_agreement"] == 1.0


def test_violent_disagreement_drops_confidence():
    """Methods that pick very different values should be punished — agreement
    drops, final confidence follows."""
    results = [
        MethodResult(name="linear_trend", value=Decimal("100.0"), confidence=0.9),
        MethodResult(name="yoy_growth", value=Decimal("50.0"), confidence=0.9),
        MethodResult(name="seasonal_index", value=Decimal("300.0"), confidence=0.9),
    ]
    est = combine(_stub_series(), _stub_gap(), results)
    assert est is not None
    # Individual confidences all 0.9, but agreement is low (huge dispersion).
    assert est.confidence < 0.5
    assert est.methodology["ensemble_agreement"] < 0.5


def test_empty_results_returns_none():
    assert combine(_stub_series(), _stub_gap(), []) is None


def test_all_zero_confidence_returns_none():
    results = [
        MethodResult(name="linear_trend", value=Decimal("100.0"), confidence=0.0),
        MethodResult(name="yoy_growth", value=Decimal("100.0"), confidence=0.0),
    ]
    assert combine(_stub_series(), _stub_gap(), results) is None


def test_methodology_serialises_per_method_details():
    """Ensure downstream observability — each method's details block lives
    inside the ensemble output."""
    results = [
        MethodResult(
            name="linear_trend",
            value=Decimal("100.0"),
            confidence=0.9,
            details={"slope": 1.5},
        ),
        MethodResult(
            name="yoy_growth",
            value=Decimal("102.0"),
            confidence=0.8,
            details={"anchor_period": "2024-Q3", "anchor_value": 95.0},
        ),
    ]
    est = combine(_stub_series(), _stub_gap(), results)
    assert est is not None
    outs = est.methodology["method_outputs"]
    assert outs["linear_trend"]["details"]["slope"] == 1.5
    assert outs["yoy_growth"]["details"]["anchor_period"] == "2024-Q3"
    # disclosed_periods_used surfaces anchor_period into a top-level list.
    assert "2024-Q3" in est.methodology["disclosed_periods_used"]
