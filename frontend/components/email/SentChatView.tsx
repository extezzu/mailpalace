"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { avatarBg, formatRelativeTime, senderInitials } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";

interface ThreadSummary {
  thread_id: number;
  subject: string | null;
  counterpart_email: string;
  counterpart_name: string | null;
  last_message_at: string;
  last_message_snippet: string | null;
  last_was_outgoing: boolean;
  message_count: number;
  account_id: number;
  account_email: string;
}

interface ThreadMessage {
  id: number;
  direction: "incoming" | "outgoing";
  from_name: string | null;
  from_email: string;
  received_at: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
}

interface ThreadDetail {
  thread_id: number;
  subject: string | null;
  counterpart_email: string;
  counterpart_name: string | null;
  account_id: number;
  account_email: string;
  messages: ThreadMessage[];
}

interface Props {
  /** Polled refresh trigger so a new send shows up without a page reload. */
  refreshSignal?: number;
}

export function SentChatView({ refreshSignal = 0 }: Props) {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Pull thread summaries on mount and whenever the parent bumps the
  // refresh signal (new send completed, sync now finished).
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const resp = await fetch(api("/api/threads"));
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data: ThreadSummary[] = await resp.json();
        if (cancelled) return;
        setThreads(data);
        if (data.length > 0 && selectedId === null) {
          setSelectedId(data[0].thread_id);
        }
      } catch (exc) {
        if (!cancelled) setListError(exc instanceof Error ? exc.message : String(exc));
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // selectedId intentionally omitted — we only auto-select on the
    // first load, after that the user owns the choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  // Pull the active thread's full message list whenever the selection
  // changes (or the parent triggers a refresh).
  useEffect(() => {
    if (selectedId === null) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetch(api(`/api/threads/${selectedId}`))
      .then((resp) => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json() as Promise<ThreadDetail>;
      })
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((exc) => {
        if (!cancelled)
          setListError(exc instanceof Error ? exc.message : String(exc));
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, refreshSignal]);

  if (listError) {
    return (
      <section className="flex h-full flex-1 items-center justify-center bg-surface text-small text-text-secondary">
        Could not load conversations: {listError}
      </section>
    );
  }
  if (threads.length === 0) {
    return (
      <section className="flex h-full flex-1 items-center justify-center bg-surface">
        <EmptyState
          title="No replies yet."
          description="Reply to an email and your conversation will appear here."
        />
      </section>
    );
  }

  return (
    <section className="flex h-full flex-1 min-h-0">
      <ThreadListPane
        threads={threads}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      <ChatPane detail={detail} loading={detailLoading} />
    </section>
  );
}

function ThreadListPane({
  threads,
  selectedId,
  onSelect,
}: {
  threads: ThreadSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="flex h-full w-[320px] min-h-0 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-12 items-center border-b border-border px-4 text-body font-medium text-text-primary">
        Conversations
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {threads.map((thread) => {
          const active = thread.thread_id === selectedId;
          const display = thread.counterpart_name ?? thread.counterpart_email;
          return (
            <button
              key={thread.thread_id}
              type="button"
              onClick={() => onSelect(thread.thread_id)}
              className={
                "flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors " +
                (active ? "bg-surface-elevated" : "hover:bg-surface-elevated")
              }
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-caption text-text-primary"
                style={{ backgroundColor: avatarBg(thread.counterpart_email) }}
                aria-hidden
              >
                {senderInitials(thread.counterpart_name, thread.counterpart_email)}
              </div>
              <div className="flex flex-1 flex-col min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-body text-text-primary">{display}</span>
                  <span className="ml-auto shrink-0 text-caption text-text-tertiary">
                    {formatRelativeTime(thread.last_message_at)}
                  </span>
                </div>
                <span className="truncate text-small text-text-secondary">
                  {thread.subject ?? "(no subject)"}
                </span>
                <span className="truncate text-caption text-text-tertiary">
                  {thread.last_was_outgoing ? "You: " : ""}
                  {thread.last_message_snippet ?? ""}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChatPane({
  detail,
  loading,
}: {
  detail: ThreadDetail | null;
  loading: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pin scroll to the most recent message (Telegram-style: the active
  // conversation always shows its newest exchange first).
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [detail?.thread_id, detail?.messages.length]);

  const subjectLabel = useMemo(() => {
    if (!detail) return "";
    return detail.subject ?? "(no subject)";
  }, [detail]);

  if (!detail) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-bg text-small text-text-tertiary">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          "Pick a conversation."
        )}
      </div>
    );
  }

  const counterpart = detail.counterpart_name ?? detail.counterpart_email;

  return (
    <div className="flex h-full flex-1 min-h-0 flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-mono text-caption text-text-primary"
          style={{ backgroundColor: avatarBg(detail.counterpart_email) }}
          aria-hidden
        >
          {senderInitials(detail.counterpart_name, detail.counterpart_email)}
        </div>
        <div className="flex flex-col">
          <span className="text-body font-medium text-text-primary">{counterpart}</span>
          <span className="text-caption text-text-tertiary">
            {detail.counterpart_email} · via {detail.account_email}
          </span>
        </div>
        <span className="ml-auto truncate text-small text-text-secondary" title={subjectLabel}>
          {subjectLabel}
        </span>
      </header>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-6 py-6">
        <ul className="flex flex-col gap-2">
          {detail.messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ThreadMessage }) {
  const outgoing = message.direction === "outgoing";
  const text = message.body_text?.trim() ?? "";
  const preview = text.length > 0 ? text : (message.subject ?? "(empty message)");
  const align = outgoing ? "items-end" : "items-start";
  const bubbleClass = outgoing
    ? "rounded-2xl rounded-br-sm px-3.5 py-2 text-body shadow-sm"
    : "rounded-2xl rounded-bl-sm px-3.5 py-2 text-body shadow-sm";
  const bubbleStyle = outgoing
    ? {
        backgroundColor: "rgb(var(--accent))",
        color: "rgb(var(--surface))",
      }
    : {
        backgroundColor: "rgb(var(--surface))",
        color: "rgb(var(--text-primary))",
        border: "1px solid rgb(var(--border))",
      };

  return (
    <li className={`flex flex-col ${align}`}>
      <div className="flex max-w-[80%] flex-col">
        {!outgoing && message.from_name && (
          <span className="mb-0.5 px-1 text-caption text-text-tertiary">
            {message.from_name}
          </span>
        )}
        <div className={bubbleClass} style={bubbleStyle}>
          <pre className="whitespace-pre-wrap break-words font-sans text-body leading-snug">
            {preview}
          </pre>
        </div>
        <span
          className={
            "mt-0.5 px-1 text-caption text-text-tertiary " +
            (outgoing ? "self-end" : "self-start")
          }
        >
          {new Date(message.received_at).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </li>
  );
}
