"""`trailblaze-scrape-stocks` — pull daily close + valuation metrics via yfinance."""

from __future__ import annotations

import logging

import click

from trailblaze.db.session import session_scope
from trailblaze.scrapers.common import configure_logging
from trailblaze.scrapers.stocks import ingest_all_tickers

log = logging.getLogger("trailblaze.scrapers.cli_stocks")


@click.command()
@click.option("--lookback-days", default=7, show_default=True,
              help="How many calendar days of daily closes to pull per ticker.")
@click.option("--verbose", "-v", is_flag=True, help="Enable DEBUG logging.")
def main(lookback_days: int, verbose: bool) -> None:
    """Fetch latest stock data for every entity with a ticker and upsert metric_values."""
    configure_logging(logging.DEBUG if verbose else logging.INFO)
    with session_scope() as session:
        stats = ingest_all_tickers(session, lookback_days=lookback_days)
    click.echo(
        f"Stock scrape complete. "
        f"inserted={stats.inserted} updated={stats.updated} unchanged={stats.unchanged}"
    )


if __name__ == "__main__":
    main()
