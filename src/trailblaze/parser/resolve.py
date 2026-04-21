"""Name-to-UUID resolution for parser outputs.

The LLM returns names as written in the source document; this module maps them
onto our canonical entities/markets/metrics/periods by slug, exact name, or
alias match.

Unknown *entities* can be auto-created with ``extra_metadata.status =
'auto_added_needs_review'`` — the catalog is curated asynchronously so we don't
drop otherwise-valid metric rows. Markets / metrics / periods are NOT
auto-created (they carry semantic structure the parser can't fabricate).
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass, field
from typing import TypeVar

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from trailblaze.db.models import Entity, Market, Metric, MetricAlias, Period

T = TypeVar("T")


def _norm(s: str) -> str:
    """Lowercase, strip diacritics and non-alphanumerics. Used for fuzzy matches."""
    s = unicodedata.normalize("NFKD", s)
    s = s.encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "", s.lower())
    return s


def _slugify(s: str) -> str:
    """Produce a URL-safe slug (lowercase, alnum + hyphens, no leading/trailing)."""
    s = unicodedata.normalize("NFKD", s)
    s = s.encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s.lower()).strip("-")
    return s or "unknown"


@dataclass
class Resolver:
    """Built once per ingest, reused for every lookup in that run."""

    session: Session
    entity_by_norm: dict[str, uuid.UUID]
    market_by_norm: dict[str, uuid.UUID]
    metric_by_code: dict[str, uuid.UUID]
    period_by_code: dict[str, uuid.UUID]
    auto_added_entities: set[uuid.UUID] = field(default_factory=set)

    @classmethod
    def build(cls, session: Session) -> "Resolver":
        entities: dict[str, uuid.UUID] = {}
        for row in session.execute(select(Entity.id, Entity.name, Entity.slug, Entity.aliases)):
            id_, name, slug, aliases = row
            for key in (name, slug, *(aliases or [])):
                if key:
                    entities[_norm(key)] = id_

        markets: dict[str, uuid.UUID] = {}
        for row in session.execute(
            select(Market.id, Market.name, Market.slug, Market.aliases,
                   Market.iso_country, Market.iso_subdivision)
        ):
            id_, name, slug, aliases, iso_c, iso_s = row
            for key in (name, slug, iso_c, iso_s, *(aliases or [])):
                if key:
                    markets[_norm(key)] = id_

        metrics = {
            code: id_
            for code, id_ in session.execute(select(Metric.code, Metric.id))
        }
        # Fold metric_aliases into the same lookup dict — aliased codes map
        # to the canonical metric_id directly. Canonical codes take precedence
        # if there's a collision (shouldn't happen if the seed is well-formed).
        for alias_code, canonical_id in session.execute(
            select(MetricAlias.alias_code, MetricAlias.canonical_metric_id)
        ):
            metrics.setdefault(alias_code, canonical_id)
        periods = {
            code: id_
            for code, id_ in session.execute(select(Period.code, Period.id))
        }
        return cls(
            session=session,
            entity_by_norm=entities,
            market_by_norm=markets,
            metric_by_code=metrics,
            period_by_code=periods,
        )

    # ---- lookups -----------------------------------------------------------

    def entity(self, name: str | None, *, auto_create: bool = False) -> uuid.UUID | None:
        if not name:
            return None
        key = _norm(name)
        existing = self.entity_by_norm.get(key)
        if existing is not None:
            return existing
        if auto_create:
            new_id = self._auto_create_entity(name)
            self.entity_by_norm[key] = new_id
            self.auto_added_entities.add(new_id)
            return new_id
        return None

    def market(self, name: str | None) -> uuid.UUID | None:
        if not name:
            return None
        return self.market_by_norm.get(_norm(name))

    def metric(self, code: str | None) -> uuid.UUID | None:
        if not code:
            return None
        return self.metric_by_code.get(code)

    def period(self, code: str | None) -> uuid.UUID | None:
        if not code:
            return None
        return self.period_by_code.get(code)

    # ---- auto-create -------------------------------------------------------

    def _auto_create_entity(self, name: str) -> uuid.UUID:
        """Race-safe: uses ON CONFLICT DO NOTHING + fallback SELECT so parallel
        workers auto-creating the same entity converge on the same row."""
        base = _slugify(name)
        for attempt in range(10):
            slug = base if attempt == 0 else f"{base}-{attempt + 1}"
            stmt = (
                pg_insert(Entity)
                .values(
                    name=name,
                    slug=slug,
                    extra_metadata={"status": "auto_added_needs_review"},
                )
                .on_conflict_do_nothing(index_elements=["slug"])
                .returning(Entity.id)
            )
            inserted = self.session.execute(stmt).first()
            if inserted is not None:
                return inserted[0]
            # Slug was taken — if the existing row has the same normalised name,
            # reuse it. Otherwise try the next numeric suffix.
            existing = self.session.execute(
                select(Entity.id, Entity.name).where(Entity.slug == slug)
            ).first()
            if existing and _norm(existing[1]) == _norm(name):
                return existing[0]
        raise RuntimeError(f"Could not auto-create entity {name!r} after 10 attempts")
