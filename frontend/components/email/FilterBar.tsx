"use client";

import { Search } from "lucide-react";
import type { Classification } from "@/lib/types";
import { cn } from "@/lib/utils";

export type Filter = "all" | Classification;

const PILLS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "urgent", label: "Urgent" },
  { value: "important", label: "Important" },
  { value: "newsletter", label: "Newsletter" },
  { value: "promotion", label: "Promo" },
  { value: "transactional", label: "Receipts" },
];

interface Props {
  active: Filter;
  counts: Record<Filter, number>;
  onChange: (f: Filter) => void;
}

export function FilterBar({ active, counts, onChange }: Props) {
  return (
    <div className="sticky top-0 z-10 flex h-12 items-center gap-1 border-b border-border bg-surface px-3">
      <div className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-thin">
        {PILLS.map((p) => {
          const isActive = active === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              className={cn(
                "relative whitespace-nowrap rounded px-2.5 py-1 text-body transition-colors",
                isActive
                  ? "font-semibold text-text-primary"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              <span>{p.label}</span>
              <span
                className={cn(
                  "ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded px-1 font-mono text-caption",
                  isActive ? "bg-accent/15 text-accent" : "bg-bg text-text-tertiary",
                )}
              >
                {counts[p.value] ?? 0}
              </span>
              {isActive && (
                <span className="absolute -bottom-px left-2 right-2 h-0.5 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        aria-label="Search inbox"
        title="Search (coming in v0.1)"
        disabled
        className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded text-text-tertiary opacity-60 cursor-not-allowed"
      >
        <Search className="h-4 w-4" />
      </button>
    </div>
  );
}
