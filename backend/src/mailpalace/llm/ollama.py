"""Ollama provider.

The default LLM. Talks to a local Ollama daemon on ``127.0.0.1:11434`` via
the OpenAI-compatible chat completions endpoint at ``/api/chat``. Pick the
model in settings via ``MAILPALACE_OLLAMA_MODEL``.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from mailpalace.llm.base import LLMRequest, LLMResponse


class OllamaProvider:
    name = "ollama"

    def __init__(self, base_url: str, model: str, timeout_s: float = 60.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._client = httpx.AsyncClient(base_url=self.base_url, timeout=timeout_s)

    async def complete(self, req: LLMRequest) -> LLMResponse:
        payload: dict = {
            "model": self.model,
            "messages": [m.model_dump() for m in req.messages],
            "stream": False,
            "options": {
                "temperature": req.temperature,
                "num_predict": req.max_tokens,
            },
        }
        if req.response_format == "json":
            payload["format"] = "json"

        resp = await self._client.post("/api/chat", json=payload)
        resp.raise_for_status()
        body = resp.json()
        message = body.get("message", {})
        return LLMResponse(
            text=message.get("content", ""),
            provider=f"ollama:{self.model}",
            input_tokens=body.get("prompt_eval_count"),
            output_tokens=body.get("eval_count"),
            finish_reason=body.get("done_reason", "stop"),
        )

    async def stream(self, req: LLMRequest) -> AsyncIterator[str]:
        payload: dict = {
            "model": self.model,
            "messages": [m.model_dump() for m in req.messages],
            "stream": True,
            "options": {
                "temperature": req.temperature,
                "num_predict": req.max_tokens,
            },
        }
        async with self._client.stream("POST", "/api/chat", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    continue
                msg = chunk.get("message", {})
                content = msg.get("content")
                if content:
                    yield content
                if chunk.get("done"):
                    break

    async def health(self) -> bool:
        try:
            resp = await self._client.get("/api/tags", timeout=5.0)
            return resp.status_code == 200
        except httpx.HTTPError:
            return False

    async def close(self) -> None:
        await self._client.aclose()
