"""Router circuit breaker + fallback chain behaviour."""

from __future__ import annotations

from typing import AsyncIterator

import pytest

from mailpalace.llm.base import LLMRequest, LLMResponse
from mailpalace.llm.router import Router


class FakeProvider:
    def __init__(self, name: str, *, fail: bool = False) -> None:
        self.name = name
        self.model = "fake"
        self.fail = fail
        self.calls = 0

    async def complete(self, _req: LLMRequest) -> LLMResponse:
        self.calls += 1
        if self.fail:
            raise RuntimeError(f"{self.name} broken")
        return LLMResponse(text=f"hi from {self.name}", provider=self.name)

    async def stream(self, _req: LLMRequest) -> AsyncIterator[str]:  # pragma: no cover
        yield ""

    async def health(self) -> bool:
        return not self.fail


@pytest.mark.asyncio
async def test_active_provider_serves_request() -> None:
    router = Router(active="ollama", fallback_chain=[])
    router.register(FakeProvider("ollama"))
    resp = await router.complete(LLMRequest(messages=[]))
    assert resp.text == "hi from ollama"


@pytest.mark.asyncio
async def test_falls_back_when_active_fails_and_chain_set() -> None:
    router = Router(active="ollama", fallback_chain=["anthropic"])
    bad = FakeProvider("ollama", fail=True)
    good = FakeProvider("anthropic")
    router.register(bad)
    router.register(good)
    resp = await router.complete(LLMRequest(messages=[]))
    assert resp.provider == "anthropic"


@pytest.mark.asyncio
async def test_no_silent_fallback_when_chain_empty() -> None:
    router = Router(active="ollama", fallback_chain=[])
    bad = FakeProvider("ollama", fail=True)
    router.register(bad)
    with pytest.raises(RuntimeError, match="All providers"):
        await router.complete(LLMRequest(messages=[]))


@pytest.mark.asyncio
async def test_circuit_opens_after_three_failures() -> None:
    router = Router(active="ollama", fallback_chain=[])
    bad = FakeProvider("ollama", fail=True)
    router.register(bad)
    for _ in range(3):
        with pytest.raises(RuntimeError):
            await router.complete(LLMRequest(messages=[]))
    assert router.circuits["ollama"].degraded is True
