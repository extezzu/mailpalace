"""Prompt templates for triage and draft generation."""

from __future__ import annotations


_LANG_NAMES = {
    "en": "English",
    "ru": "Russian",
    "uk": "Ukrainian",
    "uk-surzhyk": "Ukrainian-Russian Surzhyk (mixed Ukrainian and Russian)",
    "pl": "Polish",
    "cs": "Czech",
    "sk": "Slovak",
    "hu": "Hungarian",
    "ro": "Romanian",
    "sl": "Slovenian",
    "et": "Estonian",
    "lv": "Latvian",
    "lt": "Lithuanian",
    "fi": "Finnish",
    "sv": "Swedish",
    "no": "Norwegian",
    "da": "Danish",
    "de": "German",
    "de-AT": "Austrian German",
    "de-CH": "Swiss German",
    "it": "Italian",
    "nl": "Dutch",
    "nl-BE": "Belgian Dutch (Flemish)",
    "lb": "Luxembourgish",
    "fr": "French",
    "es": "Spanish",
    "pt": "Portuguese",
}


def _addressing_clue(locale: str, addressing: str) -> str:
    if locale != "ru":
        return ""
    return " using 'ты' (informal)" if addressing == "ty" else " using 'вы' (formal)"


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


def build_triage_system(*, summary_locale: str, user_addressing: str) -> str:
    lang_name = _LANG_NAMES.get(summary_locale, summary_locale)
    addressing = _addressing_clue(summary_locale, user_addressing)
    return (
        "You are an email triage assistant. You analyze a single email and reply "
        "ONLY in JSON with the schema: "
        '{"language_code": "en|ru|uk|de|da|...", '
        '"classification": "urgent|important|newsletter|promotion|transactional|spam|other", '
        '"classification_confidence": 0.0-1.0, '
        f'"summary": "2-line {lang_name} summary written directly to the user{addressing}", '
        f'"suggested_action": "one short {lang_name} imperative"}}. '
        "No prose outside the JSON."
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
    summary_locale: str = "en",
    user_addressing: str = "ty",
) -> tuple[str, str]:
    system = build_triage_system(
        summary_locale=summary_locale, user_addressing=user_addressing
    )
    user = TRIAGE_USER_TEMPLATE.format(
        from_name=from_name or "(unknown sender)",
        from_email=from_email,
        subject=subject or "(no subject)",
        received_at=received_at,
        body=_truncate(body, 8000),
    )
    return system, user


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
