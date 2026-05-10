"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Lock, Sparkles } from "lucide-react";

interface Props {
  provider: string;
  langs: string[];
  triagedCount: number;
  totalCount: number;
  summaryLocale: string;
  retriaging?: boolean;
  retriageProgress?: { current: number; total: number } | null;
  onSummaryLocaleChange: (locale: string) => void;
}

const SUMMARY_LANGS: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
  { code: "uk", label: "Українська" },
  { code: "uk-surzhyk", label: "Українсько-російський" },
  { code: "pl", label: "Polski" },
  { code: "cs", label: "Čeština" },
  { code: "sk", label: "Slovenčina" },
  { code: "hu", label: "Magyar" },
  { code: "ro", label: "Română" },
  { code: "sl", label: "Slovenščina" },
  { code: "et", label: "Eesti" },
  { code: "lv", label: "Latviešu" },
  { code: "lt", label: "Lietuvių" },
  { code: "fi", label: "Suomi" },
  { code: "sv", label: "Svenska" },
  { code: "no", label: "Norsk" },
  { code: "da", label: "Dansk" },
  { code: "de", label: "Deutsch" },
  { code: "de-AT", label: "Österreichisches Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "nl", label: "Nederlands" },
  { code: "lb", label: "Lëtzebuergesch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
];

/**
 * Top status bar.
 *
 * The job of this strip is to telegraph the differentiation in chrome:
 * the inbox is local, the LLM is reachable (or not), and the user can
 * switch summary language without leaving the screen.
 */
export function StatusBar({
  provider,
  triagedCount,
  totalCount,
  summaryLocale,
  retriaging,
  retriageProgress,
  onSummaryLocaleChange,
}: Props) {
  const [llmHealthy, setLlmHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const resp = await fetch(api("/api/health"));
        if (!cancelled) setLlmHealthy(resp.ok);
      } catch {
        if (!cancelled) setLlmHealthy(false);
      }
    }
    poll();
    const id = window.setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const dotColor =
    llmHealthy === null
      ? "rgb(var(--text-tertiary))"
      : llmHealthy
        ? "rgb(91 138 117)"
        : "rgb(var(--urgent))";

  const triagedTitle = `${triagedCount} of ${totalCount} emails currently in your inbox have an AI summary attached. The remainder are awaiting triage.`;

  return (
    <div
      role="status"
      className="flex h-9 items-center gap-4 border-b border-border bg-bg px-4 font-mono text-caption uppercase tracking-wider text-text-tertiary"
    >
      <span className="inline-flex items-center gap-1.5 text-text-secondary">
        <Lock className="h-3 w-3" />
        Local
      </span>

      <span className="inline-flex items-center gap-1.5" title={`Active LLM provider: ${provider}`}>
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        <Sparkles className="h-3 w-3" />
        {provider}
      </span>

      <span className="inline-flex items-center gap-2 normal-case tracking-normal" title="Switch the language the AI summarises into">
        <span className="text-text-tertiary">Summary in</span>
        <select
          value={summaryLocale}
          onChange={(event) => onSummaryLocaleChange(event.target.value)}
          aria-label="Summary language"
          disabled={retriaging}
          className="rounded border border-border bg-surface px-1.5 py-0.5 text-text-primary outline-none focus:border-accent disabled:opacity-60"
        >
          {SUMMARY_LANGS.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
        {retriaging && (
          <span className="text-text-tertiary">
            {retriageProgress && retriageProgress.total > 0
              ? `retriaging ${retriageProgress.current}/${retriageProgress.total}…`
              : "retriaging…"}
          </span>
        )}
      </span>

      <span className="ml-auto" title={triagedTitle}>
        {triagedCount}/{totalCount} triaged
      </span>
    </div>
  );
}
