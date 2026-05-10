"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { IMAP_PRESETS, type ImapPreset } from "@/lib/imap-presets";

interface ImapFormState {
  host: string;
  port: string;
  emailAddress: string;
  username: string;
  password: string;
}

const EMPTY: ImapFormState = {
  host: "",
  port: "993",
  emailAddress: "",
  username: "",
  password: "",
};

export interface ImapConnectFormProps {
  onCancel: () => void;
  onConnected: () => Promise<void> | void;
  /** Optional initial preset slug (matches `name` in IMAP_PRESETS). */
  defaultPreset?: string;
}

export function ImapConnectForm({
  onCancel,
  onConnected,
  defaultPreset,
}: ImapConnectFormProps) {
  const [form, setForm] = useState<ImapFormState>(() => {
    const preset = defaultPreset
      ? IMAP_PRESETS.find((p) => p.name === defaultPreset)
      : undefined;
    return preset
      ? { ...EMPTY, host: preset.host, port: String(preset.port) }
      : EMPTY;
  });
  const [activeHint, setActiveHint] = useState<string | undefined>(
    () => IMAP_PRESETS.find((p) => p.name === defaultPreset)?.hint,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyPreset(name: string) {
    const preset = IMAP_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    setForm((prev) => ({ ...prev, host: preset.host, port: String(preset.port) }));
    setActiveHint(preset.hint);
    setError(null);
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
        const body = await resp.json().catch(() => ({}));
        throw new Error(body?.detail ?? `HTTP ${resp.status}`);
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
        defaultValue={defaultPreset ?? ""}
        className="rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
      >
        <option value="">— pick a provider —</option>
        {IMAP_PRESETS.map((preset) => (
          <option key={preset.name} value={preset.name}>
            {preset.name}
          </option>
        ))}
      </select>

      {activeHint === "proton-bridge" && <ProtonBridgeHint host={form.host} port={form.port} />}

      <input
        type="email"
        placeholder="Email address"
        value={form.emailAddress}
        onChange={(e) => setForm({ ...form, emailAddress: e.target.value })}
        autoComplete="email"
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
        autoComplete="username"
        className="rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
      />
      <input
        type="password"
        placeholder={
          activeHint === "proton-bridge"
            ? "Password from Proton Bridge"
            : "Password (or app-specific password)"
        }
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
        autoComplete="current-password"
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
          className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-small font-medium text-surface hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {busy ? "Connecting…" : "Connect"}
        </button>
      </div>
      {error && <ImapErrorHint error={error} host={form.host} hint={activeHint} />}
    </div>
  );
}

function ProtonBridgeHint({ host, port }: { host: string; port: string }) {
  const [reachable, setReachable] = useState<boolean | null>(null);

  // Probe the host every time it changes. The backend probe is a single
  // 2-second TCP connect; we keep a manual cancellation flag so a fast
  // host edit doesn't update state on a stale response.
  useEffect(() => {
    let cancelled = false;
    setReachable(null);
    const portNum = Number(port) || 1143;
    fetch(api(`/api/accounts/imap/probe?host=${encodeURIComponent(host)}&port=${portNum}`))
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        setReachable(Boolean(body.reachable));
      })
      .catch(() => {
        if (!cancelled) setReachable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [host, port]);

  if (reachable === true) {
    return (
      <div className="rounded-md border border-border bg-surface px-3 py-2 text-small text-text-secondary">
        <span className="font-mono text-caption uppercase tracking-wide text-accent">
          Bridge detected
        </span>{" "}
        — open the Bridge app, copy the username and the IMAP password it
        shows there, and paste them below.
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-1 rounded-md border px-3 py-2 text-small"
      style={{ borderColor: "rgb(var(--urgent))", color: "rgb(var(--urgent))" }}
    >
      <span>
        {reachable === null
          ? "Checking for Proton Bridge…"
          : `No Proton Bridge listening on ${host}:${port}.`}
      </span>
      {reachable === false && (
        <span className="text-text-secondary">
          Proton Mail is end-to-end encrypted and only exposes IMAP through
          their local Bridge app. Install + run it, then paste the
          per-account credentials it shows.{" "}
          <a
            href="https://proton.me/mail/bridge"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline"
            style={{ color: "rgb(var(--accent))" }}
          >
            Download Bridge <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
          . Requires a paid Proton plan (Mail Plus / Family / Business).
        </span>
      )}
    </div>
  );
}

function ImapErrorHint({
  error,
  host,
  hint,
}: {
  error: string;
  host: string;
  hint: string | undefined;
}) {
  const lower = error.toLowerCase();
  const isAppPassword =
    lower.includes("application-specific password") || lower.includes("app password");
  const isProton = hint === "proton-bridge";
  const isReachError =
    lower.includes("could not reach") || lower.includes("connection refused");

  return (
    <div
      className="flex flex-col gap-2 rounded-md border px-3 py-2 text-small"
      style={{ borderColor: "rgb(var(--urgent))", color: "rgb(var(--urgent))" }}
    >
      <span>{error}</span>
      {isAppPassword && (
        <span className="text-text-secondary">
          Gmail no longer accepts your normal password over IMAP. Create an{" "}
          <a
            href="https://myaccount.google.com/apppasswords"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
            style={{ color: "rgb(var(--accent))" }}
          >
            App Password
          </a>{" "}
          (2-Step Verification must be on) and paste it instead.
        </span>
      )}
      {isProton && isReachError && (
        <span className="text-text-secondary">
          Make sure Proton Bridge is running locally and unlocked, then click
          Connect again.
        </span>
      )}
    </div>
  );
}
