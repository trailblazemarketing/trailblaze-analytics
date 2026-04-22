"""`trailblaze-scrape-gmail` — pull analyst emails via Gmail API and ingest.

First run will open a browser for OAuth consent; subsequent runs reuse the
refresh token persisted at ``secrets/gmail_token.json``. Only messages with
the ``Trailblaze-Ingest`` label and a sender on ``TRUSTED_SENDERS`` are
processed; all others are recorded in ``gmail_ingested_messages`` with the
appropriate status.
"""

from __future__ import annotations

import logging

import click

from trailblaze.scrapers.common import configure_logging
from trailblaze.scrapers.gmail.config import TRUSTED_SENDERS
from trailblaze.scrapers.gmail.ingest import ingest_labeled_emails


@click.command()
@click.option(
    "--dry-run",
    is_flag=True,
    help="List matching messages + sender allow/deny status; don't render, parse, "
         "or modify Gmail labels or the database.",
)
@click.option(
    "--limit",
    type=int,
    default=None,
    help="Cap the number of messages processed this run.",
)
@click.option(
    "--force",
    is_flag=True,
    help="Re-process messages already marked 'ingested' in "
         "gmail_ingested_messages. The parser's file-hash dedup still applies.",
)
@click.option("-v", "--verbose", is_flag=True, help="DEBUG-level logging.")
def main(dry_run: bool, limit: int | None, force: bool, verbose: bool) -> None:
    """Scrape analyst emails from Gmail and ingest them into the Trailblaze DB."""
    configure_logging(logging.DEBUG if verbose else logging.INFO)

    click.echo(f"Trusted senders: {', '.join(TRUSTED_SENDERS) or '(none)'}")
    if dry_run:
        click.echo("Running in --dry-run mode; no side effects.")

    summary = ingest_labeled_emails(dry_run=dry_run, limit=limit, force=force)

    click.echo("")
    click.echo("Gmail ingestion summary")
    click.echo(f"  found:             {summary.found}")
    click.echo(f"  ingested:          {summary.ingested}")
    click.echo(f"  skipped_duplicate: {summary.skipped_duplicate}")
    click.echo(f"  rejected_sender:   {summary.rejected_sender}")
    click.echo(f"  errors:            {summary.errors}")
    if summary.error_details:
        click.echo("")
        click.echo("Errors:")
        for mid, err in summary.error_details:
            click.echo(f"  {mid}: {err}")


if __name__ == "__main__":
    main()
