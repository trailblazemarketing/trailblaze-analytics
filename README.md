# Trailblaze Analytics Platform

iGaming market intelligence platform. Ingests Trailblaze PDF reports, external scraped data, and Beacon™ modeled estimates into a Postgres database; exposes them through a dashboard (future phase).

The canonical design is in [`SCHEMA_SPEC.md`](./SCHEMA_SPEC.md).

## Stack

- **Database:** Postgres 16 (via `docker-compose`)
- **ORM / migrations:** SQLAlchemy 2.x + Alembic
- **Parser:** Python + Anthropic SDK (two-pass, strict JSON schema)
- **Validation:** Pydantic v2

## Quick start

```bash
# 1. Boot Postgres
docker compose up -d

# 2. Install package (editable) + dev deps
python -m venv .venv
source .venv/Scripts/activate   # on Windows bash
pip install -e ".[dev]"

# 3. Configure env
cp .env.example .env
# edit .env — set ANTHROPIC_API_KEY

# 4. Apply migrations
alembic upgrade head

# 5. Seed reference data
trailblaze-seed

# 6. Parse a PDF
trailblaze-parse pdfs/<filename>.pdf
```

## Repo layout

```
alembic/              Alembic migration env + versions
src/trailblaze/
  db/                 SQLAlchemy models, session, Base
  seed/               Seed data scripts (reference entities, metrics, markets, …)
  parser/             Two-pass PDF parser + CLI
  config.py           Pydantic settings
tests/
docker-compose.yml    Local Postgres 16
pyproject.toml
SCHEMA_SPEC.md        Canonical design spec
```

## Status

- [x] Schema spec
- [ ] Migrations
- [ ] Seed data
- [ ] Parser scaffolding
- [ ] Parser prompt tuning (against real PDFs)
- [ ] Beacon™ estimation engine
- [ ] Dashboard
