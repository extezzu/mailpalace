"use client";

import { CheckCircle2, ChevronRight, Star } from "lucide-react";
import type { EmailListItem } from "@/lib/types";
import { ClassificationBadge } from "./ClassificationBadge";
import { formatRelativeTime, MOCK_REFERENCE_NOW_MS, senderInitials } from "@/lib/utils";

interface Props {
  items: EmailListItem[];
  onSelect: (id: number) => void;
  onMarkAllRead: (ids: number[]) => void;
  selectedId: number | null;
}

/**
 * Aggregated newsletter view.
 *
 * Replaces the per-row inbox list when the user clicks `Newsletter digest`.
 * Picks the highest-confidence newsletter as the lead item with an expanded
 * summary, lays the rest as compact bullets, and exposes a single "mark all
 * as read" CTA that bulk-deletes the visible set.
 */
export function NewsletterDigest({ items, onSelect, onMarkAllRead, selectedId }: Props) {
  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <CheckCircle2 className="h-10 w-10 text-text-tertiary" strokeWidth={1.25} />
        <h2 className="text-display">All caught up.</h2>
        <p className="text-body text-text-secondary">No newsletters waiting on you.</p>
      </div>
    );
  }

  const sorted = [...items].sort((a, b) => {
    const ac = a.ai?.confidence ?? 0;
    const bc = b.ai?.confidence ?? 0;
    if (bc !== ac) return bc - ac;
    return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
  });
  const [lead, ...rest] = sorted;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border bg-bg px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-h1 text-text-primary">Newsletter digest</h1>
          <span className="font-mono text-caption uppercase tracking-wider text-text-tertiary">
            {items.length} unread
          </span>
        </div>
        <p className="mt-1 text-small text-text-secondary">
          {items.length} newsletters in your inbox right now. The lead item is the one your
          AI flagged with the highest signal; the rest are condensed below.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-5">
        {/* Lead item: expanded summary + classification + open-thread chevron */}
        <article
          className="cursor-pointer rounded-xl border bg-surface p-4 transition-colors hover:bg-surface-elevated"
          style={{
            borderColor:
              lead.id === selectedId ? "rgb(var(--accent))" : "rgb(var(--border))",
          }}
          onClick={() => onSelect(lead.id)}
        >
          <div className="mb-2 flex items-center gap-2 text-caption font-mono uppercase tracking-wider text-text-tertiary">
            <Star className="h-3 w-3" style={{ color: "rgb(var(--accent))" }} />
            Most important
          </div>
          <div className="flex items-baseline gap-2">
            <h2 className="flex-1 text-h2 text-text-primary">
              {lead.subject ?? "(no subject)"}
            </h2>
            <span className="text-small text-text-tertiary">
              {formatRelativeTime(lead.received_at, MOCK_REFERENCE_NOW_MS)}
            </span>
          </div>
          <p className="mt-1 text-small text-text-secondary">
            {lead.from_name ?? lead.from_email}
          </p>
          {lead.ai?.summary && (
            <p
              className="mt-3 text-body"
              style={{ color: "rgb(var(--ai-meta))" }}
            >
              {lead.ai.summary}
            </p>
          )}
          {lead.ai?.suggested_action && (
            <p className="mt-2 text-small text-text-secondary">
              <span className="font-mono uppercase text-caption tracking-wider text-text-tertiary">
                Suggested
              </span>{" "}
              · {lead.ai.suggested_action}
            </p>
          )}
        </article>

        {rest.length > 0 && (
          <div className="mt-6">
            <div className="px-1 pb-2 text-caption font-mono uppercase tracking-wider text-text-tertiary">
              Also in your digest
            </div>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
              {rest.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-elevated"
                  >
                    <div
                      className="mt-1 h-7 w-7 shrink-0 rounded-full text-center text-caption font-mono leading-7 text-text-primary"
                      style={{ backgroundColor: "rgb(var(--border))" }}
                      aria-hidden
                    >
                      {senderInitials(item.from_name, item.from_email)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-body font-medium text-text-primary">
                          {item.from_name ?? item.from_email}
                        </span>
                        {item.ai?.classification && (
                          <ClassificationBadge category={item.ai.classification} />
                        )}
                        <span className="ml-auto shrink-0 text-small text-text-tertiary">
                          {formatRelativeTime(item.received_at, MOCK_REFERENCE_NOW_MS)}
                        </span>
                      </div>
                      <p className="truncate text-small text-text-secondary">
                        {item.subject}
                      </p>
                      {item.ai?.summary && (
                        <p
                          className="mt-1 line-clamp-2 text-small"
                          style={{ color: "rgb(var(--ai-meta))" }}
                        >
                          {item.ai.summary}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="mt-2 h-4 w-4 text-text-tertiary" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-border bg-bg px-5 py-3">
        <span className="text-small text-text-secondary">
          Done with the digest? Move every item to Trash in one click.
        </span>
        <button
          type="button"
          onClick={() => onMarkAllRead(items.map((item) => item.id))}
          className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-small font-medium text-surface hover:opacity-90"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Mark all as read
        </button>
      </footer>
    </div>
  );
}
