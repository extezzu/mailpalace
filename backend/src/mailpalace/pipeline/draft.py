"""Draft generation.

Produces a reply in the source language of the email. Tone is steerable via
free-form ``instructions``. The pipeline always goes through the configured
LLM provider; if every provider is unreachable, the router raises and the
caller surfaces an actionable error instead of inventing a stub.
"""

from __future__ import annotations

import logging

from mailpalace.db.engine import session_scope
from mailpalace.db.schema import Draft, Email
from mailpalace.llm.base import LLMMessage, LLMRequest
from mailpalace.llm.prompts import build_draft_prompt
from mailpalace.llm.router import get_router

logger = logging.getLogger(__name__)


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

    router = get_router()
    resp = await router.complete(req)

    with session_scope() as session:
        draft = Draft(
            email_id=email_id,
            body=resp.text.strip(),
            language_code=language,
            provider_used=resp.provider,
            instructions=instructions,
        )
        session.add(draft)
        session.flush()
        session.refresh(draft)
        return draft
