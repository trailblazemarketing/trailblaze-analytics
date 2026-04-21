"""Seed fx_rates table from ECB daily reference rates.

Creates the table if it doesn't exist, then loads every day from the ECB
historical XML at https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml.
Idempotent — re-running updates only missing rows.

Rate semantics: 1 EUR = <rate> <currency>. EUR->USD example: rate=1.08 means
1 EUR buys 1.08 USD. So to convert USD -> EUR: usd_amount / rate.
"""
from __future__ import annotations

import os
import sys
from datetime import date
from xml.etree import ElementTree as ET

import psycopg

ECB_XML_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "ecb-hist.xml"
)
NS = {
    "g": "http://www.gesmes.org/xml/2002-08-01",
    "e": "http://www.ecb.int/vocabulary/2002-08-01/eurofxref",
}


def main() -> int:
    conn_str = os.environ.get(
        "DATABASE_URL",
        "postgresql://trailblaze:trailblaze@localhost:5432/trailblaze",
    )
    with psycopg.connect(conn_str, autocommit=True) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS fx_rates (
                    currency_code TEXT NOT NULL,
                    rate_date DATE NOT NULL,
                    eur_rate NUMERIC NOT NULL,
                    PRIMARY KEY (currency_code, rate_date)
                )
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS ix_fx_rates_date ON fx_rates (rate_date DESC)"
            )

        tree = ET.parse(ECB_XML_PATH)
        root = tree.getroot()
        days = root.findall(".//e:Cube[@time]", NS)
        print(f"ECB XML has {len(days)} daily frames", file=sys.stderr)

        rows: list[tuple[str, date, float]] = []
        for day in days:
            d = date.fromisoformat(day.get("time"))
            for rate in day.findall("e:Cube", NS):
                ccy = rate.get("currency")
                r = float(rate.get("rate"))
                rows.append((ccy, d, r))
            # EUR = 1 by definition — insert so lookups are uniform
            rows.append(("EUR", d, 1.0))

        print(f"Inserting {len(rows)} rate rows", file=sys.stderr)
        with conn.cursor() as cur:
            # COPY is faster but ON CONFLICT needs INSERT. Batched.
            cur.executemany(
                "INSERT INTO fx_rates (currency_code, rate_date, eur_rate) "
                "VALUES (%s, %s, %s) ON CONFLICT (currency_code, rate_date) "
                "DO UPDATE SET eur_rate = EXCLUDED.eur_rate",
                rows,
            )

        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM fx_rates")
            total = cur.fetchone()[0]
            cur.execute(
                "SELECT MIN(rate_date), MAX(rate_date) FROM fx_rates"
            )
            mn, mx = cur.fetchone()
            print(f"fx_rates now: {total} rows spanning {mn} → {mx}", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
