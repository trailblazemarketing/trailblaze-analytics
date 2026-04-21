"""Anthropic wrapper that forces structured output via tool use.

We define one tool per pass, matching the Pydantic schema, and force the model
to call that tool — so the output is guaranteed to be schema-compliant JSON.
"""

from __future__ import annotations

from typing import Any, TypeVar

from anthropic import Anthropic
from pydantic import BaseModel

from trailblaze.config import settings
from trailblaze.parser.prompts import PASS1_SYSTEM, PASS2_SYSTEM
from trailblaze.parser.schemas import ClassificationOutput, ExtractionOutput

T = TypeVar("T", bound=BaseModel)

_MAX_PDF_TEXT_CHARS = 200_000  # truncate very long documents to keep token cost sane


def _client() -> Anthropic:
    if not settings.anthropic_api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and set it."
        )
    return Anthropic(api_key=settings.anthropic_api_key)


def _schema_for(model_cls: type[BaseModel]) -> dict[str, Any]:
    """Pydantic JSON schema adapted to Anthropic tool-use input_schema shape."""
    schema = model_cls.model_json_schema()
    schema.pop("$defs", None)  # inline definitions only; Anthropic accepts the raw schema either way
    return schema


def _call_tool(system: str, user_content: str, tool_name: str,
               tool_description: str, output_cls: type[T]) -> T:
    tool = {
        "name": tool_name,
        "description": tool_description,
        "input_schema": output_cls.model_json_schema(),
    }
    resp = _client().messages.create(
        model=settings.parser_model,
        max_tokens=8192,
        system=system,
        tools=[tool],
        tool_choice={"type": "tool", "name": tool_name},
        messages=[{"role": "user", "content": user_content}],
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
        system=PASS2_SYSTEM,
        user_content=context,
        tool_name="extract_content",
        tool_description="Return all extractable metrics and narratives from this PDF.",
        output_cls=ExtractionOutput,
    )
