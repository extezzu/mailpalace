"use client";

import { useEffect, useState } from "react";
import { Plus, Server, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { ImapConnectForm } from "@/components/email/ImapConnectForm";

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
        <ImapConnectForm
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
