"""LLM-backed paragraph extraction + numeric verification.

Single-responsibility module: given (raw_text, target metric value), call
Claude Haiku to find the paragraph that contains the value, verify the
number really appears within ±2%, and return the narrative — or None
when the LLM can't find a match or the match fails verification.

Non-verifying output is DROPPED, never stored. That's the product
invariant: a hallucinated quote attached to a real number is worse than
no quote. The verification step uses a regex number extractor rather
than trusting the LLM's claim.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from decimal import Decimal

from anthropic import Anthropic

from trailblaze.config import settings

log = logging.getLogger(__name__)

# Haiku 4.5 is more than sufficient for "find a paragraph mentioning a
# number" and 10–20× cheaper than Opus at scale (~1k narratives).
DEFAULT_MODEL = "claude-haiku-4-5-20251001"

# Truncation for the report raw_text we hand to the model. Most reports
# are <30k chars; the ones that aren't have tables that don't add context.
_MAX_RAW_TEXT_CHARS = 40_000

# Narrative output cap. The prompt asks for <500 chars; we truncate at
# 700 as a defensive ceiling in case the model includes a longer
# paragraph that still verifies.
_MAX_NARRATIVE_CHARS = 700

# Verification tolerance on the numeric match. 2% swallows rounding
# noise ("3.79B" vs "$3,794M") without accepting genuinely different
# numbers as matches.
_VERIFY_TOLERANCE = 0.02


@dataclass(frozen=True)
class NarrativeExtraction:
    narrative_text: str
    verified_number_match: bool
    extraction_model: str


def _number_tokens(text: str) -> list[float]:
    """Extract all numeric tokens from a text blob.

    Handles: "303.7", "1,468", "EUR 164", "$3.79B", "11.9%", "-5.0".
    Ignores years (1900–2099 by themselves) and explicit percentage values
    (they usually aren't the target value unit). Returns floats in the
    same scale as appeared in the text — the caller normalises.
    """
    out: list[float] = []
    # Primary pattern: optional sign + digits + optional comma-thousands +
    # optional decimal. Surrounding currency / units / % don't need
    # matching — we only want the digits.
    for m in re.finditer(r"(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)", text):
        raw = m.group(1).replace(",", "")
        try:
            n = float(raw)
        except ValueError:
            continue
        # Drop bare year tokens (1900..2099) — they're never the target
        # metric.
        if 1900 <= n <= 2099 and "." not in raw and "," not in m.group(1):
            # Only drop when preceded/followed by non-currency context
            context_start = max(0, m.start() - 2)
            prefix = text[context_start : m.start()]
            if not re.search(r"[\$€£¥]|EUR|USD|GBP|SEK|CAD", prefix, re.IGNORECASE):
                continue
        out.append(n)
    return out


def _verify_value_present(
    narrative_text: str,
    target_value: Decimal,
    unit_multiplier: str | None,
    tolerance: float = _VERIFY_TOLERANCE,
) -> bool:
    """Does the narrative contain a number within ±tolerance of the target?

    Checks a few scale forms because the narrative prose may render the
    value at a different magnitude than the DB stores it. For
    value_numeric=3.79, unit_multiplier="billions" we accept "3.79",
    "3,794" (×1000 for "in millions"), "3.8", "3.79B".
    """
    target = float(target_value)
    if target == 0:
        # Zero values are too permissive — any "0" in the text would match.
        # Accept only when the narrative explicitly discusses a zero metric.
        return "0" in narrative_text and target_value == Decimal(0)

    scale_forms: list[float] = [target]
    # Promote / demote one multiplier step so prose magnitudes match.
    if unit_multiplier == "billions":
        scale_forms.append(target * 1000)  # reported as N-in-millions
    elif unit_multiplier == "millions":
        scale_forms.append(target / 1000)  # reported as N-in-billions
        scale_forms.append(target * 1000)  # reported as N-in-thousands
    elif unit_multiplier == "thousands":
        scale_forms.append(target / 1000)  # reported as N-in-millions

    nums = _number_tokens(narrative_text)
    for form in scale_forms:
        if form == 0:
            continue
        for n in nums:
            if abs(n - form) <= abs(form) * tolerance:
                return True
    return False


def _build_prompt(
    *,
    raw_text: str,
    entity_name: str,
    metric_code: str,
    metric_value: Decimal,
    unit_multiplier: str | None,
    currency: str | None,
    period_label: str,
    market_name: str | None,
) -> str:
    mult_display = f" {unit_multiplier}" if unit_multiplier else ""
    ccy_display = f" {currency}" if currency else ""
    scope = market_name if market_name else "group-level"
    return f"""You are given the full text of an analyst report and a specific metric value.
Your job is to find the paragraph (or sentence, if prose is dense) that contains or explains this specific value and entity.

REPORT TEXT:
---
{raw_text}
---

TARGET METRIC:
- Entity: {entity_name}
- Metric: {metric_code}
- Value: {metric_value}{mult_display}{ccy_display}
- Period: {period_label}
- Market / scope: {scope}

INSTRUCTIONS:
1. Find the paragraph in the report that discusses this specific metric value for this specific entity/period/scope.
2. Return that paragraph verbatim — do not paraphrase.
3. The paragraph MUST contain either the exact number {metric_value} or a value within 2% of it (rounding tolerance). Numbers may appear at a different scale (e.g. stored as "3.79 billions" but the prose writes "$3,794M") — that still counts.
4. Keep it under 500 characters.
5. If no paragraph clearly discusses this metric, return exactly: NO_RELEVANT_NARRATIVE

RESPOND WITH ONLY THE PARAGRAPH OR NO_RELEVANT_NARRATIVE, NO PREAMBLE.
"""


def _client() -> Anthropic:
    if not settings.anthropic_api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and set it."
        )
    return Anthropic(api_key=settings.anthropic_api_key, max_retries=2)


def extract_narrative_for_metric(
    *,
    report_raw_text: str,
    metric_code: str,
    metric_value: Decimal,
    unit_multiplier: str | None,
    currency: str | None,
    entity_name: str,
    period_label: str,
    market_name: str | None = None,
    model: str = DEFAULT_MODEL,
) -> NarrativeExtraction | None:
    """Return a verified narrative paragraph for the target metric, or None.

    Returns None when:
      * the LLM couldn't find a matching paragraph (``NO_RELEVANT_NARRATIVE``)
      * the returned paragraph fails numeric verification (no number within
        ±2% of the target at any supported scale form)
      * the narrative is empty / too short to be useful

    Never returns an unverified narrative — that's the product contract.
    """
    if not report_raw_text or not metric_value:
        return None
    truncated_raw = report_raw_text[:_MAX_RAW_TEXT_CHARS]

    prompt = _build_prompt(
        raw_text=truncated_raw,
        entity_name=entity_name,
        metric_code=metric_code,
        metric_value=metric_value,
        unit_multiplier=unit_multiplier,
        currency=currency,
        period_label=period_label,
        market_name=market_name,
    )

    resp = _client().messages.create(
        model=model,
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    # The message content is a list of blocks; for plain-text responses
    # the first block is a TextBlock.
    text_parts: list[str] = []
    for block in resp.content:
        if getattr(block, "type", None) == "text":
            text_parts.append(block.text)
    raw = "".join(text_parts).strip()
    if not raw:
        return None
    if raw == "NO_RELEVANT_NARRATIVE":
        return None

    narrative = raw[:_MAX_NARRATIVE_CHARS].strip()
    if len(narrative) < 30:
        # Model returned a stub; treat as no-match.
        return None

    verified = _verify_value_present(narrative, metric_value, unit_multiplier)
    if not verified:
        log.debug(
            "narrative verification failed for %s %s %s (value=%s %s)",
            entity_name, metric_code, period_label, metric_value, unit_multiplier,
        )
        return None

    return NarrativeExtraction(
        narrative_text=narrative,
        verified_number_match=True,
        extraction_model=model,
    )
