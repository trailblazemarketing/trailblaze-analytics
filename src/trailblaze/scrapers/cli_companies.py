"""`trailblaze-scrape-companies` — run company IR scrapers.

Default mode runs only ``scraper_status='production'`` scrapers. All 15 IR
scrapers are currently ``scaffolded_untested`` and deferred per T3 scope, so
the default run is a no-op. Use ``--include-scaffolded`` to iterate on them.
"""

from __future__ import annotations

import logging

import click

from trailblaze.db.session import session_scope
from trailblaze.scrapers.common import configure_logging
from trailblaze.scrapers.companies import ALL
from trailblaze.scrapers.upsert import UpsertStats

log = logging.getLogger("trailblaze.scrapers.cli_companies")


@click.command()
@click.option("--max-releases", default=4, show_default=True,
              help="How many recent IR PDFs to pull per issuer.")
@click.option("--only", default=None,
              help="Comma-separated list of scraper names (case-insensitive). "
                   "Implies --include-scaffolded for listed scrapers.")
@click.option("--include-scaffolded", is_flag=True,
              help="Also run scrapers with scraper_status='scaffolded_untested'.")
@click.option("--verbose", "-v", is_flag=True, help="Enable DEBUG logging.")
def main(max_releases: int, only: str | None,
         include_scaffolded: bool, verbose: bool) -> None:
    """Scrape investor-relations pages for listed iGaming operators."""
    configure_logging(logging.DEBUG if verbose else logging.INFO)

    wanted: set[str] | None = None
    if only:
        wanted = {s.strip().lower() for s in only.split(",") if s.strip()}

    overall = UpsertStats()
    skipped: list[str] = []
    with session_scope() as session:
        for ScraperCls in ALL:
            scraper = ScraperCls(session)
            name_lower = scraper.name.lower()

            if wanted is not None:
                if name_lower not in wanted:
                    continue
            else:
                if scraper.scraper_status != "production" and not include_scaffolded:
                    skipped.append(f"{scraper.name} ({scraper.scraper_status})")
                    continue

            scraper.max_releases = max_releases
            log.info("running %s [%s]", scraper.name, scraper.scraper_status)
            try:
                stats = scraper.run()
            except Exception:
                log.exception("%s crashed — continuing with next IR", scraper.name)
                continue
            overall.merge(stats)
            session.flush()

    if skipped:
        log.info(
            "skipped %d scrapers (use --include-scaffolded to run): %s",
            len(skipped), ", ".join(skipped),
        )
    click.echo(
        f"Company IR scrape complete. "
        f"inserted={overall.inserted} updated={overall.updated} unchanged={overall.unchanged}"
    )


if __name__ == "__main__":
    main()
