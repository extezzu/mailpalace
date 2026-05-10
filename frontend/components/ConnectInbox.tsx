"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Loader2, Lock, Mail, Server, Sparkles } from "lucide-react";

interface Props {
  onConnected: () => void;
}

const PHASE_LABEL: Record<string, string> = {
  awaiting_consent: "Waiting for Google consent…",
  exchanging: "Saving credentials…",
  ingesting: "Almost there…",
  done: "Done",
  error: "Failed",
};

type Mode = "gmail" | "imap";

interface ImapForm {
  email_address: string;
  host: string;
  port: string;
  username: string;
  password: string;
}

const PRESETS: { name: string; host: string; port: number }[] = [
  { name: "Outlook / Hotmail", host: "outlook.office365.com", port: 993 },
  { name: "iCloud Mail", host: "imap.mail.me.com", port: 993 },
  { name: "Fastmail", host: "imap.fastmail.com", port: 993 },
  { name: "Mailbox.org", host: "imap.mailbox.org", port: 993 },
  { name: "Proton (via Proton Bridge)", host: "127.0.0.1", port: 1143 },
];

const EMPTY_IMAP: ImapForm = {
  email_address: "",
  host: "",
  port: "993",
  username: "",
  password: "",
};

export function ConnectInbox({ onConnected }: Props) {
  const [mode, setMode] = useState<Mode>("gmail");
  const [provider, setProvider] = useState<string>("Ollama");
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imap, setImap] = useState<ImapForm>(EMPTY_IMAP);
  const [phase, setPhase] = useState<string>("idle");
  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;

  // Resilience: poll /api/accounts continuously while the wizard is open.
  // If a hot reload or refresh interrupted the OAuth flow but it still
  // finished server-side, the wizard hides itself the next time the
  // account list comes back non-empty.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const resp = await fetch(api("/api/accounts"));
        if (!resp.ok) return;
        const list = await resp.json();
        if (!cancelled && Array.isArray(list) && list.length > 0) {
          onConnectedRef.current();
        }
      } catch {
        /* ignore */
      }
    }
    const id = window.setInterval(tick, 500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const [consentUrl, setConsentUrl] = useState<string | null>(null);

  // Mirror the backend phase into local state so the button label is honest
  // about what's happening (Waiting for consent / Saving credentials).
  // Also surfaces the consent URL so the user can open Google manually if
  // the OS browser-launch fails silently (some Windows configurations).
  useEffect(() => {
    if (status !== "connecting") return;
    let cancelled = false;
    const id = window.setInterval(async () => {
      try {
        const resp = await fetch(api("/api/accounts/gmail/status"));
        if (!resp.ok) return;
        const state: { phase: string; consent_url: string | null } = await resp.json();
        if (!cancelled) {
          setPhase(state.phase);
          setConsentUrl(state.consent_url);
        }
      } catch {
        /* ignore */
      }
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [status]);

  // Pull the active LLM provider so the trust copy reflects what's actually
  // doing the triage. v0 lets the user toggle this in /settings.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const resp = await fetch(api("/api/settings"));
        if (!resp.ok) return;
        const data = await resp.json();
        if (cancelled) return;
        const map: Record<string, string> = {
          ollama: `Ollama (${data.ollama?.model ?? "llama3.1:8b"})`,
          anthropic: `Anthropic ${data.anthropic?.model ?? ""}`,
          openai: `OpenAI ${data.openai?.model ?? ""}`,
        };
        setProvider(map[data.active_provider] ?? data.active_provider);
      } catch {
        /* keep default */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function connectGmail() {
    setStatus("connecting");
    setErrorMessage(null);
    try {
      const startResp = await fetch(api("/api/accounts/gmail/connect"), { method: "POST" });
      if (!startResp.ok) {
        throw new Error(`HTTP ${startResp.status}: ${(await startResp.text()).slice(0, 240)}`);
      }
      // Poll for either a) the account row appearing in /api/accounts (we
      // can hide the wizard the instant the row exists, even before the
      // first ingest finishes), or b) the OAuth status flipping to error.
      // 250ms keeps wizard-exit latency low without flooding the backend;
      // the worker flips phase=done as soon as the keyring write returns.
      const POLL_MS = 250;
      const TIMEOUT_MS = 10 * 60 * 1000;
      const startedAt = Date.now();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        if (Date.now() - startedAt > TIMEOUT_MS) {
          throw new Error("Timed out waiting for Google consent.");
        }
        try {
          const accountsResp = await fetch(api("/api/accounts"));
          if (accountsResp.ok) {
            const list = await accountsResp.json();
            if (Array.isArray(list) && list.length > 0) break;
          }
        } catch {
          /* keep polling */
        }
        try {
          const statusResp = await fetch(api("/api/accounts/gmail/status"));
          if (statusResp.ok) {
            const state: { phase: string; error: string | null } = await statusResp.json();
            if (state.phase === "error") {
              throw new Error(state.error ?? "OAuth flow failed.");
            }
            if (state.phase === "ingesting" || state.phase === "done") break;
          }
        } catch (exc) {
          if (exc instanceof Error && exc.message.includes("OAuth flow failed")) throw exc;
        }
      }
      onConnected();
      setStatus("idle");
    } catch (exc) {
      setStatus("error");
      setErrorMessage(exc instanceof Error ? exc.message : String(exc));
    }
  }

  async function connectImap() {
    if (!imap.email_address || !imap.host || !imap.username || !imap.password) {
      setStatus("error");
      setErrorMessage("Fill every field, including IMAP host and password.");
      return;
    }
    setStatus("connecting");
    setErrorMessage(null);
    try {
      const resp = await fetch(api("/api/accounts/imap/connect"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_address: imap.email_address,
          host: imap.host,
          port: Number(imap.port) || 993,
          username: imap.username || imap.email_address,
          password: imap.password,
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 240)}`);
      onConnected();
      setStatus("idle");
    } catch (exc) {
      setStatus("error");
      setErrorMessage(exc instanceof Error ? exc.message : String(exc));
    }
  }

  const isLocalLLM = provider.startsWith("Ollama");

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-bg p-8">
      <div className="flex w-full max-w-xl flex-col gap-6 rounded-2xl border border-border bg-surface p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
          <Mail className="h-6 w-6" style={{ color: "rgb(var(--accent))" }} />
        </div>

        <div>
          <h1 className="text-display text-text-primary">Connect your inbox</h1>
          <p className="mt-2 text-body text-text-secondary">
            Pick a mailbox to triage. Email content stays on this machine; the active
            LLM does the summarising.
          </p>
        </div>

        <ul className="flex flex-col gap-2 text-small text-text-secondary">
          <li className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" style={{ color: "rgb(var(--accent))" }} /> Refresh
            tokens are stored in the OS keyring.
          </li>
          <li className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" style={{ color: "rgb(var(--accent))" }} />
            Triage runs through {provider}{isLocalLLM ? " locally" : " (remote API)"}.
            Switch in Settings.
          </li>
        </ul>

        <div className="flex gap-2">
          <ModeButton active={mode === "gmail"} onClick={() => setMode("gmail")}>
            <Mail className="h-4 w-4" /> Gmail
          </ModeButton>
          <ModeButton active={mode === "imap"} onClick={() => setMode("imap")}>
            <Server className="h-4 w-4" /> IMAP
          </ModeButton>
        </div>

        {mode === "gmail" ? (
          <>
            <button
              type="button"
              onClick={connectGmail}
              disabled={status === "connecting"}
              className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-body font-medium text-surface hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
              style={{ backgroundColor: "rgb(var(--accent))" }}
            >
              {status === "connecting" && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              {status === "connecting"
                ? PHASE_LABEL[phase] ?? "Waiting for Google consent…"
                : "Continue with Google"}
            </button>
            {status === "connecting" && phase === "awaiting_consent" && consentUrl && (
              <p className="text-small text-text-secondary">
                Browser didn&apos;t open?{" "}
                <a
                  href={consentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: "rgb(var(--accent))" }}
                >
                  Open Google consent in a new tab.
                </a>
              </p>
            )}
          </>
        ) : (
          <ImapForm
            value={imap}
            onChange={setImap}
            onSubmit={connectImap}
            disabled={status === "connecting"}
          />
        )}

        {status === "error" && errorMessage && (
          <div
            className="rounded-md border px-3 py-2 text-small"
            style={{ borderColor: "rgb(var(--urgent))", color: "rgb(var(--urgent))" }}
          >
            {errorMessage.includes("google_credentials.json") ? (
              <>
                Google credentials file missing. Save the OAuth client JSON to{" "}
                <code className="font-mono">~/.mailpalace/google_credentials.json</code> and try again.
              </>
            ) : errorMessage.includes("access_denied") ? (
              <>
                Google blocked the request. Add your gmail to{" "}
                <strong>OAuth consent screen → Test users</strong> in Google Cloud Console.
              </>
            ) : (
              errorMessage
            )}
          </div>
        )}

        <p className="text-caption text-text-tertiary">
          Tutanota does not expose IMAP and no maintained community bridge exists in 2026.
          Proton: install Proton Bridge first, then connect via the IMAP tab.
        </p>
      </div>
    </main>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-body transition-colors " +
        (active
          ? "border-accent bg-accent/10 text-text-primary"
          : "border-border text-text-secondary hover:bg-surface-elevated")
      }
    >
      {children}
    </button>
  );
}

function ImapForm({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: ImapForm;
  onChange: (next: ImapForm) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  function applyPreset(name: string) {
    const preset = PRESETS.find((p) => p.name === name);
    if (!preset) return;
    onChange({ ...value, host: preset.host, port: String(preset.port) });
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="text-small text-text-secondary">
        Preset
        <select
          onChange={(event) => applyPreset(event.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
          defaultValue=""
        >
          <option value="">— pick a provider —</option>
          {PRESETS.map((preset) => (
            <option key={preset.name} value={preset.name}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-small text-text-secondary">
        Email address
        <input
          type="email"
          value={value.email_address}
          onChange={(event) => onChange({ ...value, email_address: event.target.value })}
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
          placeholder="you@example.com"
          autoComplete="email"
        />
      </label>
      <div className="grid grid-cols-[1fr_120px] gap-2">
        <label className="text-small text-text-secondary">
          IMAP host
          <input
            value={value.host}
            onChange={(event) => onChange({ ...value, host: event.target.value })}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
            placeholder="imap.example.com"
          />
        </label>
        <label className="text-small text-text-secondary">
          Port
          <input
            value={value.port}
            onChange={(event) => onChange({ ...value, port: event.target.value })}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
            inputMode="numeric"
          />
        </label>
      </div>
      <label className="text-small text-text-secondary">
        Username (often your full email)
        <input
          value={value.username}
          onChange={(event) => onChange({ ...value, username: event.target.value })}
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
          autoComplete="username"
        />
      </label>
      <label className="text-small text-text-secondary">
        Password (or app-specific password)
        <input
          type="password"
          value={value.password}
          onChange={(event) => onChange({ ...value, password: event.target.value })}
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-body outline-none focus:border-accent"
          autoComplete="current-password"
        />
      </label>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="mt-2 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-body font-medium text-surface hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        style={{ backgroundColor: "rgb(var(--accent))" }}
      >
        {disabled ? "Connecting…" : "Connect IMAP"}
      </button>
    </div>
  );
}
