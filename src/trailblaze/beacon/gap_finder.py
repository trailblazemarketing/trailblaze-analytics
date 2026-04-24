"""Identify interior quarter gaps in a TimeSeries.

A "gap" is any quarter that sits between the first and last DISCLOSED point
of the series but is either

  * absent from ``series.points`` entirely, or
  * present with ``disclosure_status`` in ``{"not_disclosed", "partially_disclosed"}``
    (the latter because a partial disclosure is still a signal worth
    Beacon-estimating; the human-disclosed fragment lives in ``metadata``).

Edge gaps (before the first disclosed or after the last disclosed) are
NEVER returned — those are out-of-sample extrapolation which is Beacon v2.

The finder enumerates expected quarters by stepping across the span, so it
naturally returns each missing quarter in one pass regardless of how many
are missing.
"""

from __future__ import annotations

from trailblaze.beacon.periods import Quarter, parse_quarter, quarters_between
from trailblaze.beacon.types import Gap, TimeSeries


_DISCLOSED_STATUSES = frozenset({"disclosed"})
_GAP_STATUSES = frozenset({"not_disclosed", "partially_disclosed"})


def find_gaps(series: TimeSeries) -> list[Gap]:
    """Return the interior missing-quarter gaps of ``series``.

    Returns an empty list if no disclosed points exist or if the series has
    a single disclosed point (nothing to interpolate between).
    """
    if not series.points:
        return []

    # Partition by status. Use the parsed Quarter as the sortable key so
    # callers can pass points in any order.
    disclosed: dict[Quarter, None] = {}
    gap_flagged: dict[Quarter, None] = {}
    for p in series.points:
        q = parse_quarter(p.period_code)
        if p.disclosure_status in _DISCLOSED_STATUSES and p.value is not None:
            disclosed[q] = None
        elif p.disclosure_status in _GAP_STATUSES or p.value is None:
            gap_flagged[q] = None

    if len(disclosed) < 2:
        return []

    first = min(disclosed.keys())
    last = max(disclosed.keys())

    # Enumerate the inclusive quarter range and yield anything missing or
    # explicitly gap-flagged. ``ordinal`` is the 0-based index into the full
    # enumerated range so downstream methods can use it as a numeric x-axis.
    gaps: list[Gap] = []
    for ordinal, q in enumerate(quarters_between(first, last)):
        if q in disclosed:
            continue
        # Either absent from the series or flagged not_disclosed /
        # partially_disclosed — treat identically as a gap.
        gaps.append(
            Gap(
                period_code=q.code,
                period_start_date=q.start_date,
                period_end_date=q.end_date,
                ordinal=ordinal,
            )
        )
    return gaps
