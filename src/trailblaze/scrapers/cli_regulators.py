"""`trailblaze-scrape-regulators` — run regulator scrapers.

Default mode runs only ``scraper_status='production'`` scrapers. Use
``--include-scaffolded`` to also run scaffolded (untested) scrapers, e.g. when
iterating on a new jurisdiction's URL/regex patterns.
"""

from __future__ import annotations

import logging

import click

from trailblaze.db.session import session_scope
from trailblaze.scrapers.common import configure_logging
from trailblaze.scrapers.regulators import ALL
from trailblaze.scrapers.upsert import UpsertStats

log = logging.getLogger("trailblaze.scrapers.cli_regulators")


@click.command()
@click.option("--months", default=6, show_default=True,
              help="How many trailing months of reports to pull per regulator.")
@click.option("--only", default=None,
              help="Comma-separated list of scraper names to run (case-insensitive "
                   "match against the scraper's `name` attribute). Implies "
                   "--include-scaffolded for the listed scrapers.")
@click.option("--include-scaffolded", is_flag=True,
              help="Also run scrapers with scraper_status='scaffolded_untested'.")
@click.option("--verbose", "-v", is_flag=True, help="Enable DEBUG logging.")
def main(months: int, only: str | None, include_scaffolded: bool, verbose: bool) -> None:
    """Scrape regulator monthly releases and upsert metric_values."""
    configure_logging(logging.DEBUG if verbose else logging.INFO)

    wanted: set[str] | None = None
    if only:
        wanted = {s.strip().lower() for s in only.split(",") if s.strip()}

    overall = UpsertStats()
    skipped: list[str] = []
    with session_scope() as session:
        for ScraperCls in ALL:
            scraper = ScraperCls(session, months=months)
            name_lower = scraper.name.lower()

            if wanted is not None:
                # --only overrides status filtering for the listed scrapers.
                if name_lower not in wanted:
                    continue
            else:
                # Default: production-only unless explicitly opting in.
                if scraper.scraper_status != "production" and not include_scaffolded:
                    skipped.append(f"{scraper.name} ({scraper.scraper_status})")
                    continue

            log.info("running %s [%s]", scraper.name, scraper.scraper_status)
            try:
                stats = scraper.run()
            except Exception:
                log.exception("%s crashed — continuing with next scraper", scraper.name)
                continue
            overall.merge(stats)
            session.flush()

    if skipped:
        log.info(
            "skipped %d scrapers (use --include-scaffolded to run): %s",
            len(skipped), ", ".join(skipped),
        )
    click.echo(
        f"Regulator scrape complete. "
        f"inserted={overall.inserted} updated={overall.updated} unchanged={overall.unchanged}"
    )


if __name__ == "__main__":
    main()
