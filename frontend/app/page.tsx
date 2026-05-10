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


async function fetchInbox(): Promise<EmailListItem[]> {
  const resp = await fetch(api("/api/inbox?folder=all&limit=1000"));
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
  const [selectedDetail, setSelectedDetail] = useState<{
    id: number;
    body_text: string | null;
    body_html: string | null;
  } | null>(null);
  const [summaryLocale, setSummaryLocale] = useState<string>("en");
  const [retriaging, setRetriaging] = useState(false);
  const [retriageProgress, setRetriageProgress] = useState<{ current: number; total: number } | null>(null);
  const [accounts, setAccounts] = useState<
    { id: number; email_address: string; kind: "gmail" | "imap" }[]
  >([]);
  const [accountsLoaded, setAccountsLoaded] = useState(false);

  async function reloadAccounts(): Promise<
    { id: number; email_address: string; kind: "gmail" | "imap" }[]
  > {
    try {
      const resp = await fetch(api("/api/accounts"));
      if (!resp.ok) return [];
      const list: { id: number; email_address: string; kind: "gmail" | "imap" }[] =
        await resp.json();
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
    () =>
      liveEmails.filter(
        (e) => flags[e.id]?.sent || (e.provider_labels ?? []).includes("SENT"),
      ).length,
    [liveEmails, flags],
  );
  const spamCount = useMemo(
    () => liveEmails.filter((e) => (e.provider_labels ?? []).includes("SPAM")).length,
    [liveEmails],
  );

  const filtered = useMemo(() => {
    const list = liveEmails.filter((email) => {
      const f = flags[email.id];
      if (!f) return false;
      const labels = email.provider_labels ?? [];
      if (activeFilter === "trash") return f.deleted || labels.includes("TRASH");
      if (activeFilter === "spam") return labels.includes("SPAM");
      if (activeFilter === "sent") {
        return f.sent || labels.includes("SENT");
      }
      // Every remaining folder is "live inbox": skip rows that left it.
      if (!rowIsActive(f)) return false;
      // Hide rows Gmail itself moved out of the primary inbox view.
      if (labels.includes("SPAM") || labels.includes("TRASH") || labels.includes("SENT")) {
        return false;
      }
      const cls = (email.ai?.classification ?? "other") as Classification;
      if (activeFilter === "inbox") {
        return !NEWSLETTERS.includes(cls);
      }
      // AI buckets: urgent / important / newsletter (also includes promo)
      if (activeFilter === "newsletter") return NEWSLETTERS.includes(cls);
      return cls === activeFilter;
    });
    // Sort policy: pure chronological, newest first. Importance is
    // already visible as a coloured badge on each row, so promoting an
    // old `urgent` above a fresh `other` only confused the timeline.
    return list.sort(
      (a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime(),
    );
  }, [liveEmails, flags, activeFilter]);

  const selected = filtered.find((e) => e.id === selectedId) ?? filtered[0] ?? null;

  // Mark the currently-selected row as read locally AND push the change
  // to Gmail via PATCH /api/email/{id}. Best-effort propagation.
  useEffect(() => {
    if (!selected) return;
    setFlags((prev) => {
      if (prev[selected.id]?.read) return prev;
      return { ...prev, [selected.id]: { ...prev[selected.id], read: true } };
    });
    fetch(api(`/api/email/${selected.id}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_unread: false }),
    }).catch(() => {
      /* best effort; local read flag stays */
    });
  }, [selected?.id]);

  // Fetch the full email body when the selection changes; the inbox payload
  // only carries snippet, so the thread viewer needs detail for HTML mail.
  useEffect(() => {
    if (selected === null || selected === undefined) return;
    let cancelled = false;
    async function load() {
      try {
        const resp = await fetch(api(`/api/email/${selected.id}`));
        if (!resp.ok) return;
        const data: { id: number; body_text: string | null; body_html: string | null } =
          await resp.json();
        if (!cancelled) {
          setSelectedDetail({
            id: data.id,
            body_text: data.body_text,
            body_html: data.body_html,
          });
        }
      } catch {
        /* keep showing the snippet fallback */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  const langs = useMemo(() => {
    const set = new Set<string>();
    for (const email of liveEmails) if (email.ai?.language) set.add(email.ai.language);
    return [...set];
  }, [liveEmails]);
  const triagedCount = liveEmails.filter((e) => e.ai?.classification).length;
  const provider = liveEmails.find((e) => e.ai?.provider)?.ai?.provider ?? "ollama:llama3.1:8b";

  async function toggleRead(emailId: number) {
    let nextRead = true;
    setFlags((prev) => {
      nextRead = !prev[emailId].read;
      return {
        ...prev,
        [emailId]: { ...prev[emailId], read: nextRead },
      };
    });
    try {
      await fetch(api(`/api/email/${emailId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_unread: !nextRead }),
      });
    } catch {
      /* local state already updated; provider sync will retry on next action */
    }
  }

  function snooze(emailId: number) {
    setFlags((prev) => ({
      ...prev,
      [emailId]: { ...prev[emailId], snoozed: true },
    }));
  }

  async function deleteEmail(emailId: number) {
    setFlags((prev) => ({
      ...prev,
      [emailId]: { ...prev[emailId], deleted: true },
    }));
    try {
      await fetch(api(`/api/email/${emailId}/delete`), { method: "POST" });
    } catch {
      /* local state already moved the row to trash */
    }
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


  // Poll the inbox while at least one account is connected, so freshly
  // ingested emails appear without a manual refresh. Stops when there
  // are no accounts (the wizard takes over) and when the page unmounts.
  useEffect(() => {
    if (accounts.length === 0) return;
    let cancelled = false;
    async function tick() {
      try {
        const fresh = await fetchInbox();
        if (!cancelled) {
          setEmails(fresh);
          setFlags((prev) => {
            const next: Record<number, RowFlags> = { ...prev };
            for (const email of fresh) {
              if (next[email.id]) continue;
              next[email.id] = {
                read: !email.is_unread,
                snoozed: false,
                deleted: false,
                sent: false,
                reply: null,
              };
            }
            return next;
          });
        }
      } catch {
        /* ignore */
      }
    }
    tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [accounts.length]);

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
          spamCount={spamCount}
          accountEmail={accountEmail}
          accountIds={accounts.map((a) => a.id)}
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
          // `min-h-0` is the key to this column scrolling: in a nested
          // flex column the child only respects overflow if the parent
          // does not bottom-out at content height. Without it the list
          // grows past the viewport and the outer overflow-hidden clips
          // everything past the first ~10-20 rows.
          <section className="flex h-full min-h-0 w-[380px] shrink-0 flex-col border-r border-border bg-surface">
            <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
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
                <>
                  {filtered.map((email) => (
                    <EmailRow
                      key={email.id}
                      email={email}
                      isSelected={selected?.id === email.id}
                      onSelect={() => setSelectedId(email.id)}
                      onToggleRead={() => toggleRead(email.id)}
                      onSnooze={() => snooze(email.id)}
                      onDelete={() => deleteEmail(email.id)}
                    />
                  ))}
                  <div className="px-4 py-3 text-center font-mono text-caption text-text-tertiary">
                    {filtered.length} message{filtered.length === 1 ? "" : "s"} in this view
                  </div>
                </>
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
                  body={
                    (selectedDetail && selectedDetail.id === selected.id
                      ? selectedDetail.body_text
                      : null) ?? selected.snippet ?? ""
                  }
                  bodyHtml={
                    selectedDetail && selectedDetail.id === selected.id
                      ? selectedDetail.body_html
                      : null
                  }
                  userReply={flags[selected.id]?.reply ?? null}
                  accounts={accounts}
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
              body={
                (selectedDetail && selectedDetail.id === selected.id
                  ? selectedDetail.body_text
                  : null) ?? selected.snippet ?? ""
              }
              bodyHtml={
                selectedDetail && selectedDetail.id === selected.id
                  ? selectedDetail.body_html
                  : null
              }
              userReply={flags[selected.id]?.reply ?? null}
              accounts={accounts}
              onMarkRepliedSent={(replyBody) => markSent(selected.id, replyBody)}
            />
          </section>
        )}
      </div>
    </main>
  );
}
