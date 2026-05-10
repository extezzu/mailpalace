"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { ConnectInbox } from "@/components/ConnectInbox";
import { EmailListItem as EmailRow } from "@/components/email/EmailListItem";
import { NewsletterDigest } from "@/components/email/NewsletterDigest";
import { Sidebar } from "@/components/email/Sidebar";
import { StatusBar } from "@/components/StatusBar";
import { ThreadViewer } from "@/components/email/ThreadViewer";
import { AiMetaSidebar } from "@/components/email/AiMetaSidebar";
import { EmptyState } from "@/components/ui/EmptyState";
import type { Filter } from "@/components/email/FilterBar";
import type { Classification, EmailListItem } from "@/lib/types";

// Per-row state that lives only on the client. v0.1 syncs this back to
// the FastAPI repo via PATCH /api/email/{id}.
interface RowFlags {
  read: boolean;
  snoozed: boolean;
  deleted: boolean;
  sent: boolean;
  reply: string | null;
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

function buildFlagsFor(emails: EmailListItem[]): Record<number, RowFlags> {
  const out: Record<number, RowFlags> = {};
  for (const email of emails) {
    out[email.id] = {
      read: !email.is_unread,
      snoozed: false,
      deleted: false,
      sent: false,
      reply: null,
    };
  }
  return out;
}

function rowIsActive(flags: RowFlags | undefined): boolean {
  return Boolean(flags && !flags.deleted && !flags.sent && !flags.snoozed);
}

// Importance ladder for the inbox sort. Urgent stays on top, transactional
// (receipts) outranks promotions, AI confidence breaks ties within the same
// classification. v0.1 will replace this with a backend-side score that also
// considers sender history and read patterns.
const RANK: Record<string, number> = {
  urgent: 100,
  important: 80,
  transactional: 60,
  newsletter: 40,
  promotion: 20,
  spam: 5,
  other: 10,
};

function importanceRank(email: EmailListItem): number {
  const cls = email.ai?.classification ?? "other";
  const base = RANK[cls] ?? 10;
  const conf = email.ai?.confidence ?? 0;
  return base + conf;
}

async function fetchInbox(): Promise<EmailListItem[]> {
  const resp = await fetch(api("/api/inbox?folder=all&limit=200"));
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return data.emails as EmailListItem[];
}

export default function HomePage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<Filter>("inbox");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [emails, setEmails] = useState<EmailListItem[]>([]);
  const [flags, setFlags] = useState<Record<number, RowFlags>>({});
  const [accountEmail, setAccountEmail] = useState("");
  const [summaryLocale, setSummaryLocale] = useState<string>("en");
  const [retriaging, setRetriaging] = useState(false);
  const [retriageProgress, setRetriageProgress] = useState<{ current: number; total: number } | null>(null);
  const [accounts, setAccounts] = useState<{ id: number; email_address: string }[]>([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  async function reloadAccounts(): Promise<{ id: number; email_address: string }[]> {
    try {
      const resp = await fetch(api("/api/accounts"));
      if (!resp.ok) return [];
      const list: { id: number; email_address: string }[] = await resp.json();
      setAccounts(list);
      if (list.length > 0) setAccountEmail(list[0].email_address);
      return list;
    } catch {
      return [];
    }
  }

  // On mount: pull accounts, settings, and the live inbox. The mock data is
  // only used as a fallback when the backend is unreachable.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [settingsResp, inbox, accountList] = await Promise.all([
          fetch(api("/api/settings")),
          fetchInbox(),
          fetch(api("/api/accounts")).then((r) => (r.ok ? r.json() : [])),
        ]);
        if (cancelled) return;
        if (settingsResp.ok) {
          const data = await settingsResp.json();
          setSummaryLocale(data.summary_locale ?? "en");
        }
        if (Array.isArray(accountList)) {
          setAccounts(accountList);
          if (accountList.length > 0) {
            setAccountEmail(accountList[0].email_address);
          }
        }
        setEmails(inbox);
        setFlags(buildFlagsFor(inbox));
        setSelectedId(inbox[0]?.id ?? null);
      } catch {
        /* leave inbox empty; the UI renders the wizard or empty state */
      } finally {
        if (!cancelled) setAccountsLoaded(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Apply per-row flags onto whichever dataset is current (live or mock).
  const liveEmails: EmailListItem[] = useMemo(
    () =>
      emails.map((email) => ({
        ...email,
        is_unread: !flags[email.id]?.read,
      })),
    [emails, flags],
  );

  const counts = useMemo(() => {
    // AI buckets only count rows that are still actively in Inbox state:
    // not deleted, not replied/sent, not snoozed. The classification is
    // the same as in the inbox view but folder rules apply first.
    const activeInbox = liveEmails.filter((e) => rowIsActive(flags[e.id]));
    return {
      inbox: activeInbox.filter(
        (e) => !NEWSLETTERS.includes((e.ai?.classification ?? "other") as Classification),
      ).length,
      sent: 0,
      trash: 0,
      urgent: activeInbox.filter((e) => e.ai?.classification === "urgent").length,
      important: activeInbox.filter((e) => e.ai?.classification === "important").length,
      newsletter: activeInbox.filter(
        (e) => NEWSLETTERS.includes((e.ai?.classification ?? "other") as Classification),
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
      if (activeFilter === "sent") return f.sent;
      // Every remaining folder is "live inbox": skip rows that left it.
      if (!rowIsActive(f)) return false;
      const cls = (email.ai?.classification ?? "other") as Classification;
      if (activeFilter === "inbox") {
        return !NEWSLETTERS.includes(cls);
      }
      // AI buckets: urgent / important / newsletter (also includes promo)
      if (activeFilter === "newsletter") return NEWSLETTERS.includes(cls);
      return cls === activeFilter;
    });
    // Inbox and AI buckets are ranked by importance; Sent and Trash keep
    // chronological order so the user can see what they did last.
    if (activeFilter === "trash" || activeFilter === "sent") {
      return list.sort(
        (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
      );
    }
    return list.sort((a, b) => {
      const rankDelta = importanceRank(b) - importanceRank(a);
      if (rankDelta !== 0) return rankDelta;
      return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
    });
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

  function markSent(emailId: number, replyBody: string) {
    setFlags((prev) => ({
      ...prev,
      [emailId]: { ...prev[emailId], sent: true, read: true, reply: replyBody },
    }));
  }

  async function bulkDelete(emailIds: number[]) {
    setFlags((prev) => {
      const next = { ...prev };
      for (const id of emailIds) {
        next[id] = { ...prev[id], deleted: true };
      }
      return next;
    });
    try {
      await fetch(api("/api/email/bulk_delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_ids: emailIds }),
      });
    } catch {
      /* local state already updated */
    }
  }

  async function changeSummaryLocale(next: string) {
    setSummaryLocale(next);
    setRetriaging(true);
    setRetriageProgress({ current: 0, total: 0 });
    try {
      await fetch(api("/api/settings"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary_locale: next }),
      });
      // Kick off the retriage in the background; the endpoint returns
      // immediately so the UI never blocks for the full LLM cycle.
      await fetch(api("/api/retriage_all"), { method: "POST" });
      // Poll the progress endpoint until the worker is done. 1.5s cadence
      // is fast enough to feel responsive but doesn't drown the backend.
      const POLL_MS = 1500;
      const TIMEOUT_MS = 10 * 60 * 1000;
      const startedAt = Date.now();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        try {
          const resp = await fetch(api("/api/retriage_progress"));
          if (!resp.ok) break;
          const status: {
            processing: boolean;
            current: number;
            total: number;
          } = await resp.json();
          setRetriageProgress({ current: status.current, total: status.total });
          if (!status.processing) break;
        } catch {
          break;
        }
        if (Date.now() - startedAt > TIMEOUT_MS) break;
      }
      const fresh = await fetchInbox();
      setEmails(fresh);
      setFlags(buildFlagsFor(fresh));
    } catch {
      /* leave the previous summaries in place */
    } finally {
      setRetriaging(false);
      setRetriageProgress(null);
    }
  }


  // First-run wizard. We wait until we've actually heard from /api/accounts
  // so we don't flash the wizard during the initial load.
  if (accountsLoaded && accounts.length === 0) {
    return <ConnectInbox onConnected={reloadAccounts} />;
  }

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden">
      <StatusBar
        provider={provider}
        langs={langs}
        triagedCount={triagedCount}
        totalCount={liveEmails.length}
        summaryLocale={summaryLocale}
        retriaging={retriaging}
        retriageProgress={retriageProgress}
        onSummaryLocaleChange={changeSummaryLocale}
      />
      <div className="flex flex-1 min-h-0">
        <Sidebar
          active={activeFilter}
          counts={counts}
          trashCount={trashCount}
          sentCount={sentCount}
          accountEmail={accountEmail}
          onSelect={setActiveFilter}
          onSettings={() => router.push("/settings")}
        />

        {activeFilter === "newsletter" ? (
          <section className="flex h-full flex-1 flex-col border-r border-border bg-surface">
            <NewsletterDigest
              items={filtered}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMarkAllRead={(ids) => {
                bulkDelete(ids);
                setSelectedId(null);
              }}
            />
          </section>
        ) : (
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
        )}

        {activeFilter !== "newsletter" &&
          (selected ? (
            <section className="flex h-full flex-1 min-w-0">
              <div className="flex-1 min-w-0 bg-surface">
                <ThreadViewer
                  email={selected}
                  body={BODIES[selected.id] ?? selected.snippet ?? ""}
                  userReply={flags[selected.id]?.reply ?? null}
                  onMarkRepliedSent={(replyBody) => markSent(selected.id, replyBody)}
                />
              </div>
              <AiMetaSidebar email={selected} />
            </section>
          ) : (
            <section className="flex h-full flex-1 items-center justify-center bg-surface">
              <EmptyState title="Inbox zero." description="Nothing waiting on you." />
            </section>
          ))}
        {activeFilter === "newsletter" && selected && (
          <section className="flex h-full w-[420px] shrink-0 border-l border-border bg-surface">
            <ThreadViewer
              email={selected}
              body={BODIES[selected.id] ?? selected.snippet ?? ""}
              userReply={flags[selected.id]?.reply ?? null}
              onMarkRepliedSent={(replyBody) => markSent(selected.id, replyBody)}
            />
          </section>
        )}
      </div>
    </main>
  );
}
