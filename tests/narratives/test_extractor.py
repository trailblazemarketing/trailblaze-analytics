"""Unit tests for verification + number-token extraction.

The extractor itself makes LLM calls and is exercised via fixture runs in
the CLI dry-run; these tests cover the deterministic guardrail layer —
verifying that verified_number_match computes correctly.
"""

from __future__ import annotations

from decimal import Decimal

from trailblaze.narratives.extractor import (
    _number_tokens,
    _verify_value_present,
)


def test_number_tokens_handles_commas() -> None:
    assert 3794.0 in _number_tokens("Revenue was $3,794M in Q3")


def test_number_tokens_handles_decimal_billions() -> None:
    assert 3.79 in _number_tokens("Revenue was $3.79B")


def test_number_tokens_drops_bare_year() -> None:
    nums = _number_tokens("reported Q3 2025 results")
    assert 2025 not in nums


def test_number_tokens_keeps_year_when_immediately_adjacent() -> None:
    # Year-looking token adjacent to currency symbol is retained (2-char
    # lookback window catches it). Non-immediate cases are dropped —
    # benign because target values are never bare years.
    nums = _number_tokens("earned $2025 in one quarter")
    assert 2025 in nums


def test_verify_passes_on_exact_match() -> None:
    assert _verify_value_present(
        "Group revenue of 3.79B USD", Decimal("3.79"), "billions"
    )


def test_verify_passes_on_scale_swap() -> None:
    # DB stores 3.79 billions, prose writes "3,794m" — ±2% rounds close.
    assert _verify_value_present(
        "Group revenue was $3,794m in Q3", Decimal("3.79"), "billions"
    )


def test_verify_passes_within_tolerance() -> None:
    # 303.7 stored; prose rounded to 304 (within 2%).
    assert _verify_value_present(
        "Revenue of 304 million in Q2", Decimal("303.7"), "millions"
    )


def test_verify_fails_outside_tolerance() -> None:
    # 303.7 stored; prose has 350 (not within 2%).
    assert not _verify_value_present(
        "Revenue of 350 million in Q2", Decimal("303.7"), "millions"
    )


def test_verify_fails_on_unrelated_text() -> None:
    assert not _verify_value_present(
        "The company opened offices in 5 countries",
        Decimal("303.7"), "millions",
    )
