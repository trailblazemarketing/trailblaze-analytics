"""Name-to-UUID resolution for parser outputs.

The LLM returns names as written in the source document; this module maps them
onto our canonical entities/markets/metrics/periods by slug, exact name, or
alias match. Unresolvable names are returned alongside the resolved pairs so
the pipeline can record them as parse warnings.
"""

from __future__ import annotations

import re
import unicodedata
import uuid
from dataclasses import dataclass
from typing import TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from trailblaze.db.models import Entity, Market, Metric, Period

T = TypeVar("T")


def _norm(s: str) -> str:
    """Lowercase, strip diacritics and non-alphanumerics. Used for fuzzy matches."""
    s = unicodedata.normalize("NFKD", s)
    s = s.encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9]+", "", s.lower())
    return s


@dataclass
class Resolver:
    """Built once per ingest, reused for every lookup in that run."""

    entity_by_norm: dict[str, uuid.UUID]
    market_by_norm: dict[str, uuid.UUID]
    metric_by_code: dict[str, uuid.UUID]
    period_by_code: dict[str, uuid.UUID]

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
        periods = {
            code: id_
            for code, id_ in session.execute(select(Period.code, Period.id))
        }
        return cls(entities, markets, metrics, periods)

    # ---- lookups -----------------------------------------------------------

    def entity(self, name: str | None) -> uuid.UUID | None:
        if not name:
            return None
        return self.entity_by_norm.get(_norm(name))

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
