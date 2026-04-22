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
@click.option(
    "--reprocess-existing",
    is_flag=True,
    help="Rerun render + parse against every message previously marked "
         "'ingested' (drives from the DB, not the Gmail label). Deletes the "
         "stale report + metric_values before re-ingesting. Use this after a "
         "renderer or parser change that should be applied retroactively.",
)
@click.option("-v", "--verbose", is_flag=True, help="DEBUG-level logging.")
def main(
    dry_run: bool,
    limit: int | None,
    force: bool,
    reprocess_existing: bool,
    verbose: bool,
) -> None:
    """Scrape analyst emails from Gmail and ingest them into the Trailblaze DB."""
    configure_logging(logging.DEBUG if verbose else logging.INFO)

    click.echo(f"Trusted senders: {', '.join(TRUSTED_SENDERS) or '(none)'}")
    if dry_run:
        click.echo("Running in --dry-run mode; no side effects.")
    if reprocess_existing:
        click.echo(
            "Running in --reprocess-existing mode; previously-ingested reports "
            "will be rebuilt from Gmail."
        )

    summary = ingest_labeled_emails(
        dry_run=dry_run,
        limit=limit,
        force=force,
        reprocess_existing=reprocess_existing,
    )

    click.echo("")
    click.echo("Gmail ingestion summary")
    click.echo(f"  found:             {summary.found}")
    click.echo(f"  ingested:          {summary.ingested}")
    click.echo(f"  reprocessed:       {summary.reprocessed}")
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
