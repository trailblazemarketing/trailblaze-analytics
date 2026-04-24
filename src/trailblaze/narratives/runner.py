"""`trailblaze-extract-narratives` — batch-extract narratives for canonical metric_values.

Drives off ``metric_value_canonical`` so each target tuple resolves to the
exact source report whose value the UI will display. Idempotent — rows
already in ``metric_narratives`` with matching parser_version are skipped;
pass ``--force`` to re-extract regardless. Stale rows (flagged after a
reprocess, not yet plumbed into the reprocess flow) can be swept with
``--stale``.
"""

from __future__ import annotations

import logging
import sys
import time
import uuid
from dataclasses import dataclass
from decimal import Decimal

import click
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from trailblaze.db.models import Metric
from trailblaze.db.session import session_scope
from trailblaze.narratives.extractor import (
    DEFAULT_MODEL,
    NarrativeExtraction,
    extract_narrative_for_metric,
)

log = logging.getLogger("trailblaze.narratives.runner")


# Default metric set per brief.
DEFAULT_METRICS = (
    "revenue",
    "ngr",
    "ebitda",
    "sportsbook_revenue",
    "casino_revenue",
)

# Halt thresholds.
_HALT_VERIFY_FAILURE_PCT = 0.05   # >5% non-verifying → scope / prompt issue
_HALT_COST_USD = 50.0              # per brief
_HALT_API_ERRORS_IN_ROW = 15       # sustained overload

# Haiku 4.5 approx USD cost (as of 2026-04 pricing). Used for cost estimate;
# overestimated slightly so we HALT early rather than late.
_HAIKU_INPUT_USD_PER_MTOK = 1.00
_HAIKU_OUTPUT_USD_PER_MTOK = 5.00


@dataclass
class Target:
    metric_value_id: uuid.UUID
    entity_id: uuid.UUID
    entity_name: str
    metric_id: uuid.UUID
    metric_code: str
    period_id: uuid.UUID
    period_label: str
    market_id: uuid.UUID | None
    market_name: str | None
    source_report_id: uuid.UUID
    source_parser_version: str | None
    value_numeric: Decimal
    unit_multiplier: str | None
    currency: str | None
    raw_text: str


def _resolve_targets(
    session: Session,
    *,
    metric_codes: tuple[str, ...],
    top_n: int | None,
    report_id: uuid.UUID | None,
    entity_slug: str | None,
    stale_only: bool,
) -> list[Target]:
    # Filter clauses assembled incrementally so each option composes.
    wheres = ["m.code = ANY(:codes)", "mvc.value_numeric IS NOT NULL",
              "r.raw_text IS NOT NULL", "length(r.raw_text) > 200"]
    params: dict[str, object] = {"codes": list(metric_codes)}

    if report_id is not None:
        wheres.append("mvc.report_id = :rid")
        params["rid"] = report_id
    if entity_slug is not None:
        wheres.append("e.slug = :eslug")
        params["eslug"] = entity_slug

    top_filter = ""
    if top_n is not None and entity_slug is None and report_id is None:
        # "Top N entities by metric volume across the selected metrics."
        top_filter = """
            AND e.id IN (
              SELECT mvc2.entity_id
              FROM metric_value_canonical mvc2
              JOIN metrics m2 ON m2.id = mvc2.metric_id
              WHERE m2.code = ANY(:codes)
                AND mvc2.entity_id IS NOT NULL
                AND mvc2.value_numeric IS NOT NULL
              GROUP BY mvc2.entity_id
              ORDER BY COUNT(*) DESC
              LIMIT :topn
            )
        """
        params["topn"] = top_n

    rows = session.execute(
        text(f"""
        SELECT mvc.metric_value_id, mvc.entity_id, e.name AS entity_name,
               mvc.metric_id, m.code AS metric_code,
               mvc.period_id,
               COALESCE(p.display_name, p.code) AS period_label,
               mvc.market_id, mk.name AS market_name,
               mvc.report_id AS source_report_id,
               r.parser_version,
               mvc.value_numeric, mvc.unit_multiplier, mvc.currency,
               r.raw_text
        FROM metric_value_canonical mvc
        JOIN entities e ON e.id = mvc.entity_id
        JOIN metrics  m ON m.id = mvc.metric_id
        JOIN periods  p ON p.id = mvc.period_id
        LEFT JOIN markets mk ON mk.id = mvc.market_id
        JOIN reports  r ON r.id = mvc.report_id
        WHERE {" AND ".join(wheres)} {top_filter}
        ORDER BY e.name, m.code, p.start_date DESC
        """),
        params,
    ).all()

    targets: list[Target] = []
    for row in rows:
        targets.append(Target(
            metric_value_id=row.metric_value_id,
            entity_id=row.entity_id,
            entity_name=row.entity_name,
            metric_id=row.metric_id,
            metric_code=row.metric_code,
            period_id=row.period_id,
            period_label=row.period_label,
            market_id=row.market_id,
            market_name=row.market_name,
            source_report_id=row.source_report_id,
            source_parser_version=row.parser_version,
            value_numeric=row.value_numeric,
            unit_multiplier=row.unit_multiplier,
            currency=row.currency,
            raw_text=row.raw_text,
        ))

    if stale_only:
        # Restrict to targets whose existing narrative is marked stale.
        ids = {t.metric_value_id for t in targets}
        if not ids:
            return []
        rows = session.execute(
            text(
                "SELECT entity_id, metric_id, period_id, "
                "       COALESCE(market_id, '00000000-0000-0000-0000-000000000000'::uuid) AS m "
                "FROM metric_narratives WHERE is_stale = true"
            )
        ).all()
        stale_tuples = {(r.entity_id, r.metric_id, r.period_id, r.m) for r in rows}
        sentinel = uuid.UUID("00000000-0000-0000-0000-000000000000")
        targets = [
            t for t in targets
            if (t.entity_id, t.metric_id, t.period_id, t.market_id or sentinel) in stale_tuples
        ]

    return targets


