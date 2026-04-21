"""Generate calendar periods (quarters, halves, 9M, full year) for a year range.

SCHEMA_SPEC note: non-calendar fiscal years (e.g. Aristocrat FY ends Sep 30) are
NOT seeded here. They are inserted ad-hoc when encountered, with fiscal_year set
to the company's reported year and start_date/end_date reflecting actual calendar
dates.
"""

from __future__ import annotations

from datetime import date

START_YEAR = 2019
END_YEAR = 2027  # inclusive


def _yy(year: int) -> str:
    return f"{year % 100:02d}"


def generate_periods() -> list[dict]:
    rows: list[dict] = []
    for y in range(START_YEAR, END_YEAR + 1):
        yy = _yy(y)
        # Quarters
        quarters = [
            (1, date(y, 1, 1), date(y, 3, 31)),
            (2, date(y, 4, 1), date(y, 6, 30)),
            (3, date(y, 7, 1), date(y, 9, 30)),
            (4, date(y, 10, 1), date(y, 12, 31)),
        ]
        for q, start, end in quarters:
            rows.append({
                "code": f"Q{q}-{yy}",
                "period_type": "quarter",
                "fiscal_year": y,
                "quarter": q,
                "start_date": start,
                "end_date": end,
                "display_name": f"Q{q} {y}",
            })
        # Halves
        rows.append({
            "code": f"H1-{yy}", "period_type": "half_year",
            "fiscal_year": y, "quarter": None,
            "start_date": date(y, 1, 1), "end_date": date(y, 6, 30),
            "display_name": f"H1 {y}",
        })
        rows.append({
            "code": f"H2-{yy}", "period_type": "half_year",
            "fiscal_year": y, "quarter": None,
            "start_date": date(y, 7, 1), "end_date": date(y, 12, 31),
            "display_name": f"H2 {y}",
        })
        # Nine months
        rows.append({
            "code": f"9M-{yy}", "period_type": "nine_months",
            "fiscal_year": y, "quarter": None,
            "start_date": date(y, 1, 1), "end_date": date(y, 9, 30),
            "display_name": f"9M {y}",
        })
        # Full year
        rows.append({
            "code": f"FY-{yy}", "period_type": "full_year",
            "fiscal_year": y, "quarter": None,
            "start_date": date(y, 1, 1), "end_date": date(y, 12, 31),
            "display_name": f"FY {y}",
        })
    return rows


PERIODS: list[dict] = generate_periods()
