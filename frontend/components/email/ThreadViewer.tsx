"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Archive, Loader2, MailOpen, MoreHorizontal, Send, Sparkles, Trash2 } from "lucide-react";
import type { EmailListItem } from "@/lib/types";
import { avatarBg, formatRelativeTime, senderInitials } from "@/lib/utils";
import { SnoozeMenu } from "./SnoozeMenu";

export interface SendableAccount {
  id: number;
  email_address: string;
  kind: "gmail" | "imap";
}

interface Props {
  email: EmailListItem;
  body: string;
  bodyHtml?: string | null;
  /** Reply text the user previously sent for this email, if any. */
  userReply?: string | null;
  /** Every connected mailbox the user can send from. */
  accounts: SendableAccount[];
  onMarkRepliedSent?: (replyBody: string) => void;
  /** Notify the parent when the row should leave the visible inbox. */
  onArchived?: () => void;
  onDeleted?: () => void;
  onSnoozed?: () => void;
  onToggleRead?: () => void;
}

interface DraftState {
  body: string;
  loading: boolean;
  error: string | null;
  meta: { provider: string; language: string } | null;
}

interface SendState {
  status: "idle" | "sending" | "sent" | "error";
  message: string | null;
}

const INITIAL_DRAFT: DraftState = { body: "", loading: false, error: null, meta: null };
const INITIAL_SEND: SendState = { status: "idle", message: null };

export function ThreadViewer({
  email,
  body,
  bodyHtml,
  userReply,
  accounts,
  onMarkRepliedSent,
  onArchived,
  onDeleted,
  onSnoozed,
  onToggleRead,
}: Props) {
  const [draft, setDraft] = useState<DraftState>(INITIAL_DRAFT);
  const [reply, setReply] = useState("");
  const [send, setSend] = useState<SendState>(INITIAL_SEND);
  // Default the From-account to the mailbox the email arrived in so a
  // reply never accidentally goes out from the wrong identity.
  const [fromAccountId, setFromAccountId] = useState<number>(email.account_id);

  const isSent = Boolean(userReply);
  const fromAccount = accounts.find((a) => a.id === fromAccountId) ?? accounts[0];

  // Reset state when the user clicks a different email.
  useEffect(() => {
    setDraft(INITIAL_DRAFT);
    setReply("");
    setSend(INITIAL_SEND);
    setFromAccountId(email.account_id);
  }, [email.id, email.account_id]);

  async function handleSend() {
    const trimmed = reply.trim();
    if (!trimmed) {
      setSend({ status: "error", message: "Empty reply. Type or generate a draft first." });
      return;
    }
    if (!fromAccount) {
      setSend({ status: "error", message: "No account is available to send from." });
      return;
    }
    setSend({ status: "sending", message: null });
    try {
      const resp = await fetch(api(`/api/email/${email.id}/send`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body_text: trimmed,
          from_account_id: fromAccountId,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const detail = (data && typeof data.detail === "string" && data.detail) || `HTTP ${resp.status}`;
        throw new Error(detail);
      }
      setSend({
        status: "sent",
        message: `Sent from ${fromAccount.email_address}.`,
      });
      // Move the row to Sent locally so the inbox view updates without
      // waiting on the next /api/inbox poll.
      onMarkRepliedSent?.(trimmed);
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : String(exc);
      setSend({ status: "error", message });
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
        <ArchiveButton emailId={email.id} onArchived={onArchived} />
        <SnoozeMenu emailId={email.id} onSnoozed={onSnoozed} />
        <MoreMenu
          emailId={email.id}
          isUnread={email.is_unread}
          onDeleted={onDeleted}
          onToggleRead={onToggleRead}
        />
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
                  {formatRelativeTime(email.received_at)} ago
                </span>
              </div>
              <span className="text-small text-text-secondary">to me</span>
            </div>
          </header>
          {bodyHtml ? (
            // Sandboxed iframe: arbitrary email HTML cannot run scripts or
            // touch the parent page. srcDoc is a string Next.js renders
            // straight into the attribute. Height is intentionally generous
            // because cross-origin iframes can't auto-resize to content.
            <iframe
              title="Email body"
              srcDoc={bodyHtml}
              sandbox=""
              className="block w-full rounded-md border border-border bg-surface"
              style={{ minHeight: "70vh", height: "calc(100vh - 240px)" }}
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
          <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-small text-text-secondary">
            <span className="font-mono text-caption uppercase tracking-wider text-text-tertiary">
              From
            </span>
            {accounts.length > 1 ? (
              <select
                value={fromAccountId}
                onChange={(event) => setFromAccountId(Number(event.target.value))}
                className="flex-1 min-w-0 truncate bg-transparent text-text-primary outline-none focus:outline-none"
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.email_address} ({account.kind.toUpperCase()})
                  </option>
                ))}
              </select>
            ) : (
              <span className="truncate text-text-primary">
                {fromAccount?.email_address ?? "(no account connected)"}
              </span>
            )}
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
          {send.status !== "idle" && send.message && (
            <div
              className="border-t border-border px-3 py-2 text-small"
              style={{
                color:
                  send.status === "error"
                    ? "rgb(var(--urgent))"
                    : send.status === "sent"
                      ? "rgb(var(--accent))"
                      : "rgb(var(--text-secondary))",
              }}
            >
              {send.message}
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
              disabled={send.status === "sending" || !fromAccount}
              className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-small font-medium text-surface hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              style={{ backgroundColor: "rgb(var(--accent))" }}
              title="Send the reply"
            >
              {send.status === "sending" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {send.status === "sending" ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArchiveButton({
  emailId,
  onArchived,
}: {
  emailId: number;
  onArchived?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function archive() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch(api(`/api/email/${emailId}/archive`), { method: "POST" });
      onArchived?.();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={archive}
      disabled={busy}
      className="inline-flex h-8 w-8 items-center justify-center rounded text-text-tertiary hover:bg-bg hover:text-text-primary disabled:cursor-wait disabled:opacity-60"
      aria-label="Archive"
      title="Archive — remove from Inbox without deleting"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Archive className="h-4 w-4" />
      )}
    </button>
  );
}

function MoreMenu({
  emailId,
  isUnread,
  onDeleted,
  onToggleRead,
}: {
  emailId: number;
  isUnread: boolean;
  onDeleted?: () => void;
  onToggleRead?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  async function markUnread() {
    setOpen(false);
    await fetch(api(`/api/email/${emailId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_unread: !isUnread ? true : false }),
    });
    onToggleRead?.();
  }

  async function trash() {
    setOpen(false);
    await fetch(api(`/api/email/${emailId}/delete`), { method: "POST" });
    onDeleted?.();
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded text-text-tertiary hover:bg-bg hover:text-text-primary"
        aria-label="More actions"
        title="More"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-1 w-[200px] overflow-hidden rounded-md border border-border bg-surface shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={markUnread}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-body text-text-primary hover:bg-surface-elevated"
          >
            <MailOpen className="h-3.5 w-3.5" />
            {isUnread ? "Mark as read" : "Mark as unread"}
          </button>
          <button
            type="button"
            onClick={trash}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-body hover:bg-surface-elevated"
            style={{ color: "rgb(var(--urgent))" }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Move to Trash
          </button>
        </div>
      )}
    </div>
  );
}
