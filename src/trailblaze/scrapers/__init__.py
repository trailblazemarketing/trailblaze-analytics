"""Scraping layer — regulator monthly filings + public market data.

Self-contained. Does not import from trailblaze.parser (which parses our own
PDFs) — this package pulls structured data directly from third-party sources
and writes metric_values rows keyed on (entity|market, metric, period, source).

Submodules
----------
* ``common`` — HTTP, logging, retry helpers.
* ``upsert`` — idempotent write helpers (metric_value lookup-then-insert).
* ``periods`` — resolve/create monthly + daily Period rows on demand.
* ``regulators/*`` — one scraper per US regulator we track.
* ``stocks`` — yfinance-backed equity pricing pull.
* ``cli_regulators`` / ``cli_stocks`` — click CLIs exposed via pyproject scripts.
"""
