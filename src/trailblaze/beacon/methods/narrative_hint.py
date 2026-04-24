"""Method 4 — narrative-hint validator (STUB for v1).

Not integrated in v1 — the sandbox is isolated from the Trailblaze
narratives table. When v1 lands in main repo, this method should:

  1. Fetch ``narratives`` rows where ``narratives.entity_id = series.entity_id``
     AND ``narratives.period_id`` matches the gap period.
  2. Regex-scan ``narratives.content`` for a numeric value in the metric's
     unit (e.g. "revenue of €295m").
  3. If a numeric hint is found AND it's within 20% of the Method 1
     (linear_trend) estimate, return it with boosted confidence.
  4. Otherwise return ``None`` (doesn't block the ensemble).

Left as ``None`` here so the engine runs without narratives data.
"""

from __future__ import annotations

from typing import Optional

from trailblaze.beacon.types import Gap, MethodResult, TimeSeries


NAME = "narrative_hint"


def run(_series: TimeSeries, _gap: Gap) -> Optional[MethodResult]:
    # TODO(integration): wire to Trailblaze narratives table; see docs/INTEGRATION.md §7.
    return None
