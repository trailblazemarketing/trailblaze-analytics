"""Quarter-period utilities.

Period codes follow the Trailblaze convention ``YYYY-Q[1-4]`` (e.g.
``"2025-Q3"``). We stay stdlib-only — no fancy date libraries — so the
integration layer has zero dep surface beyond what it already imports.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Quarter:
    """A ``(year, quarter)`` pair with total-ordering by (year, quarter)."""

    year: int
    quarter: int  # 1..4

    @property
    def code(self) -> str:
        return f"{self.year}-Q{self.quarter}"

    @property
    def start_date(self) -> date:
        month = (self.quarter - 1) * 3 + 1
        return date(self.year, month, 1)

    @property
    def end_date(self) -> date:
        # Last day of the quarter = first day of next quarter minus one.
        nxt_start = self.next().start_date
        return date.fromordinal(nxt_start.toordinal() - 1)

    def next(self) -> "Quarter":
        if self.quarter == 4:
            return Quarter(self.year + 1, 1)
        return Quarter(self.year, self.quarter + 1)

    def prev(self) -> "Quarter":
        if self.quarter == 1:
            return Quarter(self.year - 1, 4)
        return Quarter(self.year, self.quarter - 1)

    def prior_year_same_quarter(self) -> "Quarter":
        return Quarter(self.year - 1, self.quarter)

    def __lt__(self, other: "Quarter") -> bool:
        return (self.year, self.quarter) < (other.year, other.quarter)


def parse_quarter(code: str) -> Quarter:
    """Parse a quarterly period code into ``Quarter(year, quarter)``.

    Accepts two formats:
      * ``"2025-Q3"`` — ISO-ish, sandbox default
      * ``"Q3-25"``   — 2-digit year (Trailblaze DB convention)

    Two-digit years use the usual 1970 pivot: ``00..69`` → ``2000..2069``,
    ``70..99`` → ``1970..1999``. The integration layer should normalise
    early; this parser is forgiving at the boundary.
    """
    if code.startswith("Q") and "-" in code:
        q_part, y_part = code.split("-", 1)
        quarter = int(q_part[1:])
        yy = int(y_part)
        year = (2000 + yy) if yy < 70 else (1900 + yy)
        if yy >= 100:
            year = yy  # 4-digit year after the "Q3-" prefix — unusual but honour it
        return Quarter(year, quarter)
    year_str, q_str = code.split("-Q", 1)
    return Quarter(int(year_str), int(q_str))


def quarters_between(start: Quarter, end: Quarter) -> list[Quarter]:
    """Inclusive range of quarters from ``start`` to ``end``.

    Used by the gap finder to enumerate expected periods between the first
    and last disclosed point; any enumerated quarter not backed by a
    disclosed ``TimeSeriesPoint`` is a candidate gap.
    """
    if end < start:
        return []
    out: list[Quarter] = []
    cur = start
    while not (end < cur):
        out.append(cur)
        cur = cur.next()
    return out
