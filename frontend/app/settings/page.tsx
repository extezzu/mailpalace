"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  AccountsSection,
  type ConnectedAccount,
} from "@/components/settings/AccountsSection";

interface ProviderState {
  api_key_set: boolean;
  model: string;
}

interface SettingsView {
  active_provider: "ollama" | "anthropic" | "openai";
  fallback_chain: string[];
  ollama: { base_url: string; model: string };
  anthropic: ProviderState;
  openai: ProviderState;
  summary_locale: string;
  user_addressing: "ty" | "vy";
  poll_interval_minutes: number;
}

const SUMMARY_LANGS = [
  { code: "en", label: "English" },
  { code: "ru", label: "Русский" },
  { code: "uk", label: "Українська" },
  { code: "uk-surzhyk", label: "Українсько-російський (суржик)" },
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

export default function SettingsPage() {
  const router = useRouter();
  const [view, setView] = useState<SettingsView | null>(null);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function refreshAccounts() {
    try {
      const resp = await fetch(api("/api/accounts"));
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setAccounts(await resp.json());
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [settingsResp] = await Promise.all([fetch(api("/api/settings")), refreshAccounts()]);
        if (!settingsResp.ok) throw new Error(`HTTP ${settingsResp.status}`);
        setView(await settingsResp.json());
      } catch (exc) {
        setError(exc instanceof Error ? exc.message : String(exc));
      }
    }
    load();
  }, []);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const resp = await fetch(api("/api/settings"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setView(await resp.json());
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(account: ConnectedAccount) {
    if (!window.confirm(`Disconnect ${account.email_address}? Local emails for this account will be deleted.`)) {
      return;
    }
    try {
      const resp = await fetch(api(`/api/accounts/${account.id}`), { method: "DELETE" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await refreshAccounts();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
    }
  }

  if (error && !view) {
    return (
      <main className="flex h-screen items-center justify-center p-8 text-text-secondary">
        Could not load settings: {error}. Backend at 127.0.0.1:7330 reachable?
      </main>
    );
  }
  if (!view) {
    return (
      <main className="flex h-screen items-center justify-center p-8 text-text-tertiary">
        Loading…
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Back to inbox"
          className="rounded p-1 text-text-tertiary hover:bg-surface-elevated hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-display">Settings</h1>
        {saving && (
          <span className="text-caption font-mono uppercase tracking-wider text-text-tertiary">
            saving…
          </span>
        )}
      </header>

      <AccountsSection
        accounts={accounts}
        onDisconnect={disconnect}
        onRefresh={refreshAccounts}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-h2">Active LLM provider</h2>
        <div className="flex gap-2">
          {(["ollama", "anthropic", "openai"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => patch({ active_provider: opt })}
              className={
                "rounded-md border px-3 py-1.5 text-body capitalize " +
                (view.active_provider === opt
                  ? "border-accent bg-accent text-surface"
                  : "border-border text-text-secondary hover:bg-surface-elevated")
              }
            >
              {opt}
            </button>
          ))}
        </div>
        <p className="text-small text-text-tertiary">
          Ollama runs locally; the other two send the email body to a remote API. Switching to a
          remote provider crosses the local-first boundary intentionally.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2">Summary language</h2>
        <select
          value={view.summary_locale}
          onChange={(event) => patch({ summary_locale: event.target.value })}
          className="w-fit rounded-md border border-border bg-surface px-3 py-1.5 text-body outline-none focus:border-accent"
        >
          {SUMMARY_LANGS.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.label}
            </option>
          ))}
        </select>
        <p className="text-small text-text-tertiary">
          The AI summary attached to every email is written in this language. Drafts still match
          the source email&apos;s language.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2">Ollama</h2>
        <div className="grid grid-cols-[140px_1fr] items-baseline gap-y-2 text-body">
          <span className="text-text-tertiary">Endpoint</span>
          <span className="font-mono text-small text-text-secondary">{view.ollama.base_url}</span>
          <span className="text-text-tertiary">Model</span>
          <span className="font-mono text-small text-text-secondary">{view.ollama.model}</span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-h2">Remote providers</h2>
        <div className="grid grid-cols-[140px_120px_1fr] items-baseline gap-y-2 text-body">
          <span className="text-text-tertiary">Anthropic</span>
          <span className="font-mono text-small">{view.anthropic.api_key_set ? "key set" : "no key"}</span>
          <span className="text-text-tertiary">{view.anthropic.model}</span>
          <span className="text-text-tertiary">OpenAI</span>
          <span className="font-mono text-small">{view.openai.api_key_set ? "key set" : "no key"}</span>
          <span className="text-text-tertiary">{view.openai.model}</span>
        </div>
        <p className="text-small text-text-tertiary">
          API keys are configured via env vars (<code>MAILPALACE_ANTHROPIC_API_KEY</code>,{" "}
          <code>MAILPALACE_OPENAI_API_KEY</code>) and never returned by the API.
        </p>
      </section>
    </main>
  );
}
