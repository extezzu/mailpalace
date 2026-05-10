"use client";

import { Bell, MailOpen, Trash2 } from "lucide-react";
import { ClassificationBadge } from "./ClassificationBadge";
import { LanguageFlag } from "./LanguageFlag";
import type { EmailListItem as EmailListItemType } from "@/lib/types";
import { avatarBg, cn, formatRelativeTime, senderInitials } from "@/lib/utils";

interface Props {
  email: EmailListItemType;
  isSelected: boolean;
  onSelect: () => void;
  onToggleRead: () => void;
  onSnooze: () => void;
  onDelete: () => void;
}

export function EmailListItem({
  email,
  isSelected,
  onSelect,
  onToggleRead,
  onSnooze,
  onDelete,
}: Props) {
  const isUnread = email.is_unread;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative w-full cursor-pointer text-left transition-colors",
        "border-l-2",
        isUnread ? "border-l-accent" : "border-l-transparent",
        isSelected
          ? "bg-surface-elevated"
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
          <p
            className="truncate text-small"
            style={
              email.ai?.summary
                ? { color: "rgb(var(--ai-meta))" }
                : { color: "rgb(var(--text-secondary))" }
            }
            title={email.ai?.summary ?? email.snippet ?? undefined}
          >
            {email.ai?.summary ?? email.snippet ?? ""}
          </p>
        </div>

        <div className="hidden items-center gap-1 opacity-0 transition-opacity group-hover:flex group-hover:opacity-100">
          <QuickAction
            icon={Bell}
            label="Snooze"
            onClick={(event) => {
              event.stopPropagation();
              onSnooze();
            }}
          />
          <QuickAction
            icon={MailOpen}
            label={isUnread ? "Mark as read" : "Mark as unread"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleRead();
            }}
          />
          <QuickAction
            icon={Trash2}
            label="Delete"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          />
        </div>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Bell;
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded p-1 text-text-tertiary hover:bg-bg hover:text-text-primary"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
