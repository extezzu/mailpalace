"use client";

import { useEffect, useState } from "react";
import { Plus, Server, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { IMAP_PRESETS } from "@/lib/imap-presets";

export interface ConnectedAccount {
  id: number;
  kind: "gmail" | "imap";
  email_address: string;
  label: string;
  is_active: boolean;
  last_synced_at: string | null;
  last_error: string | null;
}

interface Props {
  accounts: ConnectedAccount[];
  onDisconnect: (account: ConnectedAccount) => void;
  onRefresh: () => Promise<void>;
}

type AddState = "none" | "gmail" | "imap";

export function AccountsSection({ accounts, onDisconnect, onRefresh }: Props) {
  const [adding, setAdding] = useState<AddState>("none");
  const [phase, setPhase] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);

  // Tail the OAuth worker's phase. The settings page lets users add a
  // second account after the wizard already onboarded the first, so the
  // polling effect lives here instead of in ConnectInbox.
  useEffect(() => {
    if (adding !== "gmail") return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
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
        /* swallow — next tick will retry */
      }
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
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
            <AccountRow
              key={account.id}
              account={account}
              onDisconnect={() => onDisconnect(account)}
            />
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
        <ImapAddForm
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

function AccountRow({
  account,
  onDisconnect,
}: {
  account: ConnectedAccount;
  onDisconnect: () => void;
}) {
  const lastSyncedLabel = account.last_synced_at
    ? `last synced ${new Date(account.last_synced_at).toLocaleString()}`
    : "not synced yet";
  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3">
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
          {account.kind.toUpperCase()} · {lastSyncedLabel}
          {account.last_error && ` · error: ${account.last_error.slice(0, 80)}`}
        </span>
      </div>
      <button
        type="button"
        onClick={onDisconnect}
        aria-label="Disconnect"
        className="rounded p-1 text-text-tertiary hover:bg-bg hover:text-urgent"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </li>
  );
}

function phaseLabel(phase: string): string {
  if (phase === "starting" || phase === "awaiting_consent") {
    return "Waiting for Google consent…";
  }
  if (phase === "exchanging") return "Saving credentials…";
  if (phase === "ingesting") return "Almost there…";
  return "Working…";
}

interface ImapFormState {
  host: string;
  port: string;
  emailAddress: string;
  username: string;
  password: string;
}

const EMPTY_IMAP: ImapFormState = {
  host: "",
  port: "993",
  emailAddress: "",
  username: "",
  password: "",
};

function ImapAddForm({
  onCancel,
  onConnected,
}: {
  onCancel: () => void;
  onConnected: () => Promise<void>;
}) {
  const [form, setForm] = useState<ImapFormState>(EMPTY_IMAP);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyPreset(name: string) {
    const preset = IMAP_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    setForm((prev) => ({ ...prev, host: preset.host, port: String(preset.port) }));
  }

  async function submit() {
    if (!form.emailAddress || !form.host || !form.password) {
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
          email_address: form.emailAddress,
          host: form.host,
          port: Number(form.port) || 993,
          username: form.username || form.emailAddress,
          password: form.password,
        }),
      });
      if (!resp.ok) {
        // Surface backend's HTTPException detail (auth fail, host
        // unreachable, etc.) so the user can fix the form rather
        // than see a generic "HTTP 401".
        const body = await resp.json().catch(() => ({}));
        const detail = body?.detail ?? `HTTP ${resp.status}`;
        throw new Error(detail);
      }
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
        {IMAP_PRESETS.map((preset) => (
          <option key={preset.name} value={preset.name}>
            {preset.name}
          </option>
        ))}
      </select>
      <input
        type="email"
        placeholder="Email address"
        value={form.emailAddress}
        onChange={(e) => setForm({ ...form, emailAddress: e.target.value })}
        className="rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
      />
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <input
          placeholder="IMAP host"
          value={form.host}
          onChange={(e) => setForm({ ...form, host: e.target.value })}
          className="rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
        />
        <input
          placeholder="Port"
          value={form.port}
          onChange={(e) => setForm({ ...form, port: e.target.value })}
          inputMode="numeric"
          className="rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
        />
      </div>
      <input
        placeholder="Username (often your email)"
        value={form.username}
        onChange={(e) => setForm({ ...form, username: e.target.value })}
        className="rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
      />
      <input
        type="password"
        placeholder="Password (or app-specific password)"
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
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
