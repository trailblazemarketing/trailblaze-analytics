"""Pattern 1 (operator segment + region) support — additive data seeds.

Phase 2.5 Unit A. Adds the reference rows the new operator-segment-region
recogniser emits against, without changing any table structure:

* Two virtual region markets (Western Europe, Rest of World) so Pattern 1's
  geographic split can use the existing ``entity_id + market_id`` mechanism.
  CEECA / Nordics / LatAm / Europe / North America / Africa / MENA /
  Asia-Pacific are already seeded.
* Three flat metric codes for the business-model + residual-product split:
  ``b2b_revenue``, ``b2c_revenue``, ``other_revenue``.
* Two metric aliases ``nordic`` → ``nordics`` (singular variant the LLM
  tends to emit) is handled at the market-alias layer; ``sports_margin``
  (LLM's common variant for sportsbook net margin) → ``sports_margin_pct``
  and ``b2b`` / ``b2c`` aliases for the two new revenue codes.

Rationale for no schema change: we already have flat codes for the product
split (``casino_revenue``, ``sportsbook_revenue``), already have
``market_type='region'`` rows for the region dimension, and the existing
``metric_values`` triplet ``(entity_id, market_id, metric_code)`` can carry
every cell the recogniser emits.

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-23
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# ---------------------------------------------------------------------------
# Data inserts — idempotent (ON CONFLICT DO NOTHING on the natural key).
# ---------------------------------------------------------------------------

_NEW_REGION_MARKETS = [
    {
        "slug": "western-europe",
        "name": "Western Europe",
        "market_type": "region",
        "aliases": ["WE", "W Europe"],
    },
    {
        "slug": "row",
        "name": "Rest of World",
        "market_type": "region",
        "aliases": ["RoW", "Rest of the World"],
    },
]

_NEW_METRICS = [
    {
        "code": "b2b_revenue",
        "display_name": "B2B Revenue",
        "category": "revenue",
        "unit_type": "currency",
        "default_currency_handling": "as_reported",
        "description": "Revenue from business-to-business operations (e.g. licensing platform to operators).",
    },
    {
        "code": "b2c_revenue",
        "display_name": "B2C Revenue",
        "category": "revenue",
        "unit_type": "currency",
        "default_currency_handling": "as_reported",
        "description": "Revenue from business-to-consumer operations (i.e. owned brands).",
    },
    {
        "code": "other_revenue",
        "display_name": "Other Revenue",
        "category": "revenue",
        "unit_type": "currency",
        "default_currency_handling": "as_reported",
        "description": "Residual revenue line that is neither casino nor sportsbook (e.g. bingo/poker combined, brokerage, ancillary).",
    },
]

# Alias → canonical metric code.
_NEW_METRIC_ALIASES = [
    ("sports_margin", "sports_margin_pct", "Betsson-style label for sportsbook net margin."),
    ("b2b", "b2b_revenue", "Short variant often emitted by the LLM for the B2B split."),
    ("b2c", "b2c_revenue", "Short variant often emitted by the LLM for the B2C split."),
    ("other", "other_revenue", "Short variant for the residual-product revenue row."),
]

# Market alias additions — a single extra alias on the existing nordics row.
# Many reports write "Nordic" (singular), which does not match the default
# aliases ["Nordic countries"] on ingest.
_MARKET_ALIAS_ADDS = [
    ("nordics", "Nordic"),
]


# ---------------------------------------------------------------------------
# upgrade
# ---------------------------------------------------------------------------


def upgrade() -> None:
    bind = op.get_bind()

    # 1. New region markets (skip if slug already present).
    for m in _NEW_REGION_MARKETS:
        existing = bind.execute(
            sa.text("SELECT 1 FROM markets WHERE slug = :slug"),
            {"slug": m["slug"]},
        ).first()
        if existing is not None:
            continue
        bind.execute(
            sa.text(
                "INSERT INTO markets (slug, name, market_type, aliases) "
                "VALUES (:slug, :name, :mt, :aliases)"
            ),
            {
                "slug": m["slug"],
                "name": m["name"],
                "mt": m["market_type"],
                "aliases": m["aliases"],
            },
        )

    # 2. New metric codes (skip if code already present).
    for m in _NEW_METRICS:
        existing = bind.execute(
            sa.text("SELECT 1 FROM metrics WHERE code = :code"),
            {"code": m["code"]},
        ).first()
        if existing is not None:
            continue
        bind.execute(
            sa.text(
                "INSERT INTO metrics "
                "(code, display_name, category, unit_type, "
                " default_currency_handling, description) "
                "VALUES (:code, :dn, :cat, :ut, :dch, :desc)"
            ),
            {
                "code": m["code"],
                "dn": m["display_name"],
                "cat": m["category"],
                "ut": m["unit_type"],
                "dch": m["default_currency_handling"],
                "desc": m["description"],
            },
        )

    # 3. Metric aliases (skip if alias_code already present).
    for alias_code, canon_code, notes in _NEW_METRIC_ALIASES:
        existing = bind.execute(
            sa.text("SELECT 1 FROM metric_aliases WHERE alias_code = :a"),
            {"a": alias_code},
        ).first()
        if existing is not None:
            continue
        canon_id = bind.execute(
            sa.text("SELECT id FROM metrics WHERE code = :c"),
            {"c": canon_code},
        ).scalar()
        if canon_id is None:
            continue  # canonical didn't insert; skip the alias
        bind.execute(
            sa.text(
                "INSERT INTO metric_aliases (alias_code, canonical_metric_id, notes) "
                "VALUES (:a, :cid, :n)"
            ),
            {"a": alias_code, "cid": canon_id, "n": notes},
        )

    # 4. Market alias additions — append to existing aliases array if missing.
    for slug, alias in _MARKET_ALIAS_ADDS:
        bind.execute(
            sa.text(
                "UPDATE markets SET aliases = "
                "  CASE "
                "    WHEN aliases IS NULL THEN ARRAY[:alias]::text[] "
                "    WHEN NOT (:alias = ANY(aliases)) THEN array_append(aliases, :alias) "
                "    ELSE aliases "
                "  END "
                "WHERE slug = :slug"
            ),
            {"slug": slug, "alias": alias},
        )


# ---------------------------------------------------------------------------
# downgrade
# ---------------------------------------------------------------------------


def downgrade() -> None:
    bind = op.get_bind()

    # Remove the metric aliases we added.
    for alias_code, _, _ in _NEW_METRIC_ALIASES:
        bind.execute(
            sa.text("DELETE FROM metric_aliases WHERE alias_code = :a"),
            {"a": alias_code},
        )

    # Remove new metric codes — only if nothing references them yet (use a
    # filtered delete so partial reprocesses don't break downgrade).
    for m in _NEW_METRICS:
        metric_id = bind.execute(
            sa.text("SELECT id FROM metrics WHERE code = :c"), {"c": m["code"]},
        ).scalar()
        if metric_id is None:
            continue
        referenced = bind.execute(
            sa.text("SELECT 1 FROM metric_values WHERE metric_id = :m LIMIT 1"),
            {"m": metric_id},
        ).first()
        if referenced is not None:
            continue  # leave in place — data references it
        bind.execute(
            sa.text("DELETE FROM metrics WHERE id = :m"), {"m": metric_id},
        )

    # Remove the region markets we added — only if unreferenced.
    for m in _NEW_REGION_MARKETS:
        market_id = bind.execute(
            sa.text("SELECT id FROM markets WHERE slug = :s"), {"s": m["slug"]},
        ).scalar()
        if market_id is None:
            continue
        referenced = bind.execute(
            sa.text("SELECT 1 FROM metric_values WHERE market_id = :m LIMIT 1"),
            {"m": market_id},
        ).first()
        if referenced is not None:
            continue
        bind.execute(
            sa.text("DELETE FROM markets WHERE id = :m"), {"m": market_id},
        )

    # Strip the singular "Nordic" alias from nordics.
    for slug, alias in _MARKET_ALIAS_ADDS:
        bind.execute(
            sa.text(
                "UPDATE markets SET aliases = array_remove(aliases, :alias) "
                "WHERE slug = :slug"
            ),
            {"slug": slug, "alias": alias},
        )
