import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a delta as "5m", "3h", "2d", "1w", or a short date.
 * `nowMs` defaults to {@link Date.now}; pass a stable reference during SSR to
 * avoid hydration mismatches. Time-sensitive callers should bump it from a
 * `useEffect` after mount.
 */
export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const ms = nowMs - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk}w`;
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function senderInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

// Deterministic pastel background, hashed off the email domain.
export function avatarBg(email: string): string {
  const domain = email.split("@")[1] ?? email;
  let hash = 0;
  for (let i = 0; i < domain.length; i++) hash = (hash * 31 + domain.charCodeAt(i)) >>> 0;
  const palette = [
    "#E8D9CC",
    "#D7CCE8",
    "#CCE8DA",
    "#E8E0CC",
    "#CCDCE8",
    "#E8CCD9",
    "#DBE8CC",
  ];
  return palette[hash % palette.length];
}
