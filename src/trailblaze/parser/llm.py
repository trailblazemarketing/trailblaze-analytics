"""Anthropic wrapper that forces structured output via tool use.

We define one tool per pass, matching the Pydantic schema, and force the model
to call that tool — so the output is guaranteed to be schema-compliant JSON.
"""

from __future__ import annotations

import os
import threading
import time
from typing import Any, TypeVar

from anthropic import Anthropic
from pydantic import BaseModel

from trailblaze.config import settings
from trailblaze.db.session import session_scope
from trailblaze.parser.prompts import PASS1_SYSTEM, build_pass2_system
from trailblaze.parser.schemas import ClassificationOutput, ExtractionOutput

T = TypeVar("T", bound=BaseModel)

_MAX_PDF_TEXT_CHARS = 200_000  # truncate very long documents to keep token cost sane


_PRE_CALL_DELAY_S = float(os.getenv("TRAILBLAZE_LLM_PRE_CALL_DELAY_S", "0"))
_MAX_RETRIES = int(os.getenv("TRAILBLAZE_LLM_MAX_RETRIES", "2"))


# Pass-2 system prompt is built from DB state (metrics / aliases / periods).
# Cache once per process; call reset_prompt_cache() after seed changes.
_pass2_system_cache: str | None = None
_pass2_cache_lock = threading.Lock()


def _get_pass2_system() -> str:
    global _pass2_system_cache
    if _pass2_system_cache is not None:
        return _pass2_system_cache
    with _pass2_cache_lock:
        if _pass2_system_cache is None:
            with session_scope() as s:
                _pass2_system_cache = build_pass2_system(s)
    return _pass2_system_cache


def reset_prompt_cache() -> None:
    """Force the next extract() call to rebuild the pass-2 system prompt.
    Call this after seeding new metrics/aliases/periods in the same process."""
    global _pass2_system_cache
    with _pass2_cache_lock:
        _pass2_system_cache = None


def _client() -> Anthropic:
    if not settings.anthropic_api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and set it."
        )
    # max_retries: SDK handles 429/5xx with exponential backoff + Retry-After.
    return Anthropic(api_key=settings.anthropic_api_key, max_retries=_MAX_RETRIES)


def _schema_for(model_cls: type[BaseModel]) -> dict[str, Any]:
    """Pydantic JSON schema adapted to Anthropic tool-use input_schema shape."""
    schema = model_cls.model_json_schema()
    schema.pop("$defs", None)  # inline definitions only; Anthropic accepts the raw schema either way
    return schema


def _call_tool(system: str, user_content: str, tool_name: str,
               tool_description: str, output_cls: type[T],
               max_tokens: int = 8192) -> T:
    tool = {
        "name": tool_name,
        "description": tool_description,
        "input_schema": output_cls.model_json_schema(),
    }
    # Per-call delay throttles concurrent worker fan-out (env-configurable).
    if _PRE_CALL_DELAY_S > 0:
        time.sleep(_PRE_CALL_DELAY_S)
    # Stream to stay within SDK timeout rules when max_tokens is large.
    with _client().messages.stream(
        model=settings.parser_model,
        max_tokens=max_tokens,
        system=system,
        tools=[tool],
        tool_choice={"type": "tool", "name": tool_name},
        messages=[{"role": "user", "content": user_content}],
    ) as stream:
        resp = stream.get_final_message()
    # Silent truncation would validate to defaults (empty lists) — reject it explicitly.
    if resp.stop_reason == "max_tokens":
        raise RuntimeError(
            f"Tool {tool_name!r} output truncated at max_tokens={max_tokens}. "
            f"Raise max_tokens or shorten the input."
        )
    for block in resp.content:
        if getattr(block, "type", None) == "tool_use" and block.name == tool_name:
            return output_cls.model_validate(block.input)
    raise RuntimeError(f"Model did not call tool {tool_name!r}. stop_reason={resp.stop_reason}")


def _truncate(text: str) -> str:
    if len(text) <= _MAX_PDF_TEXT_CHARS:
        return text
    head = text[: _MAX_PDF_TEXT_CHARS // 2]
    tail = text[-_MAX_PDF_TEXT_CHARS // 2 :]
    return head + "\n\n…[truncated]…\n\n" + tail


def classify(pdf_text: str) -> ClassificationOutput:
    return _call_tool(
        system=PASS1_SYSTEM,
        user_content=f"<pdf_text>\n{_truncate(pdf_text)}\n</pdf_text>",
        tool_name="classify_document",
        tool_description="Return structured metadata about this Trailblaze PDF.",
        output_cls=ClassificationOutput,
    )


def extract(pdf_text: str, classification: ClassificationOutput) -> ExtractionOutput:
    context = (
        f"<classification>\n{classification.model_dump_json(indent=2)}\n</classification>\n\n"
        f"<pdf_text>\n{_truncate(pdf_text)}\n</pdf_text>"
    )
    return _call_tool(
        system=_get_pass2_system(),
        user_content=context,
        tool_name="extract_content",
        tool_description="Return all extractable metrics and narratives from this PDF.",
        output_cls=ExtractionOutput,
        max_tokens=128000,  # Opus 4.7 synchronous Messages API ceiling
    )
