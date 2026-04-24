"""Beacon(tm) compute runner — Trailblaze-main integration.

Loads time series from ``metric_value_canonical``, runs the engine,
persists each estimate as a ``metric_values`` row (disclosure_status
``beacon_estimate``) plus a sibling ``beacon_estimates`` row with the
methodology JSONB.

Design:
* Read from the canonical matview (deduped) so the engine sees one row
  per (entity, metric, market, period) regardless of how noisy the
  raw ``metric_values`` is.
* Write to ``metric_values`` + ``beacon_estimates``. The matview will
  re-rank on next refresh; existing disclosed rows outrank beacon rows
  by precedence tier (migration 0006).
* Idempotent: a ``metric_values`` row with ``disclosure_status='beacon_estimate'``
  for the same (entity, metric, market, period) means skip. Re-runs do
  not produce duplicates. Manual cleanup needed if methodology changes
  and the user wants a re-emit.

Scope is top-N entities × chosen metrics × ``market_id IS NULL``
(group-level only). Regional Beacon is a scope expansion later.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import asdict
from datetime import date
from decimal import Decimal
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.orm import Session

from trailblaze.beacon import BeaconEstimate, estimate_series
from trailblaze.beacon.periods import parse_quarter
from trailblaze.beacon.types import TimeSeries, TimeSeriesPoint
from trailblaze.db.session import session_scope

log = logging.getLogger("beacon.runner")

# Methodology-code mapping. The ``beacon_estimates.methodology_code`` CHECK
# constraint enumerates a fixed set of values; the ensemble engine maps to
# ``composite_model``. Single-method estimates (when only one method fires)
# could later use ``linear_interpolation`` / ``prior_period_extrapolation``
# but for v1 we use ``composite_model`` uniformly since all ensemble paths
# produce a composite — even a one-method output still passes through
# combine() with an agreement factor. Future: branch on methods_used.
_METHODOLOGY_CODE = "composite_model"
_MODEL_VERSION = "beacon-v1.0"


# Multiplier → scalar factor, mirroring src/trailblaze/parser/...
_MULT_SCALE: dict[str, Decimal] = {
    "units": Decimal("1"),
    "thousands": Decimal("1000"),
    "millions": Decimal("1000000"),
    "billions": Decimal("1000000000"),
}


def _scale(value: Optional[Decimal], mult: Optional[str]) -> Optional[Decimal]:
    """Apply the stored ``unit_multiplier`` to the raw ``value_numeric``."""
    if value is None:
        return None
    return value * _MULT_SCALE.get(mult or "units", Decimal("1"))


def _get_beacon_source_id(session: Session) -> str:
    """Resolve the seeded ``sources`` row with ``source_type='beacon_estimate'``.

    The schema allows multiple rows of that type — we pick the oldest one
    (seed) to keep writes consistent.
    """
    row = session.execute(
        sa.text(
            "SELECT id FROM sources WHERE source_type = 'beacon_estimate' "
            "ORDER BY name LIMIT 1"
        )
    ).first()
    if row is None:
        raise RuntimeError(
            "No sources row with source_type='beacon_estimate'. Seed one first."
        )
    return str(row[0])


def _top_n_entities(session: Session, n: int) -> list[tuple[str, str]]:
    """Return ``[(entity_id, slug), ...]`` ranked by group-level metric row
    count — proxy for "entity most worth Beacon-filling".

    Filters out ``auto_added_needs_review`` entities — we don't Beacon
    rows that haven't been curated yet.
    """
    rows = session.execute(
        sa.text(
            """
            SELECT e.id::text AS id, e.slug
            FROM entities e
            JOIN metric_values mv ON mv.entity_id = e.id AND mv.market_id IS NULL
            WHERE e.is_active = true
              AND COALESCE(e.metadata->>'status', '') != 'auto_added_needs_review'
            GROUP BY e.id, e.slug
            ORDER BY COUNT(*) DESC
            LIMIT :n
            """
        ),
        {"n": n},
    ).all()
    return [(r.id, r.slug) for r in rows]


def _load_series(
    session: Session,
    entity_id: str,
    metric_code: str,
) -> Optional[TimeSeries]:
    """Load group-level canonical series for (entity, metric). ``None`` if
    the metric doesn't exist, isn't currency/count, or has no points."""
    meta = session.execute(
        sa.text(
            "SELECT id::text AS id, unit_type FROM metrics WHERE code = :c"
        ),
        {"c": metric_code},
    ).first()
    if meta is None:
        return None
    if meta.unit_type not in ("currency", "count"):
        return None

    rows = session.execute(
        sa.text(
            """
            SELECT p.code AS period_code,
                   p.start_date AS period_start_date,
                   p.end_date AS period_end_date,
                   mvc.value_numeric,
                   mvc.unit_multiplier,
                   mvc.currency,
                   mvc.disclosure_status
            FROM metric_value_canonical mvc
            JOIN periods p ON p.id = mvc.period_id
            WHERE mvc.entity_id = :eid
              AND mvc.market_id IS NULL
              AND mvc.metric_id = :mid
              AND p.period_type = 'quarter'
            ORDER BY p.start_date ASC
            """
        ),
        {"eid": entity_id, "mid": meta.id},
    ).all()
    if not rows:
        return None

    # Collapse to a dominant currency — pick the currency that appears most
    # often among disclosed rows. All disclosed points in our Beacon-v1
    # ensemble must be comparable; if currencies mix within a single
    # entity's group-level series, skip the entity for now (regional/multi-
    # currency roll-ups are future work).
    disclosed_ccys = [r.currency for r in rows if r.disclosure_status == "disclosed" and r.currency]
    if not disclosed_ccys:
        return None
    currency = max(set(disclosed_ccys), key=disclosed_ccys.count)
    if any(
        r.disclosure_status == "disclosed" and r.currency and r.currency != currency
        for r in rows
    ):
        log.debug("skipping %s/%s — mixed currencies in disclosed rows", entity_id, metric_code)
        return None

    points: list[TimeSeriesPoint] = []
    for r in rows:
        scaled = _scale(r.value_numeric, r.unit_multiplier)
        points.append(
            TimeSeriesPoint(
                period_code=r.period_code,
                period_start_date=r.period_start_date,
                period_end_date=r.period_end_date,
                value=scaled,
                disclosure_status=r.disclosure_status,
            )
        )

    return TimeSeries(
        entity_id=entity_id,
        metric_code=metric_code,
        market_id=None,
        currency=currency,
        unit_type=meta.unit_type,
        points=points,
    )


def _already_estimated(
    session: Session,
    entity_id: str,
    metric_id: str,
    period_id: str,
) -> bool:
    row = session.execute(
        sa.text(
            """
            SELECT 1 FROM metric_values
            WHERE entity_id = :eid AND metric_id = :mid AND period_id = :pid
              AND market_id IS NULL
              AND disclosure_status = 'beacon_estimate'
            LIMIT 1
            """
        ),
        {"eid": entity_id, "mid": metric_id, "pid": period_id},
    ).first()
    return row is not None


def _persist(
    session: Session,
    estimate: BeaconEstimate,
    *,
    beacon_source_id: str,
    unit_type: str,
) -> bool:
    """Write one BeaconEstimate. Returns True on write, False if skipped
    (already exists)."""
    meta = session.execute(
        sa.text("SELECT id::text AS id FROM metrics WHERE code = :c"),
        {"c": estimate.metric_code},
    ).first()
    if meta is None:
        log.warning("unknown metric_code %s — skipping", estimate.metric_code)
        return False

    # Engine outputs period_code in sandbox's ISO form (``2025-Q4``). The
    # Trailblaze DB stores the inverse form (``Q4-25``). Look up both.
    q = parse_quarter(estimate.period_code)
    db_code = f"Q{q.quarter}-{q.year % 100:02d}"
    period = session.execute(
        sa.text("SELECT id::text AS id FROM periods WHERE code IN (:iso, :db)"),
        {"iso": estimate.period_code, "db": db_code},
    ).first()
    if period is None:
        log.warning("unknown period_code %s — skipping", estimate.period_code)
        return False

    if _already_estimated(session, estimate.entity_id, meta.id, period.id):
        return False

    # Insert parent metric_values row. Value is stored at unit_multiplier
    # 'units' (already scaled). Currency preserved from the source series.
    mv_id = session.execute(
        sa.text(
            """
            INSERT INTO metric_values (
              entity_id, market_id, metric_id, period_id, source_id,
              value_numeric, currency, unit_multiplier, disclosure_status,
              confidence_score, is_canonical
            ) VALUES (
              :eid, :market_id, :mid, :pid, :src,
              :val, :ccy, 'units', 'beacon_estimate',
              :conf, false
            )
            RETURNING id::text
            """
        ),
        {
            "eid": estimate.entity_id,
            "market_id": estimate.market_id,  # None for group-level
            "mid": meta.id,
            "pid": period.id,
            "src": beacon_source_id,
            "val": estimate.value,
            "ccy": estimate.currency,
            "conf": Decimal(str(round(estimate.confidence, 6))),
        },
    ).scalar_one()

    # Sibling beacon_estimates row. Methodology_code is 'composite_model';
    # the full methodology dict goes into the JSONB 'inputs' field per the
    # existing table design.
    session.execute(
        sa.text(
            """
            INSERT INTO beacon_estimates (
              metric_value_id, methodology_code, model_version,
              inputs, confidence_score, methodology_notes
            ) VALUES (
              :mv, :code, :ver, CAST(:inputs AS JSONB), :conf, :notes
            )
            """
        ),
        {
            "mv": mv_id,
            "code": _METHODOLOGY_CODE,
            "ver": _MODEL_VERSION,
            "inputs": json.dumps(estimate.methodology, default=str),
            "conf": Decimal(str(round(estimate.confidence, 6))),
            "notes": (
                f"Ensemble of {len(estimate.methodology.get('methods_used', []))} method(s); "
                f"tier={estimate.methodology.get('final_confidence_tier', 'unknown')}"
            ),
        },
    )
    return True


def compute(
    *,
    top_n: int,
    metric_codes: list[str],
    dry_run: bool = False,
) -> dict:
    """Top-level compute. Returns summary dict."""
    summary = {
        "entities_scanned": 0,
        "series_scanned": 0,
        "series_skipped_no_data": 0,
        "series_skipped_unsupported": 0,
        "estimates_generated": 0,
        "estimates_written": 0,
        "estimates_skipped_existing": 0,
        "per_metric": {c: {"generated": 0, "written": 0} for c in metric_codes},
    }

    with session_scope() as session:
        beacon_source_id = _get_beacon_source_id(session)
        entities = _top_n_entities(session, top_n)
        summary["entities_scanned"] = len(entities)
        log.info("top-%d entities: %s", top_n, ", ".join(s for _, s in entities))

        for entity_id, slug in entities:
            for metric_code in metric_codes:
                summary["series_scanned"] += 1
                series = _load_series(session, entity_id, metric_code)
                if series is None:
                    summary["series_skipped_unsupported"] += 1
                    continue
                if not series.points:
                    summary["series_skipped_no_data"] += 1
                    continue
                estimates = estimate_series(series)
                if not estimates:
                    continue
                summary["estimates_generated"] += len(estimates)
                summary["per_metric"][metric_code]["generated"] += len(estimates)

                if dry_run:
                    continue

                for est in estimates:
                    # Determine metric unit_type for reference (not written
                    # but useful if we later split the table schema).
                    unit_type = series.unit_type
                    wrote = _persist(
                        session, est, beacon_source_id=beacon_source_id, unit_type=unit_type
                    )
                    if wrote:
                        summary["estimates_written"] += 1
                        summary["per_metric"][metric_code]["written"] += 1
                        log.info(
                            "  wrote %s %s %s = %s %s (conf=%.3f, tier=%s)",
                            slug,
                            metric_code,
                            est.period_code,
                            est.value,
                            est.currency,
                            est.confidence,
                            est.methodology.get("final_confidence_tier", "-"),
                        )
                    else:
                        summary["estimates_skipped_existing"] += 1

    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Compute Beacon(tm) gap-fill estimates for top-N entities."
    )
    parser.add_argument("--top-n", type=int, default=30)
    parser.add_argument(
        "--metrics",
        type=str,
        default="revenue,ngr,ebitda",
        help="Comma-separated metric codes",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Compute + count; do not write to DB",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    codes = [c.strip() for c in args.metrics.split(",") if c.strip()]
    summary = compute(top_n=args.top_n, metric_codes=codes, dry_run=args.dry_run)

    print("")
    print("Beacon compute summary")
    for k, v in summary.items():
        if k == "per_metric":
            continue
        print(f"  {k:<30s} {v}")
    print("  per_metric:")
    for code, d in summary["per_metric"].items():
        print(f"    {code:<20s} generated={d['generated']:>4d}  written={d['written']:>4d}")
    if args.dry_run:
        print("")
        print("(dry-run: no rows written)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
