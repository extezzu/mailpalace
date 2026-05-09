"use client";

import { Archive, Clock, Mail } from "lucide-react";
import { ClassificationBadge } from "./ClassificationBadge";
import { LanguageFlag } from "./LanguageFlag";
import type { EmailListItem as EmailListItemType } from "@/lib/types";
import { avatarBg, cn, formatRelativeTime, senderInitials } from "@/lib/utils";

interface Props {
  email: EmailListItemType;
  isSelected: boolean;
  onSelect: () => void;
}

export function EmailListItem({ email, isSelected, onSelect }: Props) {
  const isUnread = email.is_unread;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative w-full text-left transition-colors",
        "border-l-2 border-l-transparent",
        isUnread && "border-l-accent",
        isSelected
          ? "bg-surface-elevated border-l-accent"
          : "bg-surface hover:bg-surface-elevated",
      )}
    >
      <div className="flex h-[60px] items-center gap-3 px-3 border-b border-border">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-caption text-text-primary"
          style={{ backgroundColor: avatarBg(email.from_email) }}
          aria-hidden
        >
          {senderInitials(email.from_name, email.from_email)}
        </div>

        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "truncate text-body",
                isUnread ? "font-semibold text-text-primary" : "text-text-secondary",
              )}
            >
              {email.from_name ?? email.from_email}
            </span>
            <span className="ml-auto shrink-0 text-small text-text-tertiary">
              {formatRelativeTime(email.received_at)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "truncate text-body",
                isUnread ? "font-medium text-text-primary" : "text-text-secondary",
              )}
            >
              {email.subject ?? "(no subject)"}
            </span>
            <LanguageFlag lang={email.ai?.language ?? null} />
            {email.ai?.classification && (
              <ClassificationBadge category={email.ai.classification} />
            )}
          </div>
          <p className="truncate text-small text-text-secondary">
            {email.snippet ?? ""}
          </p>
        </div>

        <div className="hidden items-center gap-1 opacity-0 transition-opacity group-hover:flex group-hover:opacity-100">
          <span
            role="button"
            tabIndex={-1}
            aria-label="Archive"
            title="Archive (e)"
            className="rounded p-1 text-text-tertiary hover:bg-bg hover:text-text-primary"
            onClick={(event) => {
              event.stopPropagation();
              // v0.1 wires this to the archive endpoint.
            }}
          >
            <Archive className="h-4 w-4" />
          </span>
          <span
            role="button"
            tabIndex={-1}
            aria-label="Snooze"
            title="Snooze"
            className="rounded p-1 text-text-tertiary hover:bg-bg hover:text-text-primary"
            onClick={(event) => event.stopPropagation()}
          >
            <Clock className="h-4 w-4" />
          </span>
          <span
            role="button"
            tabIndex={-1}
            aria-label="Toggle read"
            title="Toggle read (u)"
            className="rounded p-1 text-text-tertiary hover:bg-bg hover:text-text-primary"
            onClick={(event) => event.stopPropagation()}
          >
            <Mail className="h-4 w-4" />
          </span>
        </div>
      </div>
    </button>
  );
}
