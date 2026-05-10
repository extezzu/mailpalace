"""Draft generation.

Produces a reply in the source language of the email. Tone is steerable via
free-form ``instructions``. When no LLM provider is reachable, falls back to
a templated stub so the demo never blocks on missing infrastructure.
"""

from __future__ import annotations

import logging

from mailpalace.db.engine import session_scope
from mailpalace.db.schema import Draft, Email
from mailpalace.llm.base import LLMMessage, LLMRequest
from mailpalace.llm.prompts import build_draft_prompt
from mailpalace.llm.router import get_router

logger = logging.getLogger(__name__)


_FALLBACK_GREETING = {
    "en": "Hi",
    "ru": "Привет",
    "uk": "Привіт",
    "da": "Hej",
    "de": "Hallo",
    "fr": "Bonjour",
    "es": "Hola",
    "it": "Ciao",
    "pl": "Cześć",
    "pt": "Olá",
    "nl": "Hallo",
    "sv": "Hej",
    "no": "Hei",
    "fi": "Hei",
    "cs": "Ahoj",
    "sk": "Ahoj",
    "hu": "Szia",
    "ro": "Bună",
}

_FALLBACK_BODY = {
    "en": "Thanks for reaching out about \"{subject}\". I will look at this in detail and reply by EOD. Quick question: is there a hard deadline I should know about?\n\nBest,\nDmytro",
    "ru": "Спасибо, что написал про «{subject}». Гляну подробно и отвечу до конца дня. Уточняющий вопрос: есть жёсткий дедлайн, про который мне стоит знать?\n\nС уважением,\nДмитрий",
    "uk": "Дякую, що написав про «{subject}». Подивлюся детально і відповім до кінця дня. Уточнення: чи є жорсткий дедлайн, який варто пам'ятати?\n\nЗ повагою,\nДмитро",
    "da": "Tak for din mail om \"{subject}\". Jeg ser nærmere på det og vender tilbage inden dagens slutning. Hurtigt spørgsmål: er der en hård deadline, jeg skal kende?\n\nMvh,\nDmytro",
}


def _fallback_draft(language: str, subject: str | None) -> str:
    lang_key = language if language in _FALLBACK_BODY else "en"
    greet = _FALLBACK_GREETING.get(lang_key, "Hi")
    body = _FALLBACK_BODY.get(lang_key, _FALLBACK_BODY["en"]).format(
        subject=subject or "your email"
    )
    return f"{greet},\n\n{body}"


async def generate_draft(email_id: int, instructions: str | None = None) -> Draft | None:
    with session_scope() as session:
        email = session.get(Email, email_id)
        if email is None:
            return None
        ai = email.ai
        language = (ai.language_code if ai else None) or "en"
        from_name = email.from_name
        from_email = email.from_email
        subject = email.subject
        body = email.body_text or email.snippet or ""

    system, user = build_draft_prompt(
        from_name=from_name,
        from_email=from_email,
        subject=subject,
        body=body,
        language=language,
        instructions=instructions,
    )
    req = LLMRequest(
        messages=[
            LLMMessage(role="system", content=system),
            LLMMessage(role="user", content=user),
        ],
        temperature=0.4,
        max_tokens=600,
    )

    try:
        router = get_router()
        resp = await router.complete(req)
        draft_body = resp.text.strip()
        provider_used = resp.provider
    except RuntimeError as exc:
        logger.warning("LLM unavailable, returning templated fallback: %s", exc)
        draft_body = _fallback_draft(language, subject)
        provider_used = "demo:fallback"

    with session_scope() as session:
        draft = Draft(
            email_id=email_id,
            body=draft_body,
            language_code=language,
            provider_used=provider_used,
            instructions=instructions,
        )
        session.add(draft)
        session.flush()
        session.refresh(draft)
        return draft
