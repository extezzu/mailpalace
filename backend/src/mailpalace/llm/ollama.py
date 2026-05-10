"""Ollama provider.

The default LLM. Talks to a local Ollama daemon on ``127.0.0.1:11434``
via the OpenAI-compatible chat completions endpoint at ``/api/chat``.
Pick the model in settings via ``MAILPALACE_OLLAMA_MODEL``.

Why a sync httpx.Client + asyncio.to_thread instead of AsyncClient
=================================================================
The OAuth wizard launches the first ingest in a daemon
``threading.Thread`` running ``asyncio.run(ingest_account)``. When
that thread exits, its event loop is destroyed. A module-level
``httpx.AsyncClient`` would be permanently bound to that dead loop
and every subsequent triage call from ANY thread (background poller,
a second account, retriage) would die with "Event loop is closed".

A sync ``httpx.Client`` is loop-agnostic and thread-safe enough for
our use (httpx documents the Client as safe for concurrent reads
within the same process). We push the blocking POST into a worker
thread via ``asyncio.to_thread`` so the calling event loop stays
responsive. This is the same pattern the IMAP source uses for its
imaplib calls.
"""

from __future__ import annotations

import asyncio
import json
import threading
from collections.abc import AsyncIterator

import httpx

from mailpalace.llm.base import LLMRequest, LLMResponse


class OllamaProvider:
    name = "ollama"

    def __init__(self, base_url: str, model: str, timeout_s: float = 60.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._timeout = timeout_s
        # Lazy + lock so concurrent triage tasks don't each spin up
        # their own pool the first time the provider is hit.
        self._client: httpx.Client | None = None
        self._client_lock = threading.Lock()

    def _get_client(self) -> httpx.Client:
        if self._client is None:
            with self._client_lock:
                if self._client is None:
                    self._client = httpx.Client(
                        base_url=self.base_url, timeout=self._timeout
                    )
        return self._client

    def _post_chat_blocking(self, payload: dict) -> dict:
        client = self._get_client()
        resp = client.post("/api/chat", json=payload)
        resp.raise_for_status()
        return resp.json()

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

        body = await asyncio.to_thread(self._post_chat_blocking, payload)
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

        # Keep streaming on the event loop's executor so cancellation
        # bubbles up cleanly. Each yielded chunk is a single line of
        # JSON from the SSE-ish Ollama stream.
        def _iter_stream() -> list[str]:
            client = self._get_client()
            with client.stream("POST", "/api/chat", json=payload) as resp:
                resp.raise_for_status()
                chunks: list[str] = []
                for line in resp.iter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    content = chunk.get("message", {}).get("content")
                    if content:
                        chunks.append(content)
                    if chunk.get("done"):
                        break
                return chunks

        chunks = await asyncio.to_thread(_iter_stream)
        for chunk in chunks:
            yield chunk

    async def health(self) -> bool:
        def _check() -> bool:
            try:
                resp = self._get_client().get("/api/tags", timeout=5.0)
                return resp.status_code == 200
            except httpx.HTTPError:
                return False

        return await asyncio.to_thread(_check)

    async def close(self) -> None:
        client = self._client
        self._client = None
        if client is not None:
            await asyncio.to_thread(client.close)
