"""One-off: parse every PDF under pdfs/ at configurable parallelism.

Progress is emitted every 30 completions and flushed so `tail -f` works.
Skips the materialized-view refresh per parse (serialises with the lock).
A single final REFRESH runs at the end.
"""

from __future__ import annotations

import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock

# Silence the per-parse INFO logs so the progress line is legible.
os.environ["TRAILBLAZE_SKIP_MATVIEW_REFRESH"] = "1"
logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("pypdf").setLevel(logging.ERROR)

from sqlalchemy import text  # noqa: E402

from trailblaze.db.session import session_scope  # noqa: E402
from trailblaze.parser.pipeline import parse_pdf  # noqa: E402

MAX_WORKERS = int(os.getenv("BACKFILL_WORKERS", "24"))
PDF_DIR = Path("pdfs")


def run_one(pdf_path: Path) -> dict:
    try:
        r = parse_pdf(pdf_path)
        return {
            "file": pdf_path.name,
            "outcome": "ok",
            "parse_status": r.parse_status,
            "metrics": r.metric_count,
            "narratives": r.narrative_count,
            "warnings": len(r.warnings),
            "dup": r.was_already_ingested,
        }
    except Exception as e:
        return {
            "file": pdf_path.name,
            "outcome": "error",
            "error": str(e)[:300],
        }


def main() -> None:
    pdfs = sorted(PDF_DIR.glob("*.pdf"))
    total = len(pdfs)
    print(f"[backfill] {total} PDFs, workers={MAX_WORKERS}", flush=True)

    lock = Lock()
    done = 0
    ok = 0
    err = 0
    dup = 0
    start = time.time()
    errors: list[tuple[str, str]] = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(run_one, p): p for p in pdfs}
        for fut in as_completed(futures):
            res = fut.result()
            with lock:
                done += 1
                if res["outcome"] == "ok":
                    ok += 1
                    if res["dup"]:
                        dup += 1
                else:
                    err += 1
                    errors.append((res["file"], res.get("error", "?")))
                if done % 30 == 0 or done == total:
                    elapsed = time.time() - start
                    rate = done / elapsed if elapsed else 0
                    remain = (total - done) / rate if rate else 0
                    print(
                        f"[{done}/{total}] ok={ok} err={err} dup={dup} "
                        f"elapsed={elapsed:.0f}s rate={rate:.2f}/s "
                        f"eta={remain:.0f}s",
                        flush=True,
                    )

    elapsed = time.time() - start
    print(f"[backfill] done in {elapsed:.0f}s: ok={ok} err={err} dup={dup}", flush=True)

    if errors:
        print(f"[backfill] {len(errors)} errors (showing first 20):", flush=True)
        for fn, msg in errors[:20]:
            print(f"  {fn}: {msg}", flush=True)

    # Single final REFRESH of the canonical view.
    print("[backfill] REFRESH MATERIALIZED VIEW metric_value_canonical …", flush=True)
    t0 = time.time()
    with session_scope() as s:
        s.execute(text("REFRESH MATERIALIZED VIEW metric_value_canonical"))
    print(f"[backfill] refresh took {time.time() - t0:.1f}s", flush=True)


if __name__ == "__main__":
    sys.exit(main() or 0)
