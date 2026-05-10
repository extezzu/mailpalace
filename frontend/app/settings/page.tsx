"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Server, Trash2 } from "lucide-react";

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

interface ConnectedAccount {
  id: number;
  kind: "gmail" | "imap";
  email_address: string;
  label: string;
  is_active: boolean;
  last_synced_at: string | null;
  last_error: string | null;
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

const IMAP_PRESETS = [
  { name: "Outlook / Hotmail", host: "outlook.office365.com", port: 993 },
  { name: "iCloud Mail", host: "imap.mail.me.com", port: 993 },
  { name: "Fastmail", host: "imap.fastmail.com", port: 993 },
  { name: "Mailbox.org", host: "imap.mailbox.org", port: 993 },
  { name: "Proton (via Proton Bridge)", host: "127.0.0.1", port: 1143 },
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

function AccountsSection({
  accounts,
  onDisconnect,
  onRefresh,
}: {
  accounts: ConnectedAccount[];
  onDisconnect: (a: ConnectedAccount) => void;
  onRefresh: () => Promise<void>;
}) {
  const [adding, setAdding] = useState<"none" | "gmail" | "imap">("none");
  const [phase, setPhase] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);

  // Phase polling for Gmail OAuth
  useEffect(() => {
    if (adding !== "gmail") return;
    let cancelled = false;
    const id = window.setInterval(async () => {
      try {
        const resp = await fetch(api("/api/accounts/gmail/status"));
        if (!resp.ok) return;
        const state: { phase: string; error: string | null } = await resp.json();
        if (cancelled) return;
        setPhase(state.phase);
        if (state.phase === "done") {
          await onRefresh();
          setAdding("none");
        } else if (state.phase === "error") {
          setError(state.error ?? "OAuth failed");
          setAdding("none");
        }
      } catch {
        /* ignore */
      }
    }, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [adding, onRefresh]);

  async function startGmail() {
    setError(null);
    setAdding("gmail");
    setPhase("starting");
    try {
      const resp = await fetch(api("/api/accounts/gmail/connect"), { method: "POST" });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${body.slice(0, 240)}`);
      }
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
      setAdding("none");
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h2">Accounts</h2>

      {accounts.length === 0 ? (
        <p className="text-small text-text-tertiary">No mailboxes connected yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {accounts.map((account) => (
            <li
              key={account.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent">
                {account.kind === "gmail" ? (
                  <span className="font-mono text-caption font-bold">G</span>
                ) : (
                  <Server className="h-4 w-4" />
                )}
              </div>
              <div className="flex flex-1 flex-col min-w-0">
                <span className="truncate text-body text-text-primary">{account.email_address}</span>
                <span className="text-caption text-text-tertiary">
                  {account.kind.toUpperCase()} ·{" "}
                  {account.last_synced_at
                    ? `last synced ${new Date(account.last_synced_at).toLocaleString()}`
                    : "not synced yet"}
                  {account.last_error && ` · error: ${account.last_error.slice(0, 80)}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onDisconnect(account)}
                aria-label="Disconnect"
                className="rounded p-1 text-text-tertiary hover:bg-bg hover:text-urgent"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding === "none" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={startGmail}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-body text-text-secondary hover:bg-surface-elevated"
          >
            <Plus className="h-3.5 w-3.5" /> Add Gmail
          </button>
          <button
            type="button"
            onClick={() => setAdding("imap")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-body text-text-secondary hover:bg-surface-elevated"
          >
            <Plus className="h-3.5 w-3.5" /> Add IMAP
          </button>
        </div>
      )}

      {adding === "gmail" && (
        <div className="rounded-md border border-border bg-surface-elevated px-3 py-2 text-small text-text-secondary">
          {phaseLabel(phase)}
          <button
            type="button"
            onClick={() => setAdding("none")}
            className="ml-2 text-text-tertiary hover:text-text-primary"
          >
            cancel
          </button>
        </div>
      )}

      {adding === "imap" && (
        <ImapForm
          onCancel={() => setAdding("none")}
          onConnected={async () => {
            setAdding("none");
            await onRefresh();
          }}
        />
      )}

      {error && (
        <div
          className="rounded-md border px-3 py-2 text-small"
          style={{ borderColor: "rgb(var(--urgent))", color: "rgb(var(--urgent))" }}
        >
          {error}
        </div>
      )}
    </section>
  );
}

function phaseLabel(phase: string): string {
  if (phase === "starting" || phase === "awaiting_consent") return "Waiting for Google consent…";
  if (phase === "exchanging") return "Exchanging tokens…";
  if (phase === "ingesting") return "Pulling your last 30 days of email…";
  return "Working…";
}

function ImapForm({
  onCancel,
  onConnected,
}: {
  onCancel: () => void;
  onConnected: () => Promise<void>;
}) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("993");
  const [emailAddress, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyPreset(name: string) {
    const preset = IMAP_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    setHost(preset.host);
    setPort(String(preset.port));
  }

  async function submit() {
    if (!emailAddress || !host || !password) {
      setError("Fill email, IMAP host, and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(api("/api/accounts/imap/connect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_address: emailAddress,
          host,
          port: Number(port) || 993,
          username: username || emailAddress,
          password,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 240)}`);
      await onConnected();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-elevated p-3">
      <select
        onChange={(event) => applyPreset(event.target.value)}
        defaultValue=""
        className="rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
      >
        <option value="">— pick a provider —</option>
        {IMAP_PRESETS.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name}
          </option>
        ))}
      </select>
      <input
        type="email"
        placeholder="Email address"
        value={emailAddress}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
      />
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <input
          placeholder="IMAP host"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
        />
        <input
          placeholder="Port"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          inputMode="numeric"
          className="rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
        />
      </div>
      <input
        placeholder="Username (often your email)"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
      />
      <input
        type="password"
        placeholder="Password (or app-specific password)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
      />
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-3 py-1.5 text-small text-text-secondary hover:bg-bg"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded px-3 py-1.5 text-small font-medium text-surface hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
      {error && (
        <div className="text-small" style={{ color: "rgb(var(--urgent))" }}>
          {error}
        </div>
      )}
    </div>
  );
}