def _already_extracted(
    session: Session, t: Target, *, force: bool,
) -> bool:
    if force:
        return False
    # Normalise the market_id on both sides to text with a sentinel for
    # NULL — psycopg's parameter-cast syntax trips if we try to cast a
    # Python None via ``:mk::text`` inline.
    sentinel = "00000000-0000-0000-0000-000000000000"
    mk_text = str(t.market_id) if t.market_id is not None else sentinel
    row = session.execute(
        text(
            "SELECT 1 FROM metric_narratives "
            "WHERE entity_id = :e AND metric_id = :m AND period_id = :p "
            "AND COALESCE(market_id::text, :sentinel) = :mk_text "
            "AND source_report_id = :r AND is_stale = false "
            "LIMIT 1"
        ),
        {
            "e": t.entity_id, "m": t.metric_id, "p": t.period_id,
            "mk_text": mk_text, "r": t.source_report_id,
            "sentinel": sentinel,
        },
    ).first()
    return row is not None


def _upsert_narrative(
    session: Session,
    t: Target,
    extraction: NarrativeExtraction,
) -> None:
    session.execute(
        text("""
        INSERT INTO metric_narratives (
          entity_id, metric_id, period_id, market_id, source_report_id,
          narrative_text, verified_number_match, extraction_model,
          source_report_parser_version, is_stale
        ) VALUES (
          :e, :m, :p, :mk, :r, :n, :v, :model, :pv, false
        )
        ON CONFLICT (
          entity_id, metric_id, period_id,
          coalesce(market_id, '00000000-0000-0000-0000-000000000000'::uuid),
          source_report_id
        ) DO UPDATE SET
          narrative_text = EXCLUDED.narrative_text,
          verified_number_match = EXCLUDED.verified_number_match,
          extraction_model = EXCLUDED.extraction_model,
          extraction_timestamp = now(),
          source_report_parser_version = EXCLUDED.source_report_parser_version,
          is_stale = false
        """),
        {
            "e": t.entity_id, "m": t.metric_id, "p": t.period_id,
            "mk": t.market_id, "r": t.source_report_id,
            "n": extraction.narrative_text,
            "v": extraction.verified_number_match,
            "model": extraction.extraction_model,
            "pv": t.source_parser_version,
        },
    )


def _estimated_cost_usd(targets_remaining: int) -> float:
    # Rough: ~18k input + ~300 output tokens per narrative call at Haiku prices.
    per_call_in = 18_000
    per_call_out = 300
    in_cost = targets_remaining * per_call_in / 1_000_000 * _HAIKU_INPUT_USD_PER_MTOK
    out_cost = targets_remaining * per_call_out / 1_000_000 * _HAIKU_OUTPUT_USD_PER_MTOK
    return in_cost + out_cost


@click.command()
@click.option("--top-n", type=int, default=None,
              help="Target top N entities by canonical metric_value volume.")
@click.option("--metrics", default=",".join(DEFAULT_METRICS),
              help="Comma-separated metric codes to scope (default: revenue,ngr,ebitda,sportsbook_revenue,casino_revenue).")
@click.option("--report-id", type=str, default=None,
              help="Extract narratives only for canonical rows sourced from this report.")
@click.option("--entity", "entity_slug", default=None,
              help="Extract narratives only for this entity slug.")
@click.option("--stale", "stale_only", is_flag=True,
              help="Re-extract only narratives flagged is_stale=true.")
