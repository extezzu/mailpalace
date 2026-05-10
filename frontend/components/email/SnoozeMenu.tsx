"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  emailId: number;
  /** Optional callback when snooze succeeds — caller can update local state. */
  onSnoozed?: () => void;
}

interface Preset {
  label: string;
  description: string;
  computeMinutes: () => number;
}

// Times computed at click so "tomorrow morning" always means tomorrow
// from now, not from when the menu first rendered.
const PRESETS: Preset[] = [
  {
    label: "In 1 hour",
    description: "Hide until later this hour",
    computeMinutes: () => 60,
  },
  {
    label: "Later today",
    description: "18:00 today (or tomorrow if it is past 18:00)",
    computeMinutes: () => {
      const now = new Date();
      const target = new Date(now);
      target.setHours(18, 0, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      return Math.max(1, Math.round((target.getTime() - now.getTime()) / 60000));
    },
  },
  {
    label: "Tomorrow morning",
    description: "08:00 tomorrow",
    computeMinutes: () => {
      const now = new Date();
      const target = new Date(now);
      target.setDate(target.getDate() + 1);
      target.setHours(8, 0, 0, 0);
      return Math.max(1, Math.round((target.getTime() - now.getTime()) / 60000));
    },
  },
  {
    label: "Next week",
    description: "Monday 08:00",
    computeMinutes: () => {
      const now = new Date();
      const target = new Date(now);
      const dayOfWeek = target.getDay(); // 0 = Sun, 1 = Mon
      const daysToMonday = (8 - dayOfWeek) % 7 || 7;
      target.setDate(target.getDate() + daysToMonday);
      target.setHours(8, 0, 0, 0);
      return Math.max(60, Math.round((target.getTime() - now.getTime()) / 60000));
    },
  },
];

export function SnoozeMenu({ emailId, onSnoozed }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on click outside / Escape so the menu does not get stuck open
  // when the user clicks somewhere else.
  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  async function snooze(preset: Preset) {
    setBusy(preset.label);
    setError(null);
    try {
      const resp = await fetch(api(`/api/email/${emailId}/snooze`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: preset.computeMinutes() }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data && data.detail) || `HTTP ${resp.status}`);
      }
      setOpen(false);
      onSnoozed?.();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : String(exc));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Snooze"
        title="Snooze — hide until a chosen time"
        className="inline-flex h-8 w-8 items-center justify-center rounded text-text-tertiary hover:bg-bg hover:text-text-primary"
      >
        <Clock className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-1 w-[260px] overflow-hidden rounded-md border border-border bg-surface shadow-lg"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="border-b border-border px-3 py-2 text-caption font-mono uppercase tracking-wider text-text-tertiary">
            Snooze until
          </div>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => snooze(preset)}
              disabled={busy !== null}
              className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-body text-text-primary hover:bg-surface-elevated disabled:cursor-wait disabled:opacity-60"
            >
              <span>{preset.label}</span>
              <span className="text-caption text-text-tertiary">{preset.description}</span>
            </button>
          ))}
          {error && (
            <div
              className="border-t border-border px-3 py-2 text-caption"
              style={{ color: "rgb(var(--urgent))" }}
            >
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
