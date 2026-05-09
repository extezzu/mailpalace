"""Protocol shared by all LLM providers.

Each adapter (Ollama, Anthropic, OpenAI) wraps its own SDK behind this single
Protocol so the rest of the codebase never imports a vendor library directly.
That means switching providers is a one-line change in settings, and adding a
new one means writing one file in :mod:`mailpalace.llm`.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Literal, Protocol, runtime_checkable

from pydantic import BaseModel


class LLMMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class LLMRequest(BaseModel):
    messages: list[LLMMessage]
    temperature: float = 0.2
    max_tokens: int = 800
    response_format: Literal["text", "json"] = "text"
    json_schema: dict | None = None


class LLMResponse(BaseModel):
    text: str
    provider: str  # 'ollama:llama3.1:8b'
    input_tokens: int | None = None
    output_tokens: int | None = None
    finish_reason: str = "stop"


@runtime_checkable
class LLMProvider(Protocol):
    name: str  # 'ollama' | 'anthropic' | 'openai'
    model: str

    async def complete(self, req: LLMRequest) -> LLMResponse: ...

    async def stream(self, req: LLMRequest) -> AsyncIterator[str]: ...

    async def health(self) -> bool: ...
