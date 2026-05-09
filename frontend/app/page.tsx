"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EmailListItem as EmailRow } from "@/components/email/EmailListItem";
import { Sidebar } from "@/components/email/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { ThreadViewer } from "@/components/email/ThreadViewer";
import { AiMetaSidebar } from "@/components/email/AiMetaSidebar";
import { EmptyState } from "@/components/ui/EmptyState";
import { MOCK_EMAILS } from "@/lib/mock-data";
import type { Filter } from "@/components/email/FilterBar";
import type { Classification, EmailListItem } from "@/lib/types";

// Per-row state that lives only on the client. v0.1 syncs this back to
// the FastAPI repo via PATCH /api/email/{id}.
interface RowFlags {
  read: boolean;
  snoozed: boolean;
  deleted: boolean;
  sent: boolean;
}

const BODIES: Record<number, string> = {
  1:
    "Hi Dmytro,\n\n" +
    "The security team flagged two open questions on the webhook signing flow we discussed last Thursday. Could you put together a one-pager addressing both points by Tuesday EOD? The board review is Wednesday morning and we need this signed off before then.\n\nThanks,\nAnna",
  2:
    "@sven-rasmussen requested your review on this pull request.\n\n" +
    "PR #1842: Add retry logic to token refresh\n" +
    "14 files changed, +312 -47\n\n" +
    "View on GitHub: https://github.com/anthropics/claude-code/pull/1842",
  3:
    "Привіт, Дмитро!\n\nБачив твій PolyPalace на GitHub. Можемо коротко на 20 хвилин у п'ятницю?\n\nДякую,\nОлександр",
  4: "Anthropic has sent you a receipt for $24.18 USD on May 9, 2026.",
  5:
    "Привет!\n\nПодборка статей за прошедшую неделю:\n\n1. Anthropic запускает MCP 2.0 со streaming.\n2. OpenRouter поднимает раунд $50M.\n3. Cursor добавляет inline tool calls.",
  6:
    "Top 10 stories from Hacker News for Saturday May 9:\n\n1. Show HN: I built an email AI agent in a weekend (847 points)\n2. The hidden costs of LLM APIs (612 points)",
  7:
    "Hej Dmytro,\n\nDin årsopgørelse for indkomståret 2025 er nu tilgængelig i TastSelv. Log ind på skat.dk for at se opgørelsen.\n\nMed venlig hilsen,\nSkattestyrelsen",
  8:
    "Your Notion workspace activity for the past week:\n\n- 14 pages updated\n- 3 new comments on \"Q2 product roadmap\"",
  9:
    "Issue: MAIL-12\nTitle: Add Russian draft generation\nStatus: Todo\nAssignee: dmytro",
  10:
    "Hej Dmytro!\n\nSpar 30% hos H&M denne uge når du betaler med Klarna.",
};

const NEWSLETTERS: Classification[] = ["newsletter", "promotion"];

function buildInitialFlags(): Record<number, RowFlags> {
  const out: Record<number, RowFlags> = {};
  for (const email of MOCK_EMAILS) {
    out[email.id] = {
      read: !email.is_unread,
      snoozed: false,
      deleted: false,
      sent: false,
    };
  }
  return out;
}

