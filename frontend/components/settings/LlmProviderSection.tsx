"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

export interface ProviderState {
  api_key_set: boolean;
  model: string;
}

export interface LlmSettings {
  active_provider: "ollama" | "anthropic" | "openai";
  ollama: { base_url: string; model: string };
  anthropic: ProviderState;
  openai: ProviderState;
}

interface Props {
  settings: LlmSettings;
  onChange: (next: LlmSettings) => void;
  onError: (message: string) => void;
  onSavingChange: (saving: boolean) => void;
}

type RemoteProvider = "anthropic" | "openai";

const REMOTE_PROVIDERS: RemoteProvider[] = ["anthropic", "openai"];

const PROVIDER_LABEL: Record<LlmSettings["active_provider"], string> = {
  ollama: "Ollama (local)",
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
};

export function LlmProviderSection({
  settings,
  onChange,
  onError,
  onSavingChange,
}: Props) {
  const [editing, setEditing] = useState<RemoteProvider | null>(null);

  async function patch(body: Record<string, unknown>) {
    onSavingChange(true);
    try {
      const resp = await fetch(api("/api/settings"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const detail = (data && typeof data.detail === "string" && data.detail) || `HTTP ${resp.status}`;
        throw new Error(detail);
      }
      onChange(data);
    } catch (exc) {
      onError(exc instanceof Error ? exc.message : String(exc));
    } finally {
      onSavingChange(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h2">Active LLM provider</h2>
      <div className="flex gap-2">
        {(["ollama", ...REMOTE_PROVIDERS] as const).map((provider) => {
          const active = settings.active_provider === provider;
          return (
            <button
              key={provider}
              type="button"
              onClick={() => {
                if (provider === "ollama") {
                  void patch({ active_provider: "ollama" });
                  return;
                }
                if (settings[provider].api_key_set) {
                  void patch({ active_provider: provider });
                } else {
                  setEditing(provider);
                }
              }}
              className={
                "rounded-md border px-3 py-1.5 text-body " +
                (active
                  ? "border-accent bg-accent text-surface"
                  : "border-border text-text-secondary hover:bg-surface-elevated")
              }
            >
              {PROVIDER_LABEL[provider]}
            </button>
          );
        })}
      </div>

      <p className="text-small text-text-tertiary">
        Ollama runs entirely on this machine. Anthropic and OpenAI send the email
        body to a remote API — switching to one crosses the local-first
        boundary intentionally. Keys are stored in the OS keyring, never on
        disk in plain text, never returned by the API.
      </p>

      <div className="flex flex-col gap-2">
        <ProviderRow
          name="Ollama"
          summary={`${settings.ollama.model} @ ${settings.ollama.base_url}`}
          status="local"
        />
        {REMOTE_PROVIDERS.map((provider) => (
          <ProviderRow
            key={provider}
            name={PROVIDER_LABEL[provider]}
            summary={settings[provider].model}
            status={settings[provider].api_key_set ? "key-set" : "no-key"}
            onConfigure={() => setEditing(provider)}
          />
        ))}
      </div>

      {editing && (
        <ApiKeyEditor
          provider={editing}
          currentModel={settings[editing].model}
          hasKey={settings[editing].api_key_set}
          onCancel={() => setEditing(null)}
          onSubmit={async (apiKey, model) => {
            const body: Record<string, unknown> = {
              [`${editing}_api_key`]: apiKey,
            };
            if (model && model !== settings[editing].model) {
              body[`${editing}_model`] = model;
            }
            // If the user is configuring this provider for the first time we
            // assume they want it active immediately. They can flip back to
            // Ollama with one click if not.
            if (apiKey && !settings[editing].api_key_set) {
              body.active_provider = editing;
            }
            await patch(body);
            setEditing(null);
          }}
          onClear={async () => {
            // Empty string tells the backend to forget the key in keyring.
            const body: Record<string, unknown> = { [`${editing}_api_key`]: "" };
            if (settings.active_provider === editing) {
              body.active_provider = "ollama";
            }
            await patch(body);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function ProviderRow({
  name,
  summary,
  status,
  onConfigure,
}: {
  name: string;
  summary: string;
  status: "local" | "key-set" | "no-key";
  onConfigure?: () => void;
}) {
  const statusBlock =
    status === "local" ? (
      <span className="text-caption font-mono uppercase text-accent">local</span>
    ) : status === "key-set" ? (
      <span className="inline-flex items-center gap-1 text-caption font-mono uppercase text-accent">
        <Check className="h-3 w-3" /> key saved
      </span>
    ) : (
      <span className="text-caption font-mono uppercase text-text-tertiary">no key</span>
    );
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2 text-body">
      <div className="flex flex-1 flex-col">
        <span className="text-text-primary">{name}</span>
        <span className="font-mono text-caption text-text-tertiary">{summary}</span>
      </div>
      {statusBlock}
      {onConfigure && (
        <button
          type="button"
          onClick={onConfigure}
          className="rounded border border-border px-2 py-1 text-caption text-text-secondary hover:bg-surface-elevated"
        >
          {status === "key-set" ? "Update" : "Set up"}
        </button>
      )}
    </div>
  );
}

function ApiKeyEditor({
  provider,
  currentModel,
  hasKey,
  onCancel,
  onSubmit,
  onClear,
}: {
  provider: RemoteProvider;
  currentModel: string;
  hasKey: boolean;
  onCancel: () => void;
  onSubmit: (apiKey: string, model: string) => Promise<void>;
  onClear: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(currentModel);
  const [busy, setBusy] = useState(false);

  const help =
    provider === "anthropic"
      ? {
          url: "https://console.anthropic.com/settings/keys",
          urlLabel: "console.anthropic.com",
          prefix: "sk-ant-…",
        }
      : {
          url: "https://platform.openai.com/api-keys",
          urlLabel: "platform.openai.com",
          prefix: "sk-…",
        };

  async function submit() {
    if (!apiKey.trim()) return;
    setBusy(true);
    try {
      await onSubmit(apiKey.trim(), model.trim());
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await onClear();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-elevated p-3">
      <span className="text-small text-text-secondary">
        Paste your {PROVIDER_LABEL[provider]} API key. Get one at{" "}
        <a
          href={help.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
          style={{ color: "rgb(var(--accent))" }}
        >
          {help.urlLabel}
        </a>
        . Stored in the OS keyring; never returned by the API.
      </span>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        placeholder={help.prefix}
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-body outline-none focus:border-accent"
      />
      <label className="flex flex-col gap-1 text-small text-text-tertiary">
        Model
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-body outline-none focus:border-accent"
        />
      </label>
      <div className="flex justify-end gap-2">
        {hasKey && (
          <button
            type="button"
            onClick={clear}
            disabled={busy}
            className="rounded px-3 py-1.5 text-small text-text-secondary hover:bg-bg disabled:cursor-wait"
          >
            Remove key
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded px-3 py-1.5 text-small text-text-secondary hover:bg-bg disabled:cursor-wait"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy || !apiKey.trim()}
          className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-small font-medium text-surface hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          style={{ backgroundColor: "rgb(var(--accent))" }}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {busy ? "Saving…" : "Save & activate"}
        </button>
      </div>
    </div>
  );
}
