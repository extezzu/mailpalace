"use client";

import { useState } from "react";
import {
  Inbox,
  Loader2,
  Newspaper,
  OctagonAlert,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Filter } from "./FilterBar";

interface NavItem {
  icon: LucideIcon;
  label: string;
  filter: Filter;
  count?: number;
}

interface Props {
  active: Filter;
  counts: Record<Filter, number>;
  trashCount: number;
  sentCount: number;
  spamCount: number;
  onSelect: (filter: Filter) => void;
  onSettings: () => void;
  accountEmail: string;
  /** Profile picture URL; falls back to the bundled fallback avatar. */
  accountAvatar?: string | null;
  /** Numeric account ids to force-refresh when the user clicks Sync. */
  accountIds: number[];
}

export function Sidebar({
  active,
  counts,
  trashCount,
  sentCount,
  spamCount,
  onSelect,
  onSettings,
  accountEmail,
  accountAvatar,
  accountIds,
}: Props) {
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function syncNow() {
    if (syncing || accountIds.length === 0) return;
    setSyncing(true);
    setSyncError(null);
    try {
      // Fire all account syncs in parallel; the backend already runs
      // each one in its own thread, so we just wait for the slowest.
      const results = await Promise.allSettled(
        accountIds.map((id) =>
          fetch(api(`/api/accounts/${id}/sync`), { method: "POST" }).then((r) => {
            if (!r.ok) throw new Error(`acc ${id}: HTTP ${r.status}`);
            return r.json();
          }),
        ),
      );
      const firstError = results.find((r) => r.status === "rejected") as
        | PromiseRejectedResult
        | undefined;
      if (firstError) {
        const reason = firstError.reason;
        throw reason instanceof Error ? reason : new Error(String(reason));
      }
    } catch (exc) {
      setSyncError(exc instanceof Error ? exc.message : String(exc));
    } finally {
      setSyncing(false);
    }
  }

  const folders: NavItem[] = [
    { icon: Inbox, label: "Inbox", filter: "inbox", count: counts.inbox },
    { icon: Send, label: "Sent", filter: "sent", count: sentCount },
    { icon: OctagonAlert, label: "Spam", filter: "spam", count: spamCount },
    { icon: Trash2, label: "Trash", filter: "trash", count: trashCount },
  ];

  const aiBuckets: NavItem[] = [
    { icon: Sparkles, label: "Action required", filter: "urgent", count: counts.urgent },
    { icon: Sparkles, label: "Awaiting reply", filter: "important", count: counts.important },
    { icon: Newspaper, label: "Newsletter digest", filter: "newsletter", count: counts.newsletter },
  ];

  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-bg">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={accountAvatar ?? "/avatar-fallback.png"}
          alt="MailPalace"
          width={28}
          height={28}
          className="rounded-full"
        />
        <div className="flex flex-1 min-w-0 flex-col leading-tight">
          <span className="text-body font-semibold text-text-primary">MailPalace</span>
          <span className="truncate text-caption text-text-tertiary" title={accountEmail}>
            {accountEmail}
          </span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 py-3">
        {folders.map((item) => (
          <NavRow key={item.label} item={item} active={active} onSelect={onSelect} />
        ))}
        <div className="mt-4 px-2 text-caption font-mono uppercase tracking-wider text-text-tertiary">
          AI buckets
        </div>
        {aiBuckets.map((item) => (
          <NavRow key={item.label} item={item} active={active} onSelect={onSelect} />
        ))}
      </nav>

      <div className="flex flex-col gap-1 border-t border-border px-2 py-2">
        <button
          type="button"
          onClick={syncNow}
          disabled={syncing || accountIds.length === 0}
          className={cn(
            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-body text-text-secondary",
            "hover:bg-surface hover:text-text-primary",
            "disabled:cursor-wait disabled:opacity-60",
          )}
        >
          {syncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          <span className="flex-1 text-left">{syncing ? "Syncing…" : "Sync now"}</span>
        </button>
        <button
          type="button"
          onClick={onSettings}
          className={cn(
            "flex w-full items-center gap-2 rounded px-2 py-1.5 text-body text-text-secondary",
            "hover:bg-surface hover:text-text-primary",
          )}
        >
          <Settings className="h-4 w-4" />
          <span className="flex-1 text-left">Settings</span>
        </button>
        {syncError && (
          <span
            className="px-2 text-caption"
            style={{ color: "rgb(var(--urgent))" }}
            title={syncError}
          >
            Sync failed: {syncError.slice(0, 60)}
          </span>
        )}
      </div>
    </aside>
  );
}

function NavRow({
  item,
  active,
  onSelect,
}: {
  item: NavItem;
  active: Filter;
  onSelect: (filter: Filter) => void;
}) {
  const Icon = item.icon;
  const isActive = active === item.filter;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.filter)}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-body transition-colors",
        isActive
          ? "bg-surface-elevated text-text-primary border-l-2 border-l-accent -ml-px pl-[7px]"
          : "text-text-secondary hover:bg-surface hover:text-text-primary",
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1 text-left truncate">{item.label}</span>
      {item.count !== undefined && (
        <span className="font-mono text-caption text-text-tertiary">{item.count}</span>
      )}
    </button>
  );
}
