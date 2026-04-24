"""Shared fixture loader for the Beacon test suite.

``trailblaze`` is available as an installed editable package, so tests
just import ``trailblaze.beacon.*`` directly — no sys.path munging
needed (unlike the standalone sandbox).
"""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from pathlib import Path

from trailblaze.beacon.types import TimeSeries, TimeSeriesPoint

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def load_fixture(name: str) -> TimeSeries:
    """Load ``fixtures/<name>.json`` as a ``TimeSeries``.

    Values arrive as strings to preserve decimal precision; we wrap in
    ``Decimal`` so math downstream doesn't silently drift through float.
    """
    path = FIXTURES / f"{name}.json"
    data = json.loads(path.read_text())
    points = [
        TimeSeriesPoint(
            period_code=p["period_code"],
            period_start_date=date.fromisoformat(p["period_start_date"]),
            period_end_date=date.fromisoformat(p["period_end_date"]),
            value=Decimal(p["value"]) if p["value"] is not None else None,
            disclosure_status=p["disclosure_status"],
        )
        for p in data["points"]
    ]
    return TimeSeries(
        entity_id=data["entity_id"],
        metric_code=data["metric_code"],
        market_id=data.get("market_id"),
        currency=data["currency"],
        unit_type=data["unit_type"],
        points=points,
    )


def make_series(
    quarters_values: list[tuple[str, str | None, str]],
    *,
    entity_id: str = "test-entity",
    metric_code: str = "revenue",
    market_id: str | None = None,
    currency: str = "EUR",
    unit_type: str = "currency",
) -> TimeSeries:
    """Build a TimeSeries from a compact list of ``(period_code, value_or_None, status)``.

    Used by unit tests that want to declare scenarios inline rather than
    round-trip through JSON fixtures.
    """
    from trailblaze.beacon.periods import parse_quarter

    points: list[TimeSeriesPoint] = []
    for code, val, status in quarters_values:
        q = parse_quarter(code)
        points.append(
            TimeSeriesPoint(
                period_code=code,
                period_start_date=q.start_date,
                period_end_date=q.end_date,
                value=Decimal(val) if val is not None else None,
                disclosure_status=status,
            )
        )
    return TimeSeries(
        entity_id=entity_id,
        metric_code=metric_code,
        market_id=market_id,
        currency=currency,
        unit_type=unit_type,
        points=points,
    )
