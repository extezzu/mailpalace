"""Unit tests for the Ollama provider — mocked httpx, no live model."""

from __future__ import annotations

import httpx
import pytest
import respx

from mailpalace.llm.base import LLMMessage, LLMRequest
from mailpalace.llm.ollama import OllamaProvider


@pytest.fixture
def ollama() -> OllamaProvider:
    return OllamaProvider("http://127.0.0.1:11434", "llama3.1:8b")


@pytest.mark.asyncio
async def test_complete_returns_text(ollama: OllamaProvider) -> None:
    with respx.mock(assert_all_called=False) as mock:
        mock.post("http://127.0.0.1:11434/api/chat").mock(
            return_value=httpx.Response(
                200,
                json={
                    "message": {"role": "assistant", "content": "hello world"},
                    "prompt_eval_count": 12,
                    "eval_count": 3,
                    "done_reason": "stop",
                },
            )
        )
        resp = await ollama.complete(
            LLMRequest(messages=[LLMMessage(role="user", content="hi")])
        )
    assert resp.text == "hello world"
    assert resp.provider == "ollama:llama3.1:8b"
    assert resp.input_tokens == 12
    assert resp.output_tokens == 3


@pytest.mark.asyncio
async def test_complete_json_mode_sets_format(ollama: OllamaProvider) -> None:
    with respx.mock(assert_all_called=True) as mock:
        route = mock.post("http://127.0.0.1:11434/api/chat").mock(
            return_value=httpx.Response(
                200, json={"message": {"content": "{}"}, "done_reason": "stop"}
            )
        )
        await ollama.complete(
            LLMRequest(
                messages=[LLMMessage(role="user", content="json please")],
                response_format="json",
            )
        )
        sent = route.calls.last.request.read()
        assert b'"format": "json"' in sent or b'"format":"json"' in sent


@pytest.mark.asyncio
async def test_health_returns_false_on_connection_error(ollama: OllamaProvider) -> None:
    with respx.mock() as mock:
        mock.get("http://127.0.0.1:11434/api/tags").mock(
            side_effect=httpx.ConnectError("refused")
        )
        ok = await ollama.health()
    assert ok is False


@pytest.mark.asyncio
async def test_health_returns_true_on_200(ollama: OllamaProvider) -> None:
    with respx.mock() as mock:
        mock.get("http://127.0.0.1:11434/api/tags").mock(
            return_value=httpx.Response(200, json={"models": []})
        )
        ok = await ollama.health()
    assert ok is True
