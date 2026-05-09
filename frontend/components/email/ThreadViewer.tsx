import { Archive, Clock, MoreHorizontal, Send, Sparkles } from "lucide-react";
import type { EmailListItem } from "@/lib/types";
import { avatarBg, formatRelativeTime, senderInitials } from "@/lib/utils";

interface Props {
  email: EmailListItem;
  body: string;
}

export function ThreadViewer({ email, body }: Props) {
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
          title="Archive (e)"
        >
          <Archive className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded text-text-tertiary hover:bg-bg hover:text-text-primary"
          title="Snooze"
        >
          <Clock className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded text-text-tertiary hover:bg-bg hover:text-text-primary"
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
                  {formatRelativeTime(email.received_at)} ago
                </span>
              </div>
              <span className="text-small text-text-secondary">to me</span>
            </div>
          </header>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap font-sans text-body text-text-primary">
            {body}
          </div>
        </article>
      </div>

      <div className="border-t border-border bg-surface p-4">
        <div className="rounded-lg border border-border bg-surface-elevated focus-within:border-accent">
          <textarea
            placeholder="Write a reply..."
            rows={3}
            className="block w-full resize-none bg-transparent px-3 py-2 text-body placeholder:text-text-tertiary focus:outline-none"
          />
          <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-small text-text-secondary hover:bg-bg hover:text-text-primary"
              title="Generate draft with AI"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Draft with AI
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-small font-medium text-surface hover:bg-accent/90"
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
