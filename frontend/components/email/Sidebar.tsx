"use client";

import { Archive, Inbox, Send, Settings, Sparkles, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface Item {
  icon: React.ElementType;
  label: string;
  count?: number;
  active?: boolean;
}

const ITEMS: Item[] = [
  { icon: Inbox, label: "Inbox", count: 142, active: true },
  { icon: Star, label: "Starred" },
  { icon: Send, label: "Sent" },
  { icon: Archive, label: "Archive" },
];

const AI_BUCKETS: Item[] = [
  { icon: Sparkles, label: "Action required", count: 3 },
  { icon: Sparkles, label: "Awaiting reply", count: 7 },
  { icon: Sparkles, label: "Newsletter digest", count: 31 },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-bg">
      <div className="flex h-12 items-center gap-2 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-surface">
          <span className="font-mono text-caption font-bold">M</span>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-body font-semibold text-text-primary">MailPalace</span>
          <span className="text-caption text-text-tertiary">demo@local</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 py-3">
        {ITEMS.map((item) => (
          <NavRow key={item.label} item={item} />
        ))}
        <div className="mt-4 px-2 text-caption font-mono uppercase tracking-wider text-text-tertiary">
          AI buckets
        </div>
        {AI_BUCKETS.map((item) => (
          <NavRow key={item.label} item={item} />
        ))}
      </nav>

      <div className="border-t border-border px-2 py-2">
        <NavRow item={{ icon: Settings, label: "Settings" }} />
      </div>
    </aside>
  );
}

function NavRow({ item }: { item: Item }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-body transition-colors",
        item.active
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
