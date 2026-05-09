"""Provider router. Holds configured providers, picks active one, circuit breaker."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import AsyncIterator

from mailpalace.config import get_settings
from mailpalace.llm.base import LLMProvider, LLMRequest, LLMResponse
from mailpalace.llm.ollama import OllamaProvider

logger = logging.getLogger(__name__)


@dataclass
class CircuitState:
    failures: int = 0
    last_failure_at: float = 0.0
    degraded: bool = False
    failure_window_s: float = 300.0  # 5 min
    threshold: int = 3

    def record_failure(self) -> None:
        now = time.time()
        if now - self.last_failure_at > self.failure_window_s:
            self.failures = 0
        self.failures += 1
        self.last_failure_at = now
        if self.failures >= self.threshold:
            self.degraded = True

    def record_success(self) -> None:
        self.failures = 0
        self.degraded = False


@dataclass
class Router:
    providers: dict[str, LLMProvider] = field(default_factory=dict)
    circuits: dict[str, CircuitState] = field(default_factory=dict)
    active: str = "ollama"
    fallback_chain: list[str] = field(default_factory=list)

    def register(self, provider: LLMProvider) -> None:
        self.providers[provider.name] = provider
        self.circuits[provider.name] = CircuitState()

    def _circuit(self, name: str) -> CircuitState:
        return self.circuits.setdefault(name, CircuitState())

    def get_active(self) -> LLMProvider:
        return self.providers[self.active]

    async def complete(self, req: LLMRequest) -> LLMResponse:
        chain = [self.active, *self.fallback_chain]
        last_exc: Exception | None = None

        for provider_name in chain:
            provider = self.providers.get(provider_name)
            if provider is None:
                continue
            circuit = self._circuit(provider_name)
            if circuit.degraded:
                logger.warning("Provider %s in degraded state, skipping", provider_name)
                continue
            try:
                resp = await provider.complete(req)
                circuit.record_success()
                return resp
            except Exception as exc:  # noqa: BLE001  (top-level boundary)
                last_exc = exc
                circuit.record_failure()
                logger.error("Provider %s failed: %s", provider_name, exc)
                continue

        raise RuntimeError(
            f"All providers in chain {chain} failed. Last error: {last_exc}"
        )

    async def stream(self, req: LLMRequest) -> AsyncIterator[str]:
        provider = self.get_active()
        async for tok in provider.stream(req):
            yield tok


_router: Router | None = None


def get_router() -> Router:
    global _router
    if _router is None:
        settings = get_settings()
        router = Router(
            active=settings.active_provider,
            fallback_chain=list(settings.fallback_chain),
        )
        router.register(OllamaProvider(settings.ollama_base_url, settings.ollama_model))
        if settings.anthropic_api_key:
            try:
                from mailpalace.llm.anthropic import AnthropicProvider

                router.register(
                    AnthropicProvider(settings.anthropic_api_key, settings.anthropic_model)
                )
            except ImportError:
                logger.info("anthropic SDK not installed; skipping provider")
        if settings.openai_api_key:
            try:
                from mailpalace.llm.openai import OpenAIProvider

                router.register(
                    OpenAIProvider(settings.openai_api_key, settings.openai_model)
                )
            except ImportError:
                logger.info("openai SDK not installed; skipping provider")
        _router = router
    return _router
