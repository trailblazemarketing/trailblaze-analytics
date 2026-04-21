"""Resolve regulator-reported operator names → entity_id.

Regulators use inconsistent naming — same operator appears as "FanDuel",
"FanDuel Sportsbook", "Betfair Interactive US LLC", "FanDuel Group Inc." across
different jurisdictions and document revisions. This module provides a two-tier
resolver:

1. **Exact / alias match** against ``entities.name`` + ``entities.aliases`` +
   any ``extra_metadata.regulator_aliases[market_slug]`` list the user has
   curated.
2. **Auto-create fallback** — if no match, insert a new entity with
   ``extra_metadata = {"status": "auto_added_needs_review", "first_seen_as":
   reported_name, "first_seen_market": market_slug}`` and flag it for manual
   review. The alias table grows as aliases are added during curation; no new
   DB schema required.

The resolver is scoped per-(session, market) — build one, use it for the whole
scrape, then read ``unresolved_log`` to see what needs curation.
"""

from __future__ import annotations

import logging
import re
import unicodedata
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from trailblaze.db.models import Entity, Market

log = logging.getLogger(__name__)


def _norm(s: str) -> str:
    """Aggressive normalise: strip diacritics, punctuation, corporate suffixes."""
    s = unicodedata.normalize("NFKD", s)
    s = s.encode("ascii", "ignore").decode()
    s = s.lower().strip()
    # Drop common corporate/legal suffixes that regulators bolt on.
    for suffix in (
        r"\bllc\b", r"\binc\b", r"\bltd\b", r"\bplc\b", r"\bgroup\b",
        r"\bcorp\b", r"\bcorporation\b", r"\bholdings?\b", r"\binternational\b",
        r"\bcompany\b", r"\bco\b",
        r"\bsportsbook\b", r"\bcasino\b", r"\binteractive\b", r"\bdigital\b",
        r"\bgaming\b", r"\bbetting\b",
    ):
        s = re.sub(suffix, " ", s)
    s = re.sub(r"[^a-z0-9]+", "", s)
    return s


@dataclass
class OperatorResolver:
    """Per-(session, market) resolver."""

    session: Session
    market_id: uuid.UUID
    market_slug: str

    #: Full-strength alias index built once per resolver.
    _by_norm: dict[str, uuid.UUID] = field(default_factory=dict)
    #: Loose alias index for operator-only entities (same keys, maintained in parallel
    #: so auto-created rows are immediately resolvable on next lookup in the same run).
    _auto_created: dict[str, uuid.UUID] = field(default_factory=dict)
    #: Names that couldn't be resolved — for operator review.
    unresolved_log: list[str] = field(default_factory=list)

    @classmethod
    def build(cls, session: Session, market_id: uuid.UUID,
              market_slug: str) -> "OperatorResolver":
        self = cls(session=session, market_id=market_id, market_slug=market_slug)
        for e_id, name, slug, aliases, meta in session.execute(select(
            Entity.id, Entity.name, Entity.slug, Entity.aliases, Entity.extra_metadata,
        )):
            for key in (name, slug, *(aliases or [])):
                if not key:
                    continue
                norm = _norm(key)
                if norm:
                    self._by_norm[norm] = e_id
            # Per-market alias lists stashed by the user during curation.
            regulator_aliases = (meta or {}).get("regulator_aliases", {}) if meta else {}
            for market_key, alias_list in regulator_aliases.items():
                if market_key != market_slug:
                    continue
                for alias in alias_list:
                    norm = _norm(alias)
                    if norm:
                        self._by_norm[norm] = e_id
        return self

    def resolve(self, reported_name: str) -> uuid.UUID:
        """Return entity_id for this reported name. Auto-creates if needed.

        Raises only on genuinely empty input.
        """
        reported_name = (reported_name or "").strip()
        if not reported_name:
            raise ValueError("reported_name is empty")

        norm = _norm(reported_name)
        if not norm:
            raise ValueError(f"reported_name {reported_name!r} normalises to empty")

        hit = self._by_norm.get(norm) or self._auto_created.get(norm)
        if hit is not None:
            return hit

        return self._auto_create(reported_name, norm)

    def _auto_create(self, reported_name: str, norm: str) -> uuid.UUID:
        """Insert a new entity with status='auto_added_needs_review'."""
        slug = self._derive_slug(reported_name)
        # Avoid slug collision if the entity already exists under a different norm.
        slug = self._unique_slug(slug)

        self.unresolved_log.append(reported_name)
        log.warning(
            "operator auto-add: market=%s reported=%r → slug=%s (needs review)",
            self.market_slug, reported_name, slug,
        )

        meta = {
            "status": "auto_added_needs_review",
            "first_seen_as": reported_name,
            "first_seen_market": self.market_slug,
        }
        entity = Entity(
            name=reported_name,
            slug=slug,
            aliases=[reported_name],
            extra_metadata=meta,
        )
        self.session.add(entity)
        self.session.flush()  # populate entity.id
        self._auto_created[norm] = entity.id
        return entity.id

    def _derive_slug(self, name: str) -> str:
        slug = name.lower()
        slug = unicodedata.normalize("NFKD", slug).encode("ascii", "ignore").decode()
        slug = re.sub(r"[^a-z0-9]+", "-", slug).strip("-")
        return slug or "operator"

    def _unique_slug(self, base: str) -> str:
        existing = self.session.execute(
            select(Entity.slug).where(Entity.slug.like(f"{base}%"))
        ).scalars().all()
        if base not in existing:
            return base
        i = 2
        while f"{base}-{i}" in existing:
            i += 1
        return f"{base}-{i}"


def resolve_market_id_by_slug(session: Session, slug: str) -> uuid.UUID:
    row = session.execute(select(Market.id).where(Market.slug == slug)).first()
    if row is None:
        raise RuntimeError(f"market slug {slug!r} not in DB")
    return row[0]
