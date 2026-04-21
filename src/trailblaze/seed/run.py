"""Seed orchestrator. Idempotent — each run upserts by natural key.

Natural keys:
  entity_types.code, sources.source_type (composite-unique via code pattern),
  metrics.code, periods.code, markets.slug, entities.slug.
"""

from __future__ import annotations

import logging

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from trailblaze.db.models import (
    Entity,
    EntityType,
    EntityTypeAssignment,
    Market,
    Metric,
    MetricAlias,
    Period,
    Source,
)
from trailblaze.db.session import session_scope
from trailblaze.seed._data.entities import ENTITIES
from trailblaze.seed._data.entity_types import ENTITY_TYPES
from trailblaze.seed._data.markets import MARKETS
from trailblaze.seed._data.metric_aliases import METRIC_ALIASES
from trailblaze.seed._data.metrics import METRICS
from trailblaze.seed._data.periods import PERIODS
from trailblaze.seed._data.sources import SOURCES

log = logging.getLogger(__name__)


def _upsert(session: Session, model, rows: list[dict], conflict_cols: list[str],
            update_cols: list[str] | None = None) -> int:
    """Bulk upsert with ON CONFLICT DO NOTHING (or DO UPDATE if update_cols given)."""
    if not rows:
        return 0
    stmt = pg_insert(model).values(rows)
    if update_cols:
        stmt = stmt.on_conflict_do_update(
            index_elements=conflict_cols,
            set_={c: stmt.excluded[c] for c in update_cols},
        )
    else:
        stmt = stmt.on_conflict_do_nothing(index_elements=conflict_cols)
    result = session.execute(stmt)
    return result.rowcount or 0


def seed_entity_types(session: Session) -> int:
    return _upsert(session, EntityType, ENTITY_TYPES, ["code"])


def seed_sources(session: Session) -> int:
    # sources has no unique constraint on source_type alone in the schema —
    # we enforce "one row per source_type" by convention via a filtered check.
    existing = {s.source_type for s in session.query(Source.source_type).all()}
    new_rows = [
        {"is_proprietary": False, **r}
        for r in SOURCES
        if r["source_type"] not in existing
    ]
    if not new_rows:
        return 0
    session.execute(pg_insert(Source).values(new_rows))
    return len(new_rows)


def seed_metrics(session: Session) -> int:
    return _upsert(session, Metric, METRICS, ["code"])


def seed_metric_aliases(session: Session) -> int:
    """Maps alias codes to canonical metric_id. Upserts by alias_code."""
    code_to_id = dict(session.query(Metric.code, Metric.id).all())
    rows = []
    for a in METRIC_ALIASES:
        canonical_id = code_to_id.get(a["canonical_code"])
        if canonical_id is None:
            log.warning("Alias %r points at missing canonical %r — skipping",
                        a["alias_code"], a["canonical_code"])
            continue
        rows.append({
            "alias_code": a["alias_code"],
            "canonical_metric_id": canonical_id,
            "notes": a.get("notes"),
        })
    return _upsert(
        session, MetricAlias, rows, ["alias_code"],
        update_cols=["canonical_metric_id", "notes"],
    )


def seed_periods(session: Session) -> int:
    return _upsert(session, Period, PERIODS, ["code"])


def seed_markets(session: Session) -> int:
    """Two-pass: insert rows without parent FK, then set parent_market_id via slug lookup."""
    # Pass 1: upsert base rows (parent_market_id = NULL initially)
    base_rows = [{k: v for k, v in m.items() if k != "parent_slug"} for m in MARKETS]
    inserted = _upsert(session, Market, base_rows, ["slug"])

    # Pass 2: resolve parents
    slug_to_id = dict(session.query(Market.slug, Market.id).all())
    updated = 0
    for m in MARKETS:
        if not m["parent_slug"]:
            continue
        parent_id = slug_to_id.get(m["parent_slug"])
        if parent_id is None:
            log.warning("Market %s: parent slug %r not found", m["slug"], m["parent_slug"])
            continue
        child_id = slug_to_id.get(m["slug"])
        if child_id is None:
            continue
        result = session.execute(
            Market.__table__.update()
            .where(Market.id == child_id)
            .where((Market.parent_market_id.is_(None)) | (Market.parent_market_id != parent_id))
            .values(parent_market_id=parent_id)
        )
        updated += result.rowcount or 0
    log.info("markets: %d inserted, %d parent links set/updated", inserted, updated)
    return inserted


def seed_entities(session: Session) -> int:
    """Two-pass: upsert rows, then resolve parent_entity_id and primary entity-type."""
    # Build map of entity_type.code -> id (needed for primary_type)
    type_map = dict(session.query(EntityType.code, EntityType.id).all())

    # Pass 1: insert entities without parent_entity_id
    base_rows = []
    for e in ENTITIES:
        row = {k: v for k, v in e.items() if k not in ("parent_slug", "primary_type")}
        base_rows.append(row)
    inserted = _upsert(session, Entity, base_rows, ["slug"])

    slug_to_id = dict(session.query(Entity.slug, Entity.id).all())

    # Pass 2a: set parent_entity_id
    parent_updates = 0
    for e in ENTITIES:
        if not e.get("parent_slug"):
            continue
        parent_id = slug_to_id.get(e["parent_slug"])
        if parent_id is None:
            log.warning("Entity %s: parent slug %r not found", e["slug"], e["parent_slug"])
            continue
        child_id = slug_to_id.get(e["slug"])
        if child_id is None:
            continue
        result = session.execute(
            Entity.__table__.update()
            .where(Entity.id == child_id)
            .where((Entity.parent_entity_id.is_(None)) | (Entity.parent_entity_id != parent_id))
            .values(parent_entity_id=parent_id)
        )
        parent_updates += result.rowcount or 0

    # Pass 2b: set primary entity-type assignment
    assignment_rows = []
    for e in ENTITIES:
        type_code = e.get("primary_type")
        if not type_code:
            continue
        type_id = type_map.get(type_code)
        entity_id = slug_to_id.get(e["slug"])
        if type_id is None or entity_id is None:
            if type_id is None:
                log.warning("Entity %s: unknown entity_type code %r", e["slug"], type_code)
            continue
        assignment_rows.append({
            "entity_id": entity_id,
            "entity_type_id": type_id,
            "is_primary": True,
        })
    if assignment_rows:
        _upsert(
            session, EntityTypeAssignment, assignment_rows,
            ["entity_id", "entity_type_id"],
        )

    log.info(
        "entities: %d inserted, %d parent links set, %d primary-type assignments",
        inserted, parent_updates, len(assignment_rows),
    )
    return inserted


def run_all() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    with session_scope() as session:
        counts = {
            "entity_types": seed_entity_types(session),
            "sources": seed_sources(session),
            "metrics": seed_metrics(session),
            "metric_aliases": seed_metric_aliases(session),
            "periods": seed_periods(session),
            "markets": seed_markets(session),
            "entities": seed_entities(session),
        }
    for k, v in counts.items():
        log.info("seed: %s inserted=%d", k, v)


if __name__ == "__main__":
    run_all()
