"""`trailblaze-seed` — seed or re-seed reference data. Idempotent."""

from __future__ import annotations

import click

from trailblaze.seed.run import run_all


@click.command()
def main() -> None:
    """Populate reference data (entity_types, sources, metrics, periods, markets, entities)."""
    run_all()
    click.echo("Seed complete.")


if __name__ == "__main__":
    main()
