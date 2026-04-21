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
        # LTM / TTM anchored to fiscal year-end (synonymous with FY window)
        for code_prefix, display_prefix in (("LTM", "LTM"), ("TTM", "TTM")):
            rows.append({
                "code": f"{code_prefix}-{yy}", "period_type": "ltm",
                "fiscal_year": y, "quarter": None,
                "start_date": date(y, 1, 1), "end_date": date(y, 12, 31),
                "display_name": f"{display_prefix} {y}",
            })
        # LTM per quarter-end — common in M&A / capital-markets-day docs
        q_ends = [(1, date(y, 3, 31)), (2, date(y, 6, 30)),
                  (3, date(y, 9, 30)), (4, date(y, 12, 31))]
        for q, q_end in q_ends:
            # LTM ending at q_end → starts q_end + 1 day of prior year
            ltm_start_month = q_end.month + 1 if q_end.month < 12 else 1
            ltm_start_year = y - 1 if q_end.month < 12 else y
            if q_end.month == 12:
                ltm_start = date(y, 1, 1)
            else:
                ltm_start = date(ltm_start_year, ltm_start_month, 1)
            rows.append({
                "code": f"LTM-Q{q}-{yy}", "period_type": "ltm",
                "fiscal_year": y, "quarter": q,
                "start_date": ltm_start, "end_date": q_end,
                "display_name": f"LTM Q{q} {y}",
            })
        # YTD anchored to full year (Jan 1 – Dec 31) as "custom"
        rows.append({
            "code": f"YTD-{yy}", "period_type": "custom",
            "fiscal_year": y, "quarter": None,
            "start_date": date(y, 1, 1), "end_date": date(y, 12, 31),
            "display_name": f"YTD {y}",
        })
    return rows


_MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def generate_monthly_periods() -> list[dict]:
    """Monthly codes in three grammars (Mmm-YY, MNN-YY, YTD-Mmm-YY) for
    2024-2027. All three point at the same date range — the LLM uses
    different forms interchangeably, so we seed them as independent codes."""
    rows: list[dict] = []
    for y in range(2024, 2028):
        yy = _yy(y)
        for m in range(1, 13):
            abbr = _MONTH_ABBR[m - 1]
            # Month end: simple lookup table avoids a calendar dep
            month_ends = {1: 31, 2: 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28,
                          3: 31, 4: 30, 5: 31, 6: 30,
                          7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31}
            month_start = date(y, m, 1)
            month_end = date(y, m, month_ends[m])
            display = f"{abbr} {y}"
            # Form 1: Mmm-YY
            rows.append({
                "code": f"{abbr}-{yy}", "period_type": "month",
                "fiscal_year": y, "quarter": None,
                "start_date": month_start, "end_date": month_end,
                "display_name": display,
            })
            # Form 2: MNN-YY (numeric)
            rows.append({
                "code": f"M{m:02d}-{yy}", "period_type": "month",
                "fiscal_year": y, "quarter": None,
                "start_date": month_start, "end_date": month_end,
                "display_name": display,
            })
            # Form 3: YTD-Mmm-YY (Jan 1 through month end)
            rows.append({
                "code": f"YTD-{abbr}-{yy}", "period_type": "custom",
                "fiscal_year": y, "quarter": None,
                "start_date": date(y, 1, 1), "end_date": month_end,
                "display_name": f"YTD {abbr} {y}",
            })
    return rows


PERIODS: list[dict] = generate_periods() + generate_monthly_periods()
