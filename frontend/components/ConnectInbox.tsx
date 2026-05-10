"use client";

import { useState } from "react";
import { Lock, Mail, Sparkles } from "lucide-react";

interface Props {
  onConnected: () => void;
}

/**
 * First-run experience.
 *
 * Shown when the user has no connected mailbox. Walks them through
 * the Google consent screen for now; IMAP / Tutanota live behind a
 * "Connect another way" link in v0.2.
 */
export function ConnectInbox({ onConnected }: Props) {
  const [status, setStatus] = useState<"idle" | "connecting" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function connectGmail() {
    setStatus("connecting");
    setErrorMessage(null);
    try {
      const resp = await fetch("/api/accounts/gmail/connect", { method: "POST" });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${body.slice(0, 240)}`);
      }
      onConnected();
      setStatus("idle");
    } catch (exc) {
      setStatus("error");
      setErrorMessage(exc instanceof Error ? exc.message : String(exc));
    }
  }

  return (
    <main className="flex h-screen w-screen items-center justify-center bg-bg p-8">
      <div className="flex w-full max-w-xl flex-col gap-6 rounded-2xl border border-border bg-surface p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15">
          <Mail className="h-6 w-6" style={{ color: "rgb(var(--accent))" }} />
        </div>

        <div>
          <h1 className="text-display text-text-primary">Connect your inbox</h1>
          <p className="mt-2 text-body text-text-secondary">
            Pick a mailbox to triage. Email content stays on this machine; the
            local LLM does the summarising. We never upload your messages.
          </p>
        </div>

        <ul className="flex flex-col gap-2 text-small text-text-secondary">
          <li className="flex items-center gap-2">
            <Lock className="h-3.5 w-3.5" style={{ color: "rgb(var(--accent))" }} /> Refresh tokens are stored in the OS keyring.
          </li>
          <li className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" style={{ color: "rgb(var(--accent))" }} /> Triage runs through Ollama locally; remote LLMs are opt-in only.
          </li>
        </ul>

        <button
          type="button"
          onClick={connectGmail}
          disabled={status === "connecting"}
          className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-body font-medium text-surface hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          {status === "connecting" ? "Waiting for Google consent…" : "Continue with Google"}
        </button>

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
            ) : (
              errorMessage
            )}
          </div>
        )}

        <p className="text-caption text-text-tertiary">
          Outlook, iCloud, Fastmail, and any other IMAP server land in v0.2.
        </p>
      </div>
    </main>
  );
}
