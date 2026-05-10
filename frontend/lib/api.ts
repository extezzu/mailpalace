// All fetches go straight at the FastAPI backend on 127.0.0.1:7330. We do
// not proxy through Next.js because the production rewrite occasionally
// returns 500 when many polled requests pile up; CORS on the backend
// already allows localhost:3000.

export const API_BASE = "http://127.0.0.1:7330";

export function api(path: string): string {
  if (!path.startsWith("/api/")) {
    throw new Error(`api(): expected path to start with /api/, got ${path}`);
  }
  return `${API_BASE}${path}`;
}
