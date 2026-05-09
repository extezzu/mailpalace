"use client";

import { useMemo, useState } from "react";
import { EmailListItem as EmailRow } from "@/components/email/EmailListItem";
import { FilterBar, type Filter } from "@/components/email/FilterBar";
import { Sidebar } from "@/components/email/Sidebar";
import { ThreadViewer } from "@/components/email/ThreadViewer";
import { AiMetaSidebar } from "@/components/email/AiMetaSidebar";
import { EmptyState } from "@/components/ui/EmptyState";
import { MOCK_EMAILS } from "@/lib/mock-data";
import type { Classification } from "@/lib/types";

const BODIES: Record<number, string> = {
  1:
    "Hi Dmytro,\n\n" +
    "The security team flagged two open questions on the webhook signing flow we discussed last Thursday. Could you put together a one-pager addressing both points by Tuesday EOD? The board review is Wednesday morning and we need this signed off before then.\n\n" +
    "Specifically:\n" +
    "1. Are we rotating the signing secret on a fixed schedule, or only on compromise events?\n" +
    "2. What's the upgrade path if we deprecate v1 of the signature algorithm?\n\n" +
    "If you need the security team's notes, I can forward them. Otherwise, your call.\n\n" +
    "Thanks,\nAnna",
  2:
    "@sven-rasmussen requested your review on this pull request.\n\n" +
    "PR #1842: Add retry logic to token refresh\n" +
    "14 files changed, +312 -47\n\n" +
    "Description:\n" +
    "Adds exponential backoff to the OAuth token refresh path in handlers/auth/refresh.ts. Previously, a single 5xx from the upstream caused users to be silently signed out — this PR retries up to 3 times with jitter before surfacing the error.\n\n" +
    "Tests: included. Manual QA: tested against staging with simulated 502s.\n\n" +
    "View on GitHub: https://github.com/anthropics/claude-code/pull/1842",
  3:
    "Привіт, Дмитро!\n\n" +
    'Бачив твій PolyPalace на GitHub — крута робота. У нас в команді на цьому тижні запускаємо схожий проект (memory layer для Claude Desktop поверх Notion + Linear) і є кілька питань. Можемо коротко на 20 хвилин у п\'ятницю?\n\n' +
    "Зокрема цікавлять:\n" +
    "1. Як ти вирішив питання permissions при доступі до приватних репозиторіїв?\n" +
    "2. Як виглядає твій reranking pipeline на 50k+ векторів?\n\n" +
    "Дякую,\nОлександр",
  4:
    "Anthropic has sent you a receipt for $24.18 USD on May 9, 2026.\n\n" +
    "Description: Claude API usage (April 2026)\n" +
    "Card: Visa ending in 4218\n\n" +
    "View invoice: https://invoice.stripe.com/i/abc123",
  5:
    "Привет!\n\n" +
    "Подборка статей за прошедшую неделю:\n\n" +
    "1. Anthropic запускает MCP 2.0 со streaming.\n" +
    "2. OpenRouter поднимает раунд $50M.\n" +
    "3. Cursor добавляет inline tool calls.\n" +
    "4. Discussion: где границы автономности AI агентов.\n\n" +
    "Полные ссылки внутри.",
  6:
    "Top 10 stories from Hacker News for Saturday May 9:\n\n" +
    "1. Show HN: I built an email AI agent in a weekend (847 points)\n" +
    "2. The hidden costs of LLM APIs (612 points)\n" +
    "3. Postgres 18 release notes (445 points)\n" +
    "4. ...",
  7:
    "Hej Dmytro,\n\n" +
    "Din årsopgørelse for indkomståret 2025 er nu tilgængelig i TastSelv. Log ind på skat.dk for at se opgørelsen og eventuelle rettelser.\n\n" +
    "Med venlig hilsen,\nSkattestyrelsen",
  8:
    "Your Notion workspace activity for the past week:\n\n" +
    "- 14 pages updated\n" +
    "- 3 new comments on \"Q2 product roadmap\"\n" +
    "- 2 page templates created",
  9:
    "Issue: MAIL-12\n" +
    "Title: Add Russian draft generation\n" +
    "Status: Todo\n" +
    "Assignee: dmytro\n" +
    "Reporter: sven-rasmussen\n" +
    "Priority: Medium\n\n" +
    "Description: When user receives Russian email, draft generator should produce a Russian reply. Currently always English.",
  10:
    "Hej Dmytro!\n\n" +
    "Spar 30% hos H&M denne uge når du betaler med Klarna. Tilbuddet gælder til og med søndag aften.",
};

export default function HomePage() {
  const [activeFilter, setActiveFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(MOCK_EMAILS[0]?.id ?? null);

  const filtered = useMemo(() => {
    if (activeFilter === "all") return MOCK_EMAILS;
    return MOCK_EMAILS.filter((e) => e.ai?.classification === activeFilter);
  }, [activeFilter]);

  const counts = useMemo(() => {
    const buckets: Record<Filter, number> = {
      all: MOCK_EMAILS.length,
      urgent: 0,
      important: 0,
      newsletter: 0,
      promotion: 0,
      transactional: 0,
      spam: 0,
      other: 0,
    };
    for (const e of MOCK_EMAILS) {
      const c = (e.ai?.classification ?? "other") as Classification;
      buckets[c] = (buckets[c] ?? 0) + 1;
    }
    return buckets;
  }, []);

  const selected = filtered.find((e) => e.id === selectedId) ?? filtered[0] ?? null;

  return (
    <main className="flex h-screen w-screen overflow-hidden">
      <Sidebar />

      <section className="flex h-full w-[380px] shrink-0 flex-col border-r border-border bg-surface">
        <FilterBar active={activeFilter} counts={counts} onChange={setActiveFilter} />
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <EmptyState
              title="Nothing here"
              description="No emails match the current filter."
            />
          ) : (
            filtered.map((e) => (
              <EmailRow
                key={e.id}
                email={e}
                isSelected={selected?.id === e.id}
                onSelect={() => setSelectedId(e.id)}
              />
            ))
          )}
        </div>
      </section>

      {selected ? (
        <section className="flex h-full flex-1 min-w-0">
          <div className="flex-1 min-w-0 bg-surface">
            <ThreadViewer email={selected} body={BODIES[selected.id] ?? selected.snippet ?? ""} />
          </div>
          <AiMetaSidebar email={selected} />
        </section>
      ) : (
        <section className="flex h-full flex-1 items-center justify-center bg-surface">
          <EmptyState title="Inbox zero." description="No emails to triage right now." />
        </section>
      )}
    </main>
  );
}
