"""Test the JSON parser tolerates code-fence wrapping and bad output."""

from __future__ import annotations

from mailpalace.pipeline.triage import _parse_triage_response


def test_parses_clean_json() -> None:
    text = (
        '{"language_code": "en", "classification": "important", '
        '"classification_confidence": 0.9, '
        '"summary": "test", "suggested_action": "do it"}'
    )
    parsed = _parse_triage_response(text, fallback_language="en")
    assert parsed["classification"] == "important"
    assert parsed["summary"] == "test"


def test_strips_code_fence() -> None:
    text = '```json\n{"language_code": "ru", "classification": "newsletter"}\n```'
    parsed = _parse_triage_response(text, fallback_language="en")
    assert parsed["language_code"] == "ru"
    assert parsed["classification"] == "newsletter"


def test_falls_back_on_garbage() -> None:
    parsed = _parse_triage_response("not json at all", fallback_language="da")
    assert parsed["language_code"] == "da"
    assert parsed["classification"] == "other"
    assert parsed["classification_confidence"] == 0.0


def test_empty_response_returns_fallback() -> None:
    parsed = _parse_triage_response("", fallback_language="uk")
    assert parsed["language_code"] == "uk"
