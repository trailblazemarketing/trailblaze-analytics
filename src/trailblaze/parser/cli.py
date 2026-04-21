"""`trailblaze-parse` — parse one or more PDFs end-to-end."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

import click
from rich.console import Console
from rich.table import Table

from trailblaze.parser.pipeline import parse_pdf

console = Console()


@click.command()
@click.argument("pdfs", nargs=-1, type=click.Path(exists=True, dir_okay=False, path_type=Path))
@click.option("-v", "--verbose", is_flag=True, help="Debug-level logging.")
def main(pdfs: tuple[Path, ...], verbose: bool) -> None:
    """Parse one or more Trailblaze PDFs and ingest them into the database."""
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if not pdfs:
        click.echo("Pass one or more PDF paths. Example: trailblaze-parse pdfs/*.pdf", err=True)
        sys.exit(2)

    table = Table(title="Parse results")
    table.add_column("File")
    table.add_column("Status")
    table.add_column("Metrics", justify="right")
    table.add_column("Narratives", justify="right")
    table.add_column("Warnings", justify="right")

    for pdf in pdfs:
        try:
            result = parse_pdf(pdf)
            table.add_row(
                pdf.name,
                result.parse_status + (" (dup)" if result.was_already_ingested else ""),
                str(result.metric_count),
                str(result.narrative_count),
                str(len(result.warnings)),
            )
        except Exception as e:
            logging.exception("Failed to parse %s", pdf)
            table.add_row(pdf.name, f"error: {e}", "-", "-", "-")

    console.print(table)


if __name__ == "__main__":
    main()
