"""Per-email triage pipeline.

Detects the source language, asks the active LLM provider to classify the
message and produce a Russian summary plus a suggested next action, and
persists the result on :class:`AIMetadata` for the dashboard to render.
"""

from __future__ import annotations

import json
import logging
import re

from mailpalace.config import get_settings
from mailpalace.db.engine import session_scope
from mailpalace.db.repo import upsert_ai_metadata
from mailpalace.db.schema import Email
from mailpalace.llm.base import LLMMessage, LLMRequest
from mailpalace.llm.prompts import build_triage_prompt
from mailpalace.llm.router import get_router
from mailpalace.pipeline.language import detect_language

logger = logging.getLogger(__name__)

_CODE_FENCE_RE = re.compile(r"^\s*```(?:json)?\s*\n?(?P<body>.*?)\n?```\s*$", re.DOTALL | re.IGNORECASE)

_ALLOWED_CLASSIFICATIONS = {
    "urgent",
    "important",
    "newsletter",
    "promotion",
    "transactional",
    "spam",
    "other",
}

# Common LLM aliases, including Russian / Ukrainian / German equivalents the
# model sometimes returns when it forgets the "English-only" instruction.
_CLASSIFICATION_ALIASES = {
    "срочное": "urgent",
    "срочно": "urgent",
    "важное": "important",
    "важно": "important",
    "уведомление": "transactional",
    "квитанция": "transactional",
    "чек": "transactional",
    "квитанция/счет": "transactional",
    "рассылка": "newsletter",
    "дайджест": "newsletter",
    "промо": "promotion",
    "реклама": "promotion",
    "advertising": "promotion",
    "marketing": "promotion",
    "receipt": "transactional",
    "invoice": "transactional",
    "notification": "transactional",
    "digest": "newsletter",
}


def _normalise_classification(value: object) -> str:
    if not isinstance(value, str):
        return "other"
    key = value.strip().lower()
    if key in _ALLOWED_CLASSIFICATIONS:
        return key
    if key in _CLASSIFICATION_ALIASES:
        return _CLASSIFICATION_ALIASES[key]
    return "other"


async def triage_email(email_id: int) -> bool:
    """Run the triage pipeline against a single email. Returns True on success."""
    settings = get_settings()
    with session_scope() as session:
        email = session.get(Email, email_id)
        if email is None:
            return False
        body = email.body_text or email.snippet or ""
        language = detect_language(body)
        system, user = build_triage_prompt(
            from_name=email.from_name,
            from_email=email.from_email,
            subject=email.subject,
            received_at=email.received_at.isoformat(),
            body=body,
            summary_locale=settings.summary_locale,
            user_addressing=settings.user_addressing,
        )

    router = get_router()
    req = LLMRequest(
        messages=[
            LLMMessage(role="system", content=system),
            LLMMessage(role="user", content=user),
        ],
        response_format="json",
        temperature=0.1,
        max_tokens=400,
    )

    try:
        resp = await router.complete(req)
    except Exception as exc:  # noqa: BLE001
        logger.exception("triage LLM call failed for email %d", email_id)
        with session_scope() as session:
            upsert_ai_metadata(
                session,
                email_id,
                language_code=language,
                provider_used="error",
                error_message=str(exc)[:500],
                retry_count=1,
            )
        return False

    parsed = _parse_triage_response(resp.text, fallback_language=language)

    classification = _normalise_classification(parsed.get("classification"))
    with session_scope() as session:
        upsert_ai_metadata(
            session,
            email_id,
            language_code=parsed.get("language_code", language),
            classification=classification,
            classification_confidence=parsed.get("classification_confidence"),
            summary=parsed.get("summary") or parsed.get("summary_ru"),
            summary_locale=settings.summary_locale,
            suggested_action=parsed.get("suggested_action"),
            provider_used=resp.provider,
            model_version=resp.provider.split(":", 1)[-1] if ":" in resp.provider else None,
            error_message=None,
            retry_count=0,
        )
    return True


def _parse_triage_response(text: str, *, fallback_language: str) -> dict:
    """Decode the JSON triage payload, tolerating ```json fenced output.

    Returns a safe fallback shape on parse failure so a flaky LLM response
    cannot block the pipeline. The fallback retains the locally-detected
    language so we still index by language even when classification fails.
    """
    cleaned = text.strip()
    fenced = _CODE_FENCE_RE.match(cleaned)
    if fenced is not None:
        cleaned = fenced.group("body").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("triage response not JSON: %s", cleaned[:200])
        return {
            "language_code": fallback_language,
            "classification": "other",
            "classification_confidence": 0.0,
            "summary_ru": None,
            "suggested_action": None,
        }
