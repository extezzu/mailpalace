"""Prompt templates for triage, draft, classify."""

from __future__ import annotations


TRIAGE_SYSTEM = (
    "You are an email triage assistant. You analyze a single email and reply ONLY in JSON "
    "with the schema: {\"language_code\": \"en|ru|uk|de|da|...\", "
    "\"classification\": \"urgent|important|newsletter|promotion|transactional|spam|other\", "
    "\"classification_confidence\": 0.0-1.0, "
    "\"summary_ru\": \"2-line Russian summary written directly to the user using 'ты'\", "
    "\"suggested_action\": \"one short Russian imperative\"}. "
    "No prose outside the JSON."
)

TRIAGE_USER_TEMPLATE = (
    "Email metadata:\n"
    "From: {from_name} <{from_email}>\n"
    "Subject: {subject}\n"
    "Received: {received_at}\n\n"
    "Body (truncated to 8k chars):\n"
    "---\n"
    "{body}\n"
    "---"
)


DRAFT_SYSTEM = (
    "You write a single email reply. Match the language of the incoming email exactly. "
    "Match the tone the user requests (default: same register as the incoming email). "
    "Output the reply body only — no subject line, no signature placeholder, no markdown."
)

DRAFT_USER_TEMPLATE = (
    "Incoming email from {from_name} <{from_email}>:\n"
    "Subject: {subject}\n"
    "Language: {language}\n"
    "---\n"
    "{body}\n"
    "---\n\n"
    "User instructions for the draft: {instructions}\n"
    "Reply in {language}."
)


def build_triage_prompt(
    *,
    from_name: str | None,
    from_email: str,
    subject: str | None,
    received_at: str,
    body: str,
) -> tuple[str, str]:
    user = TRIAGE_USER_TEMPLATE.format(
        from_name=from_name or "(unknown sender)",
        from_email=from_email,
        subject=subject or "(no subject)",
        received_at=received_at,
        body=_truncate(body, 8000),
    )
    return TRIAGE_SYSTEM, user


def build_draft_prompt(
    *,
    from_name: str | None,
    from_email: str,
    subject: str | None,
    body: str,
    language: str,
    instructions: str | None,
) -> tuple[str, str]:
    user = DRAFT_USER_TEMPLATE.format(
        from_name=from_name or "(unknown sender)",
        from_email=from_email,
        subject=subject or "(no subject)",
        language=language,
        body=_truncate(body, 6000),
        instructions=instructions or "neutral, polite, concise",
    )
    return DRAFT_SYSTEM, user


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    head = text[: limit - 1500]
    tail = text[-1500:]
    return f"{head}\n[... truncated ...]\n{tail}"
