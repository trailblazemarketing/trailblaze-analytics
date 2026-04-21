"""Period resolver+creator for scraper-generated data.

Seeded periods only cover quarters/halves/9M/FY. Scrapers ingest at finer
grains (monthly regulator filings, daily stock closes), so we lazily create
the matching ``periods`` row on first reference.

Code conventions
----------------
* monthly:  ``M{YYYY}-{MM}``   e.g. ``M2026-03`` — period_type='month'
* daily:    ``D{YYYY-MM-DD}``  e.g. ``D2026-04-21`` — period_type='custom'
"""

from __future__ import annotations

import calendar
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from trailblaze.db.models import Period


def _month_code(year: int, month: int) -> str:
    return f"M{year:04d}-{month:02d}"


def _daily_code(d: date) -> str:
    return f"D{d.isoformat()}"


class PeriodCache:
    """Per-run cache; fetches from DB on first miss, creates missing rows on demand."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self._cache: dict[str, uuid.UUID] = {}
        for code, pid in session.execute(select(Period.code, Period.id)):
            self._cache[code] = pid

    def _insert(self, row: dict) -> uuid.UUID:
        stmt = Period.__table__.insert().values(row).returning(Period.id)
        pid = self.session.execute(stmt).scalar_one()
        self._cache[row["code"]] = pid
        return pid

    def month(self, year: int, month: int) -> uuid.UUID:
        code = _month_code(year, month)
        if code in self._cache:
            return self._cache[code]
        last_day = calendar.monthrange(year, month)[1]
        return self._insert({
            "code": code,
            "period_type": "month",
            "fiscal_year": year,
            "quarter": None,
            "start_date": date(year, month, 1),
            "end_date": date(year, month, last_day),
            "display_name": f"{calendar.month_abbr[month]} {year}",
        })

    def daily(self, d: date) -> uuid.UUID:
        code = _daily_code(d)
        if code in self._cache:
            return self._cache[code]
        return self._insert({
            "code": code,
            "period_type": "custom",
            "fiscal_year": d.year,
            "quarter": None,
            "start_date": d,
            "end_date": d,
            "display_name": d.isoformat(),
        })

    def quarter(self, year: int, quarter: int) -> uuid.UUID:
        """Calendar quarter. Matches the seed's ``Q{q}-{yy}`` code format."""
        if quarter not in (1, 2, 3, 4):
            raise ValueError(f"quarter must be 1..4, got {quarter}")
        code = f"Q{quarter}-{year % 100:02d}"
        if code in self._cache:
            return self._cache[code]
        start_month = 3 * (quarter - 1) + 1
        end_month = start_month + 2
        last_day = calendar.monthrange(year, end_month)[1]
        return self._insert({
            "code": code,
            "period_type": "quarter",
            "fiscal_year": year,
            "quarter": quarter,
            "start_date": date(year, start_month, 1),
            "end_date": date(year, end_month, last_day),
            "display_name": f"Q{quarter} {year}",
        })

    def full_year(self, year: int) -> uuid.UUID:
        """Calendar year. Matches the seed's ``FY-{yy}`` code format."""
        code = f"FY-{year % 100:02d}"
        if code in self._cache:
            return self._cache[code]
        return self._insert({
            "code": code,
            "period_type": "full_year",
            "fiscal_year": year,
            "quarter": None,
            "start_date": date(year, 1, 1),
            "end_date": date(year, 12, 31),
            "display_name": f"FY {year}",
        })
