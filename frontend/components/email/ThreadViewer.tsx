"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Archive, Clock, MoreHorizontal, Send, Sparkles } from "lucide-react";
import type { EmailListItem } from "@/lib/types";
import { avatarBg, formatRelativeTime, MOCK_REFERENCE_NOW_MS, senderInitials } from "@/lib/utils";

interface Props {
  email: EmailListItem;
  body: string;
  bodyHtml?: string | null;
  /** Reply text the user previously sent for this email, if any. */
  userReply?: string | null;
  onMarkRepliedSent?: (replyBody: string) => void;
}

interface DraftState {
  body: string;
  loading: boolean;
  error: string | null;
  meta: { provider: string; language: string } | null;
}

const INITIAL_DRAFT: DraftState = { body: "", loading: false, error: null, meta: null };

export function ThreadViewer({ email, body, bodyHtml, userReply, onMarkRepliedSent }: Props) {
  const [draft, setDraft] = useState<DraftState>(INITIAL_DRAFT);
  const [reply, setReply] = useState("");
  const [sendNotice, setSendNotice] = useState<string | null>(null);

  const isSent = Boolean(userReply);

  // Reset reply text when the user clicks a different email.
  useEffect(() => {
    setDraft(INITIAL_DRAFT);
    setReply("");
    setSendNotice(null);
  }, [email.id]);

  async function handleSend() {
    const trimmed = reply.trim();
    if (!trimmed) {
      setSendNotice("Empty reply. Type or generate a draft before sending.");
      return;
    }
    // Real outbound delivery via gmail.modify ships in v0.1. For v0 we
    // persist the "this email was replied to" flag on the backend and keep
    // the reply text on the client so the Sent folder can render it.
    onMarkRepliedSent?.(trimmed);
    setSendNotice("Reply queued. Real send ships in v0.1; this thread moved to Sent.");
    try {
      await fetch(api(`/api/email/${email.id}/mark_replied`), { method: "POST" });
    } catch {
      /* offline-tolerant; the local state already moved the email */
    }
  }

  async function generateDraft() {
    setDraft({ body: "", loading: true, error: null, meta: null });
    try {
      const resp = await fetch(api("/api/draft"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_id: email.id }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
      }
      const json: { body: string; provider_used: string; language: string } = await resp.json();
      setDraft({
        body: json.body,
        loading: false,
        error: null,
        meta: { provider: json.provider_used, language: json.language },
      });
      setReply(json.body);
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : String(exc);
      setDraft({ body: "", loading: false, error: message, meta: null });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 flex h-12 items-center gap-2 border-b border-border bg-surface px-4">
        <div className="flex flex-1 flex-col min-w-0">
          <span className="truncate text-body font-medium text-text-primary">
            {email.subject ?? "(no subject)"}
          </span>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded text-text-tertiary hover:bg-bg hover:text-text-primary"
          aria-label="Archive"
          title="Archive (e)"
        >
          <Archive className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded text-text-tertiary hover:bg-bg hover:text-text-primary"
          aria-label="Snooze"
          title="Snooze"
        >
          <Clock className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded text-text-tertiary hover:bg-bg hover:text-text-primary"
          aria-label="More"
          title="More"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-6">
        <article className="rounded-xl border border-border bg-surface p-4">
          <header className="mb-3 flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-caption text-text-primary"
              style={{ backgroundColor: avatarBg(email.from_email) }}
              aria-hidden
            >
              {senderInitials(email.from_name, email.from_email)}
            </div>
            <div className="flex flex-1 flex-col min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-body font-semibold text-text-primary">
                  {email.from_name ?? email.from_email}
                </span>
                <span className="text-small text-text-secondary">
                  &lt;{email.from_email}&gt;
                </span>
                <span className="ml-auto text-small text-text-tertiary">
                  {formatRelativeTime(email.received_at, MOCK_REFERENCE_NOW_MS)} ago
                </span>
              </div>
              <span className="text-small text-text-secondary">to me</span>
            </div>
          </header>
          {bodyHtml ? (
            // Sandboxed iframe: arbitrary email HTML cannot run scripts or
            // touch the parent page. srcDoc is a string Next.js renders
            // straight into the attribute.
            <iframe
              title="Email body"
              srcDoc={bodyHtml}
              sandbox=""
              className="block w-full rounded-md border border-border bg-surface"
              style={{ minHeight: "320px", height: "60vh" }}
            />
          ) : (
            <div className="prose prose-sm max-w-none whitespace-pre-wrap font-sans text-body text-text-primary">
              {body}
            </div>
          )}
        </article>

        {userReply && (
          <article
            className="mt-3 rounded-xl border bg-surface-elevated p-4"
            style={{ borderColor: "rgb(var(--accent) / 0.4)" }}
          >
            <header className="mb-2 flex items-center gap-2 text-caption font-mono uppercase tracking-wider text-text-tertiary">
              You · sent
            </header>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap font-sans text-body text-text-primary">
              {userReply}
            </div>
          </article>
        )}
      </div>

      <div className="border-t border-border bg-surface p-4">
        <div className="rounded-lg border border-border bg-surface-elevated focus-within:border-accent">
          {/* Account picker. v0 ships with a single connected mailbox so the
              "From" row is read-only; v0.1 promotes this to a real select that
              lists every authenticated account and remembers the choice
              per-thread. The default is always the account the email
              arrived to so a reply never goes from the wrong sender by
              accident. */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-small text-text-secondary">
            <span className="font-mono text-caption uppercase tracking-wider text-text-tertiary">
              From
            </span>
            <span className="truncate">demo@mailpalace.local</span>
            <span className="ml-auto font-mono text-caption text-text-tertiary">
              v0.1: switch account
            </span>
          </div>
          <textarea
            placeholder={isSent ? "This thread is in Sent. Write a follow-up..." : "Write a reply..."}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={4}
            aria-label="Reply body"
            className="block w-full resize-y bg-transparent px-3 py-2 text-body text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          {draft.error && (
            <div className="border-t border-border px-3 py-2 text-small" style={{ color: "rgb(var(--urgent))" }}>
              {draft.error}
            </div>
          )}
          {draft.meta && !draft.error && (
            <div className="border-t border-border px-3 py-1 font-mono text-caption text-text-tertiary">
              Generated by {draft.meta.provider} in {draft.meta.language}
            </div>
          )}
          {sendNotice && (
            <div className="border-t border-border px-3 py-2 text-small text-text-secondary">
              {sendNotice}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={generateDraft}
              disabled={draft.loading}
              className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-small text-text-secondary hover:bg-bg hover:text-text-primary disabled:cursor-wait disabled:opacity-60"
              title="Generate draft via the active LLM provider"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {draft.loading ? "Drafting..." : "Draft with AI"}
            </button>
            <button
              type="button"
              onClick={handleSend}
              className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-small font-medium text-surface hover:opacity-90"
              style={{ backgroundColor: "rgb(var(--accent))" }}
              title="Send the reply"
            >
              <Send className="h-3.5 w-3.5" />
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
