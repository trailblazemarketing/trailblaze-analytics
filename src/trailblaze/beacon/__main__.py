"""Demo runner: ``python -m beacon fixtures/betsson_revenue.json``.

Loads the named fixture, runs the engine, prints every produced
BeaconEstimate as pretty JSON. Used by the README quick-start and by
the ship-gate verification.
"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict
from datetime import date
from decimal import Decimal
from pathlib import Path

from beacon import estimate_series
from trailblaze.beacon.types import TimeSeries, TimeSeriesPoint


def _load(path: Path) -> TimeSeries:
    data = json.loads(path.read_text())
    return TimeSeries(
        entity_id=data["entity_id"],
        metric_code=data["metric_code"],
        market_id=data.get("market_id"),
        currency=data["currency"],
        unit_type=data["unit_type"],
        points=[
            TimeSeriesPoint(
                period_code=p["period_code"],
                period_start_date=date.fromisoformat(p["period_start_date"]),
                period_end_date=date.fromisoformat(p["period_end_date"]),
                value=Decimal(p["value"]) if p["value"] is not None else None,
                disclosure_status=p["disclosure_status"],
            )
            for p in data["points"]
        ],
    )


def _default(o):  # JSON fallback for Decimal
    if isinstance(o, Decimal):
        return float(o)
    raise TypeError(f"cannot serialise {type(o).__name__}")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: python -m beacon <path/to/fixture.json>", file=sys.stderr)
        return 2
    series = _load(Path(argv[1]))
    estimates = estimate_series(series)
    if not estimates:
        print("[]")
        return 0
    payload = [asdict(e) for e in estimates]
    print(json.dumps(payload, indent=2, default=_default))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
