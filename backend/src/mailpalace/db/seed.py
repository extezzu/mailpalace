"""Insert ten illustrative emails so the dashboard has something to render
before any real Gmail or IMAP account is connected.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select

from mailpalace.config import get_settings
from mailpalace.db.engine import init_db, session_scope
from mailpalace.db.repo import (
    insert_email_if_new,
    upsert_ai_metadata,
    upsert_thread,
)
from mailpalace.db.schema import Account, Email

logger = logging.getLogger(__name__)


# The same demo set is mirrored in the frontend's lib/mock-data.ts so the UI
# can render before the backend is reachable. Keep the two in sync.
DEMO_EMAILS: list[dict[str, Any]] = [
    {
        "from_name": "Anna Mortensen",
        "from_email": "anna.mortensen@nordpay.dk",
        "subject": "Final review of the integration spec — needed by Tuesday",
        "snippet": "Hi Dmytro, the security team flagged two open questions on the webhook signing flow...",
        "body_text": (
            "Hi Dmytro,\n\nThe security team flagged two open questions on the webhook signing "
            "flow we discussed last Thursday. Could you put together a one-pager addressing "
            "both points by Tuesday EOD? The board review is Wednesday morning and we need "
            "this signed off before then.\n\nThanks,\nAnna"
        ),
        "language": "en",
        "classification": "urgent",
        "confidence": 0.94,
        "summary_ru": "Анна из NordPay просит однопэйджер по двум вопросам безопасности вебхуков до вторника. Совет директоров в среду.",
        "suggested_action": "Ответить с черновиком документа до вторника, 18:00.",
        "ago_minutes": 22,
        "is_unread": True,
    },
    {
        "from_name": "GitHub",
        "from_email": "noreply@github.com",
        "subject": "[anthropics/claude-code] PR #1842: Add retry logic to token refresh",
        "snippet": "@sven-rasmussen requested your review on PR #1842. 14 files changed, +312 -47.",
        "body_text": (
            "@sven-rasmussen requested your review on this pull request.\n\n"
            "PR #1842: Add retry logic to token refresh\n"
            "14 files changed, +312 -47\n\n"
            "View on GitHub: https://github.com/anthropics/claude-code/pull/1842"
        ),
        "language": "en",
        "classification": "important",
        "confidence": 0.88,
        "summary_ru": "Свен попросил тебя ревью на PR #1842. Логика ретраев для refresh токена. 14 файлов.",
        "suggested_action": "Открыть PR и оставить ревью в течение 48 часов.",
        "ago_minutes": 95,
        "is_unread": True,
    },
    {
        "from_name": "Олександр Шевченко",
        "from_email": "alex.shevchenko@kyivlabs.ua",
        "subject": "Можемо обговорити твій MCP сервер?",
        "snippet": "Привіт! Бачив твій PolyPalace на GitHub. У нас в команді є кілька питань...",
        "body_text": (
            "Привіт, Дмитро!\n\nБачив твій PolyPalace на GitHub — крута робота. У нас "
            "в команді на цьому тижні запускаємо схожий проект і є кілька питань. "
            "Можемо коротко на 20 хвилин у п'ятницю?\n\nДякую,\nОлександр"
        ),
        "language": "uk",
        "classification": "important",
        "confidence": 0.81,
        "summary_ru": "Олександр з KyivLabs хочет 20-минутный созвон в пятницу про твой PolyPalace MCP.",
        "suggested_action": "Предложить три временных слота на пятницу.",
        "ago_minutes": 240,
        "is_unread": True,
    },
    {
        "from_name": "Stripe",
        "from_email": "receipts@stripe.com",
        "subject": "Your invoice from Anthropic — $24.18 USD",
        "snippet": "Anthropic has sent you a receipt. Total: $24.18 USD on May 9, 2026.",
        "body_text": (
            "Anthropic has sent you a receipt for $24.18 USD on May 9, 2026.\n\n"
            "Description: Claude API usage (April 2026)\n"
            "Card: Visa ending in 4218\n\n"
            "View invoice: https://invoice.stripe.com/i/abc123"
        ),
        "language": "en",
        "classification": "transactional",
        "confidence": 0.97,
        "summary_ru": "Чек от Anthropic на $24.18 за апрельский Claude API. Карта 4218.",
        "suggested_action": "Ничего не требуется. Архивировать.",
        "ago_minutes": 380,
        "is_unread": False,
    },
    {
        "from_name": "Вечерний разработчик",
        "from_email": "newsletter@dev-vechera.ru",
        "subject": "Дайджест 9 мая: что обсуждают в мире AI инфраструктуры",
        "snippet": "Подборка статей за неделю: Anthropic запускает MCP 2.0, OpenRouter поднимает...",
        "body_text": (
            "Привет!\n\nПодборка статей за прошедшую неделю:\n\n"
            "1. Anthropic запускает MCP 2.0 со streaming.\n"
            "2. OpenRouter поднимает раунд $50M.\n"
            "3. Cursor добавляет inline tool calls.\n"
            "4. Discussion: где границы автономности AI агентов.\n"
        ),
        "language": "ru",
        "classification": "newsletter",
        "confidence": 0.99,
        "summary_ru": "Дайджест AI инфры. MCP 2.0 от Anthropic — стоит проверить если расширяешь PolyPalace.",
        "suggested_action": "Сохранить ссылку на MCP 2.0 анонс. Остальное архивировать.",
        "ago_minutes": 540,
        "is_unread": True,
    },
    {
        "from_name": "Hacker News Daily",
        "from_email": "digest@hnrss.org",
        "subject": "Top 10 stories — Show HN: I built an email AI agent in a weekend",
        "snippet": "Show HN: I built an email AI agent in a weekend (847 points, 234 comments)...",
        "body_text": (
            "Top 10 stories from Hacker News for Saturday May 9:\n\n"
            "1. Show HN: I built an email AI agent in a weekend (847 points)\n"
            "2. The hidden costs of LLM APIs (612 points)\n"
            "3. Postgres 18 release notes (445 points)\n"
            "4. ..."
        ),
        "language": "en",
        "classification": "newsletter",
        "confidence": 0.99,
        "summary_ru": "HN дайджест. Топ — кто-то зашипил email AI агента за выходные. 847 points. Конкурент?",
        "suggested_action": "Прочитать первый стори на HN — релевантно нашему проекту.",
        "ago_minutes": 720,
        "is_unread": True,
    },
    {
        "from_name": "Skat.dk",
        "from_email": "noreply@skat.dk",
        "subject": "Din årsopgørelse for 2025 er klar",
        "snippet": "Hej Dmytro, din årsopgørelse for indkomståret 2025 er nu tilgængelig...",
        "body_text": (
            "Hej Dmytro,\n\nDin årsopgørelse for indkomståret 2025 er nu tilgængelig "
            "i TastSelv. Log ind på skat.dk for at se opgørelsen og eventuelle "
            "rettelser.\n\nMed venlig hilsen,\nSkattestyrelsen"
        ),
        "language": "da",
        "classification": "important",
        "confidence": 0.92,
        "summary_ru": "Скат.дк: твоя налоговая декларация за 2025 готова. Зайти в TastSelv проверить.",
        "suggested_action": "Открыть skat.dk на следующей неделе и проверить.",
        "ago_minutes": 900,
        "is_unread": True,
    },
    {
        "from_name": "Notion",
        "from_email": "team@notion.so",
        "subject": "Your weekly digest: 14 pages updated",
        "snippet": "Here is what changed in your workspace this week. 14 pages were updated...",
        "body_text": (
            "Your Notion workspace activity for the past week:\n\n"
            "- 14 pages updated\n"
            "- 3 new comments on \"Q2 product roadmap\"\n"
            "- 2 page templates created"
        ),
        "language": "en",
        "classification": "newsletter",
        "confidence": 0.98,
        "summary_ru": "Notion недельный дайджест. 14 страниц, 3 комментария на Q2 роадмап.",
        "suggested_action": "Архивировать. Проверить комментарии в Notion напрямую.",
        "ago_minutes": 1100,
        "is_unread": False,
    },
    {
        "from_name": "Linear",
        "from_email": "no-reply@linear.app",
        "subject": "MAIL-12: New issue assigned to you",
        "snippet": "MAIL-12: \"Add Russian draft generation\" assigned to dmytro by sven-rasmussen.",
        "body_text": (
            "Issue: MAIL-12\n"
            "Title: Add Russian draft generation\n"
            "Status: Todo\n"
            "Assignee: dmytro\n"
            "Reporter: sven-rasmussen\n"
            "Priority: Medium\n\n"
            "Description: When user receives Russian email, draft generator should "
            "produce a Russian reply. Currently always English."
        ),
        "language": "en",
        "classification": "important",
        "confidence": 0.86,
        "summary_ru": "Linear: новая задача MAIL-12 на тебя. Драфты на русском когда исходник на русском.",
        "suggested_action": "Принять задачу или попросить уточнения у Свена.",
        "ago_minutes": 1500,
        "is_unread": False,
    },
    {
        "from_name": "Klarna",
        "from_email": "info@klarna.dk",
        "subject": "Spar 30% hos H&M denne uge",
        "snippet": "Du har en eksklusiv rabat hos H&M frem til søndag. Brug koden KLARNA30...",
        "body_text": (
            "Hej Dmytro!\n\nSpar 30% hos H&M denne uge når du betaler med Klarna. "
            "Tilbuddet gælder til og med søndag aften."
        ),
        "language": "da",
        "classification": "promotion",
        "confidence": 0.99,
        "summary_ru": "Кларна реклама H&M. Можно архивировать.",
        "suggested_action": "Архивировать.",
        "ago_minutes": 1800,
        "is_unread": True,
    },
]


def seed_demo_data() -> int:
    """Insert demo emails. Idempotent: a second run is a no-op."""
    init_db()
    now = datetime.now(tz=timezone.utc)

    with session_scope() as session:
        existing = session.scalar(
            select(Account).where(Account.email_address == "demo@mailpalace.local")
        )
        if existing is None:
            account = Account(
                kind="imap",
                label="Demo inbox",
                email_address="demo@mailpalace.local",
                config_json={"demo": True},
                last_synced_at=now,
                last_sync_state="demo:0",
                is_active=True,
            )
            session.add(account)
            session.flush()
        else:
            account = existing

        for idx, payload in enumerate(DEMO_EMAILS):
            received = now - timedelta(minutes=payload["ago_minutes"])
            thread = upsert_thread(
                session,
                account_id=account.id,
                provider_thread_id=f"demo-thread-{idx}",
                subject=payload["subject"],
                participants=[
                    {"name": payload["from_name"], "email": payload["from_email"]},
                    {"name": "Dmytro", "email": "demo@mailpalace.local"},
                ],
                last_message_at=received,
            )
            email = Email(
                account_id=account.id,
                thread_id=thread.id,
                provider_msg_id=f"demo-msg-{idx}",
                rfc822_message_id=f"<demo-{idx}@mailpalace.local>",
                from_name=payload["from_name"],
                from_email=payload["from_email"],
                to_json=[{"name": "Dmytro", "email": "demo@mailpalace.local"}],
                cc_json=None,
                subject=payload["subject"],
                snippet=payload["snippet"],
                body_text=payload["body_text"],
                body_html=None,
                received_at=received,
                raw_size_bytes=len(payload["body_text"]),
                is_unread=payload["is_unread"],
                is_starred=False,
                has_attachments=False,
            )
            inserted = insert_email_if_new(session, email)
            if inserted is None:
                continue
            upsert_ai_metadata(
                session,
                inserted.id,
                language_code=payload["language"],
                classification=payload["classification"],
                classification_confidence=payload["confidence"],
                summary_ru=payload["summary_ru"],
                suggested_action=payload["suggested_action"],
                provider_used="demo:seed",
                model_version="seed-1",
                error_message=None,
                retry_count=0,
            )

    logger.info(
        "seeded %d demo emails into %s",
        len(DEMO_EMAILS),
        get_settings().db_path,
    )
    return 0
