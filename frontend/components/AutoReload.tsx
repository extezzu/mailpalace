"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";

/**
 * Background "is the backend a different process than when this tab loaded?"
 * watcher. When the answer flips, the page reloads itself.
 *
 * Live development with `npm start` doesn't push HMR updates the way the dev
 * server does, so a bundle change after a code push leaves the user's tab
 * running stale JavaScript. This watcher pings /api/version every 15 seconds
 * and reloads on a token change. The token is the backend's PID + start
 * timestamp; restarting the backend (which always accompanies a frontend
 * deploy here) flips it.
 */
export function AutoReload() {
  useEffect(() => {
    let cancelled = false;
    let baseline: string | null = null;

    async function tick() {
      try {
        const resp = await fetch(api("/api/version"));
        if (!resp.ok) return;
        const data: { process_token: string } = await resp.json();
        if (baseline === null) {
          baseline = data.process_token;
          return;
        }
        if (!cancelled && data.process_token !== baseline) {
          window.location.reload();
        }
      } catch {
        /* network blip; retry next tick */
      }
    }

    tick();
    const id = window.setInterval(tick, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return null;
}
