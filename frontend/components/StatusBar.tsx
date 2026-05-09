"use client";

import { Lock, Sparkles } from "lucide-react";

interface Props {
  provider: string;
  langs: string[];
  triagedCount: number;
  totalCount: number;
}

/**
 * Top status bar. Tells the user at a glance that nothing has left the
 * machine, which model triaged the inbox, and which languages we picked up.
 * The differentiation pitch belongs in the chrome, not buried in a sidebar.
 */
export function StatusBar({ provider, langs, triagedCount, totalCount }: Props) {
  return (
    <div
      role="status"
      className="flex h-9 items-center gap-4 border-b border-border bg-bg px-4 font-mono text-caption uppercase tracking-wider text-text-tertiary"
    >
      <span className="inline-flex items-center gap-1.5 text-text-secondary">
        <Lock className="h-3 w-3" />
        Local · email never leaves this machine
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Sparkles className="h-3 w-3" />
        {provider}
      </span>
      <span>
        {langs.length} {langs.length === 1 ? "language" : "languages"}: {langs.join(" · ")}
      </span>
      <span className="ml-auto">
        {triagedCount}/{totalCount} triaged today
      </span>
    </div>
  );
}