@click.option("--force", is_flag=True,
              help="Re-extract even when a narrative already exists for the tuple.")
@click.option("--dry-run", is_flag=True, help="Print scope counts; no LLM calls.")
@click.option("--model", default=DEFAULT_MODEL, show_default=True)
@click.option("-v", "--verbose", is_flag=True)
def main(
    top_n: int | None,
    metrics: str,
    report_id: str | None,
    entity_slug: str | None,
    stale_only: bool,
    force: bool,
    dry_run: bool,
    model: str,
    verbose: bool,
) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    codes = tuple(c.strip() for c in metrics.split(",") if c.strip())
    rid_uuid = uuid.UUID(report_id) if report_id else None

    with session_scope() as s:
        # Validate metric codes against the dictionary early.
        known = set(s.execute(text("SELECT code FROM metrics")).scalars().all())
        unknown = [c for c in codes if c not in known]
        if unknown:
            click.echo(f"Unknown metric codes: {unknown}. "
                       f"Available: {sorted(known)}", err=True)
            sys.exit(2)

        targets = _resolve_targets(
            s,
            metric_codes=codes,
            top_n=top_n,
            report_id=rid_uuid,
            entity_slug=entity_slug,
            stale_only=stale_only,
        )

    if not targets:
        click.echo("No targets matched the scope.")
        return

    # Idempotency filter
    if not force:
        with session_scope() as s:
            targets = [t for t in targets if not _already_extracted(s, t, force=force)]

    total_scope = len(targets)
    est_cost = _estimated_cost_usd(total_scope)

    click.echo(f"Scope: {total_scope} narratives to extract "
               f"(metrics={codes}, top_n={top_n}, entity={entity_slug}, "
               f"report_id={rid_uuid}, stale_only={stale_only}).")
    click.echo(f"Estimated cost (Haiku): ~${est_cost:.2f}")

    if total_scope > 2000:
        click.echo(f"HALT: scope {total_scope} > 2000. Narrow and retry.", err=True)
        sys.exit(3)
    if est_cost > _HALT_COST_USD:
        click.echo(f"HALT: estimated cost ${est_cost:.2f} > ${_HALT_COST_USD:.2f}.",
                   err=True)
        sys.exit(3)
    if dry_run:
        click.echo("(dry-run)")
        return

    # Real extraction loop.
    succeeded = 0
    verified_failed = 0
    api_errors_in_row = 0
    started = time.time()

    for i, t in enumerate(targets, start=1):
        try:
            extraction = extract_narrative_for_metric(
                report_raw_text=t.raw_text,
                metric_code=t.metric_code,
                metric_value=t.value_numeric,
                unit_multiplier=t.unit_multiplier,
                currency=t.currency,
                entity_name=t.entity_name,
                period_label=t.period_label,
                market_name=t.market_name,
                model=model,
            )
            api_errors_in_row = 0
        except Exception as exc:  # noqa: BLE001
            api_errors_in_row += 1
            log.warning("[%d/%d] %s %s %s — API error: %s",
                        i, total_scope, t.entity_name, t.metric_code,
                        t.period_label, exc)
            if api_errors_in_row >= _HALT_API_ERRORS_IN_ROW:
                click.echo(f"HALT: {api_errors_in_row} API errors in a row.",
                           err=True)
                sys.exit(4)
            time.sleep(2)
            continue

        if extraction is None:
            verified_failed += 1
            log.info("[%d/%d] %s %s %s — no match / verify fail",
                     i, total_scope, t.entity_name, t.metric_code, t.period_label)
        else:
            with session_scope() as s:
                _upsert_narrative(s, t, extraction)
            succeeded += 1
            log.info("[%d/%d] %s %s %s — OK (%d chars)",
                     i, total_scope, t.entity_name, t.metric_code,
                     t.period_label, len(extraction.narrative_text))

        # Halt if verification failure rate exceeds the threshold AFTER a
        # warm-up of 25 calls (small-sample volatility guard).
        processed = succeeded + verified_failed
        if processed >= 25:
            fail_rate = verified_failed / processed
            if fail_rate > _HALT_VERIFY_FAILURE_PCT:
                click.echo(
                    f"HALT: verification failure rate {fail_rate:.1%} "
                    f"> {_HALT_VERIFY_FAILURE_PCT:.0%} over {processed} calls.",
                    err=True,
                )
                sys.exit(5)

    elapsed_min = (time.time() - started) / 60
    click.echo("")
    click.echo("Narrative extraction summary")
    click.echo(f"  scope:             {total_scope}")
    click.echo(f"  stored:            {succeeded}")
    click.echo(f"  no-match / verify: {verified_failed}")
    click.echo(f"  elapsed:           {elapsed_min:.1f} min")


if __name__ == "__main__":
    main()