export default function HomePage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<Filter>("inbox");
  const [selectedId, setSelectedId] = useState<number | null>(MOCK_EMAILS[0]?.id ?? null);
  const [flags, setFlags] = useState<Record<number, RowFlags>>(() => buildInitialFlags());
  const [accountEmail, setAccountEmail] = useState("demo@mailpalace.local");
  const [summaryLocale, setSummaryLocale] = useState<string>("en");

  // Pull the active account label and the current summary locale from the
  // backend on mount; fall back to demo defaults if the API is unreachable.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const settingsResp = await fetch("/api/settings");
        if (settingsResp.ok && !cancelled) {
          const data = await settingsResp.json();
          setSummaryLocale(data.summary_locale ?? "en");
        }
      } catch {
        /* ignore; keep defaults */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Apply per-row flags onto the mock dataset.
  const liveEmails: EmailListItem[] = useMemo(
    () =>
      MOCK_EMAILS.map((email) => ({
        ...email,
        is_unread: !flags[email.id]?.read,
      })),
    [flags],
  );

  const counts = useMemo(() => {
    const inboxFn = (e: EmailListItem) => {
      const f = flags[e.id];
      if (!f || f.deleted || f.sent || f.snoozed) return false;
      const cls = e.ai?.classification ?? "other";
      return !NEWSLETTERS.includes(cls as Classification);
    };
    return {
      inbox: liveEmails.filter(inboxFn).length,
      sent: 0,
      trash: 0,
      urgent: liveEmails.filter((e) => !flags[e.id]?.deleted && e.ai?.classification === "urgent").length,
      important: liveEmails.filter((e) => !flags[e.id]?.deleted && e.ai?.classification === "important").length,
      newsletter: liveEmails.filter(
        (e) => !flags[e.id]?.deleted && NEWSLETTERS.includes((e.ai?.classification ?? "other") as Classification),
      ).length,
      promotion: 0,
      transactional: 0,
      spam: 0,
      other: 0,
    } as const;
  }, [liveEmails, flags]);

  const trashCount = useMemo(
    () => liveEmails.filter((e) => flags[e.id]?.deleted).length,
    [liveEmails, flags],
  );
  const sentCount = useMemo(
    () => liveEmails.filter((e) => flags[e.id]?.sent).length,
    [liveEmails, flags],
  );

  const filtered = useMemo(() => {
    const list = liveEmails.filter((email) => {
      const f = flags[email.id];
      if (!f) return false;
      if (activeFilter === "trash") return f.deleted;
      if (f.deleted) return false;
      if (activeFilter === "sent") return f.sent;
      if (f.sent) return false;
      if (activeFilter === "inbox") {
        if (f.snoozed) return false;
        const cls = email.ai?.classification ?? "other";
        return !NEWSLETTERS.includes(cls as Classification);
      }
      // AI buckets filter by classification
      return email.ai?.classification === activeFilter;
    });
    return list;
  }, [liveEmails, flags, activeFilter]);

  const selected = filtered.find((e) => e.id === selectedId) ?? filtered[0] ?? null;

  // Mark the currently-selected row as read (item #17). Runs once per
  // selection change, no DB write yet -- v0.1 syncs to the backend.
  useEffect(() => {
    if (!selected) return;
    setFlags((prev) => {
      if (prev[selected.id]?.read) return prev;
      return { ...prev, [selected.id]: { ...prev[selected.id], read: true } };
    });
  }, [selected?.id]);

  const langs = useMemo(() => {
    const set = new Set<string>();
    for (const email of liveEmails) if (email.ai?.language) set.add(email.ai.language);
    return [...set];
  }, [liveEmails]);
  const triagedCount = liveEmails.filter((e) => e.ai?.classification).length;
  const provider = liveEmails.find((e) => e.ai?.provider)?.ai?.provider ?? "ollama:llama3.1:8b";

  function toggleRead(emailId: number) {
    setFlags((prev) => ({
      ...prev,
      [emailId]: { ...prev[emailId], read: !prev[emailId].read },
    }));
  }

  function snooze(emailId: number) {
    setFlags((prev) => ({
      ...prev,
      [emailId]: { ...prev[emailId], snoozed: true },
    }));
  }

  function deleteEmail(emailId: number) {
    setFlags((prev) => ({
      ...prev,
      [emailId]: { ...prev[emailId], deleted: true },
    }));
  }

  function markSent(emailId: number) {
    setFlags((prev) => ({
      ...prev,
      [emailId]: { ...prev[emailId], sent: true, read: true },
    }));
  }

  async function changeSummaryLocale(next: string) {
    setSummaryLocale(next);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary_locale: next }),
      });
    } catch {
      /* setting is in-memory only in v0; OK to fail silently */
    }
  }

  const accountInitial = accountEmail.charAt(0);

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden">
      <StatusBar
        provider={provider}
        langs={langs}
        triagedCount={triagedCount}
        totalCount={liveEmails.length}
        summaryLocale={summaryLocale}
        onSummaryLocaleChange={changeSummaryLocale}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          active={activeFilter}
          counts={counts}
          trashCount={trashCount}
          sentCount={sentCount}
          accountEmail={accountEmail}
          accountInitial={accountInitial}
          onSelect={setActiveFilter}
          onSettings={() => router.push("/settings")}
        />

        <section className="flex h-full w-[380px] shrink-0 flex-col border-r border-border bg-surface">
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {filtered.length === 0 ? (
              <EmptyState
                title="Nothing here"
                description={
                  activeFilter === "trash"
                    ? "Trash is empty."
                    : activeFilter === "sent"
                      ? "Replies you send will appear here."
                      : activeFilter === "newsletter"
                        ? "Newsletter digest is empty. New newsletters land here automatically."
                        : "Nothing to action right now."
                }
              />
            ) : (
              filtered.map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  isSelected={selected?.id === email.id}
                  onSelect={() => setSelectedId(email.id)}
                  onToggleRead={() => toggleRead(email.id)}
                  onSnooze={() => snooze(email.id)}
                  onDelete={() => deleteEmail(email.id)}
                />
              ))
            )}
          </div>
        </section>

        {selected ? (
          <section className="flex h-full flex-1 min-w-0">
            <div className="flex-1 min-w-0 bg-surface">
              <ThreadViewer
                email={selected}
                body={BODIES[selected.id] ?? selected.snippet ?? ""}
                onMarkRepliedSent={() => markSent(selected.id)}
              />
            </div>
            <AiMetaSidebar email={selected} />
          </section>
        ) : (
          <section className="flex h-full flex-1 items-center justify-center bg-surface">
            <EmptyState title="Inbox zero." description="Nothing waiting on you." />
          </section>
        )}
      </div>
    </main>
  );
}
