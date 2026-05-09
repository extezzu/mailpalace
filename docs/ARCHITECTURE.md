# MailPalace v0 — Local-First Email AI Agent Architecture

**Date:** 2026-05-09
**Owner:** Dmytro (Copenhagen, freelancer, Python-strong)
**Codename:** `mailpalace` (sister project to PolyPalace)
**Status:** Architecture spec, not yet built. Builder agents: follow this literally; deviations require lead approval.
**Scope:** v0 only — single-user, local machine, dogfood-first. No multi-tenant, no cloud deploy, no team features.

---

## 0. Restating the problem

We are building a local-first email triage agent for one user (Dmytro), running on his laptop, that:

1. Pulls his email (Gmail OAuth or any IMAP server) every 15 min.
2. Classifies, summarizes (in Russian, personally addressed), and suggests an action for each new message.
3. Exposes a local web dashboard where he can browse the triaged inbox, read full threads with AI metadata, and ask for a draft reply on demand (in the email's source language).
4. Runs LLM inference on local Ollama by default. Anthropic / OpenAI keys are optional fallbacks via env config.
5. Does not require Docker. Does not require Postgres or Redis. SQLite only.
6. Stores email content on disk only. Email body bytes never leave the machine when Ollama is the active provider.

This is the simplest deliverable that meets the privacy promise the landscape report (`email-ai-agent-landscape-2026-05-09.md`) identified as the underserved wedge.

---

## 1. Constraints (stated vs inferred)

| # | Constraint | Source | Type |
|---|---|---|---|
| C1 | Local-first; email body never leaves machine on default provider | Lead brief | Stated |
| C2 | Default LLM = Ollama; Anthropic/OpenAI optional fallback via env | Lead brief | Stated |
| C3 | No Docker, no Postgres, no Redis. SQLite only. | Lead brief | Stated |
| C4 | Web dashboard from day one (no CLI-only) | Lead brief | Stated |
| C5 | Multilingual ingest; summary FOR USER in Russian; UI in English | Lead brief | Stated |
| C6 | Sources: Gmail API + IMAP (covers Tutanota via tuta-bridge, Outlook, iCloud) | Lead brief | Stated |
| C7 | Owner is Python-strong, has shipped Python MCP servers (PolyPalace) | CLAUDE.md, MEMORY.md | Stated |
| C8 | Owner has Node.js capability (ai-telegram-assistant) but prefers Python | MEMORY.md | Stated |
| C9 | Schedule: 15-min poll cycle | Lead brief | Stated |
| C10 | OAuth read-only scope for v0 (drafts shown in UI only) | Lead brief, "draft reply on demand" | Inferred |
| C11 | Single user, single machine. No remote access, no auth on dashboard. | v0 scope | Inferred |
| C12 | Triage latency: <30 s per email on local Ollama 8B class. Background job. | Hardware reality | Inferred |
| C13 | Dashboard latency: <150 ms inbox views, <2 s thread open. | UX baseline | Inferred |
| C14 | OS targets: Windows 11 (owner's daily driver), macOS, Linux. | MEMORY.md | Inferred |
| C15 | Python 3.11+ (matches PolyPalace cpython-311) | polypalace research dir | Inferred |

---

## A. System diagram

```
                                 +---------------------------------+
                                 |   User browser (localhost:7330) |
                                 +----------------+----------------+
                                                  |
                                                  | HTTP/JSON + SSE
                                                  v
+------------------------------------------------------------------------------+
|                          mailpalace.web (FastAPI + Jinja2)                   |
|   /api/inbox  /api/email/{id}  /api/draft  /api/settings  /api/events (SSE)  |
+------+-----------------------+----------------+-----------------+------------+
       |                       |                |                 |
       v                       v                v                 v
+--------------+      +-----------------+   +---------+    +--------------+
| repo (CRUD   |      | scheduler       |   | drafter |    | settings     |
|  on SQLite)  |      | (APScheduler)   |   |         |    | (env+keyring)|
+------+-------+      +--------+--------+   +----+----+    +------+-------+
       |                       |                 |                |
       |                       v                 v                |
       |            +------------------+   +------------+         |
       |            | ingest pipeline  |   | LLM router |<--------+
       |            | (per-account)    |   +-----+------+
       |            +--------+---------+         |
       |                     |                   |
       |          +----------+--------+      +---+---------------------+
       |          |                   |      |                         |
       v          v                   v      v                         v
   +--------+ +---------+      +-----------+ +-----------+      +-------------+
   | SQLite | | mail    |      | mail      | | provider: | ...  | provider:   |
   | file   | | source: |      | source:   | | ollama    |      | anthropic / |
   | mail.db| | gmail   |      | imap      | | (default) |      | openai      |
   +--------+ +----+----+      +-----+-----+ +-----+-----+      +------+------+
                   |                 |             |                   |
                   v                 v             v                   v
              Google API         Any IMAP       127.0.0.1:11434     api.anthropic.com
              (oauth2)           server                              (only if user opts in)
```

Solid arrows = data flow. Email content crosses the dashed boundary into a remote LLM provider only when the user explicitly switches the active provider away from `ollama` in settings. Ingest pipeline writes to SQLite first, then enqueues a triage job; triage job updates the same row. SSE stream notifies the open dashboard tab.

---

## B. Module boundaries

Single Python package, src layout. Versions pinned to a `pyproject.toml` `[project] requires-python = ">=3.11"`.

```
src/mailpalace/
  __init__.py
  __main__.py               # python -m mailpalace boots the app (uvicorn + scheduler)
  config.py                 # Pydantic Settings: paths, ports, provider, secrets
  logging.py                # structlog config, JSON logs to ~/.mailpalace/logs/

  db/
    __init__.py
    engine.py               # SQLAlchemy 2.x sync engine + session factory
    schema.py               # SQLAlchemy ORM models (mirror section C)
    migrations/             # Alembic migrations
    repo.py                 # query helpers; the only module web/scheduler call into

  mail/
    __init__.py
    base.py                 # MailSource Protocol (section F)
    gmail.py                # GmailSource: google-api-python-client + history API
    imap.py                 # ImapSource: imaplib + email.parser (stdlib)
    parse.py                # raw RFC822 -> normalized dict (text/html, attachments meta)

  llm/
    __init__.py
    base.py                 # LLMProvider Protocol (section E)
    ollama.py               # Default. httpx client to 127.0.0.1:11434.
    anthropic.py            # anthropic-sdk-python, gated behind config flag
    openai.py               # openai-sdk, gated behind config flag
    router.py               # picks active provider from settings; circuit breaker
    prompts.py              # all prompt templates (Russian summary, draft, classify)

  pipeline/
    __init__.py
    ingest.py               # fetch new messages -> insert -> enqueue triage
    triage.py               # language detect, classify, summarize, suggest action
    draft.py                # on-demand draft generator
    language.py             # py3langid wrapper (offline, no network)
    jobs.py                 # APScheduler job definitions

  auth/
    __init__.py
    gmail_oauth.py          # OAuth installed-app flow; refresh token storage
    secrets.py              # keyring wrapper + cryptography fallback

  web/
    __init__.py
    app.py                  # FastAPI app factory
    deps.py                 # request-scoped session, current settings
    routes/
      inbox.py
      email.py
      draft.py
      settings.py
      events.py             # SSE
    templates/              # Jinja2: base.html, inbox.html, thread.html, settings.html
    static/                 # tailwind output, htmx.min.js, alpine.min.js, fonts
```

Why this carving:
- `db/` is the only module that knows about SQLAlchemy. `pipeline/` and `web/` call `repo.py` functions. No raw SQL or ORM queries leak into routes.
- `mail/` and `llm/` hide protocol-specific pain. The rest of the code never imports `imaplib` or `httpx` directly.
- `auth/` is isolated because corrupted keyring or expired refresh token requires a different recovery story than ingest errors.
- `pipeline/` orchestrates `mail` + `llm` + `db`. It owns the business logic.

---

## C. Data model (SQLite schema)

SQLite 3.40+ (bundled with Python 3.11). WAL mode enabled at boot for concurrent reads while ingest writes. File at `~/.mailpalace/mail.db`.

```sql
-- ACCOUNTS: one row per connected mailbox
CREATE TABLE accounts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    kind            TEXT NOT NULL CHECK (kind IN ('gmail', 'imap')),
    label           TEXT NOT NULL,
    email_address   TEXT NOT NULL UNIQUE,
    config_json     TEXT NOT NULL,                -- JSON, partly encrypted (see auth/)
    last_synced_at  TIMESTAMP,
    last_sync_state TEXT,                         -- gmail historyId or imap UIDVALIDITY:UID
    last_error      TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- THREADS: provider thread groupings
CREATE TABLE threads (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id         INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    provider_thread_id TEXT NOT NULL,
    subject            TEXT,
    participants_json  TEXT NOT NULL,
    last_message_at    TIMESTAMP NOT NULL,
    message_count      INTEGER NOT NULL DEFAULT 0,
    UNIQUE (account_id, provider_thread_id)
);
CREATE INDEX idx_threads_account_lastmsg ON threads (account_id, last_message_at DESC);

-- EMAILS: one row per RFC822 message
CREATE TABLE emails (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id        INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    thread_id         INTEGER REFERENCES threads(id) ON DELETE SET NULL,
    provider_msg_id   TEXT NOT NULL,
    rfc822_message_id TEXT,
    from_name         TEXT,
    from_email        TEXT NOT NULL,
    to_json           TEXT NOT NULL,
    cc_json           TEXT,
    subject           TEXT,
    snippet           TEXT,
    body_text         TEXT,
    body_html         TEXT,
    received_at       TIMESTAMP NOT NULL,
    raw_size_bytes    INTEGER,
    is_unread         INTEGER NOT NULL DEFAULT 1,
    is_starred        INTEGER NOT NULL DEFAULT 0,
    has_attachments   INTEGER NOT NULL DEFAULT 0,
    ingested_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (account_id, provider_msg_id)
);
CREATE INDEX idx_emails_account_received ON emails (account_id, received_at DESC);
CREATE INDEX idx_emails_thread ON emails (thread_id, received_at);
CREATE INDEX idx_emails_unread ON emails (account_id, is_unread) WHERE is_unread = 1;

-- AI METADATA: 1:1 with emails, written by triage worker
CREATE TABLE ai_metadata (
    email_id                  INTEGER PRIMARY KEY REFERENCES emails(id) ON DELETE CASCADE,
    language_code             TEXT,
    classification            TEXT,                -- urgent|important|newsletter|spam|promotion|other
    classification_confidence REAL,
    summary_ru                TEXT,
    suggested_action          TEXT,
    provider_used             TEXT NOT NULL,
    model_version             TEXT,
    triaged_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    error_message             TEXT,
    retry_count               INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_ai_classification ON ai_metadata (classification);
CREATE INDEX idx_ai_language ON ai_metadata (language_code);

-- DRAFTS: on-demand generated, stored so user can iterate
CREATE TABLE drafts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id        INTEGER NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    body            TEXT NOT NULL,
    language_code   TEXT NOT NULL,
    provider_used   TEXT NOT NULL,
    instructions    TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    superseded_by   INTEGER REFERENCES drafts(id)
);
CREATE INDEX idx_drafts_email ON drafts (email_id, created_at DESC);

-- INGEST RUNS: audit trail
CREATE TABLE ingest_runs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    started_at    TIMESTAMP NOT NULL,
    finished_at   TIMESTAMP,
    new_count     INTEGER NOT NULL DEFAULT 0,
    error_count   INTEGER NOT NULL DEFAULT 0,
    status        TEXT NOT NULL,                  -- running|ok|partial|failed
    error_summary TEXT
);
CREATE INDEX idx_ingest_account_started ON ingest_runs (account_id, started_at DESC);

-- KV SETTINGS: app-wide knobs
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL                           -- JSON-encoded
);
```

Notes:
- No vector/embeddings table in v0. Search is SQL `LIKE` over `subject` + `snippet`. FTS5 virtual table can be added in a v0.1 migration without schema redesign.
- Body bytes are stored in plaintext. The laptop disk is the trust boundary. Disk encryption is the user's responsibility (FileVault / BitLocker). Documented in README.
- Why `ai_metadata` is a separate table: triage runs async after ingest. We can insert email rows immediately without blocking on LLM. Failed triage leaves `error_message != NULL` and we retry on the next pass.

---

## D. API contracts

REST + JSON, served by FastAPI on `127.0.0.1:7330`. Paths under `/api/`. Server-Sent Events for live updates so we don't introduce WebSockets (one less protocol = simpler).

### `GET /api/inbox`
Query: `account_id?` (int), `classification?` (csv), `language?` (csv), `unread?` (bool), `q?` (text), `limit?` (default 50), `cursor?` (received_at iso-8601).
Response:
```json
{
  "emails": [{
    "id": 412, "account_id": 1, "thread_id": 89,
    "from_name": "GitHub", "from_email": "noreply@github.com",
    "subject": "[org/repo] PR #14",
    "snippet": "...",
    "received_at": "2026-05-09T14:22:11Z",
    "is_unread": true, "has_attachments": false,
    "ai": {
      "language": "en",
      "classification": "important",
      "summary_ru": "Тебя добавили ревьюером в PR #14. Нужен ответ к четвергу.",
      "suggested_action": "Открыть PR и оставить ревью до 2026-05-12.",
      "provider": "ollama:llama3.1:8b"
    }
  }],
  "next_cursor": "2026-05-09T13:01:00Z"
}
```

### `GET /api/email/{id}`
Returns the email row + full thread (ordered ascending) + `ai_metadata` + drafts list.

### `POST /api/draft`
Body: `{ "email_id": 412, "instructions": "вежливо отказать, на английском" }`
Response: `{ "draft_id": 88, "body": "...", "language": "en", "provider_used": "ollama:llama3.1:8b" }`
Synchronous; streams tokens via SSE on `/api/events?topic=draft.412` if the client subscribes.

### `POST /api/email/{id}/triage`
Force re-triage. Body optional: `{ "provider": "anthropic" }` to one-off-override.

### `GET /api/accounts` / `POST /api/accounts` / `DELETE /api/accounts/{id}`
CRUD. POST kind=gmail returns an OAuth URL to visit. POST kind=imap accepts host/port/user/password.

### `GET /api/settings` / `PATCH /api/settings`
```json
{
  "active_provider": "ollama",
  "ollama":    { "base_url": "http://127.0.0.1:11434", "model": "llama3.1:8b" },
  "anthropic": { "api_key_set": true,  "model": "claude-haiku-4-5" },
  "openai":    { "api_key_set": false, "model": "gpt-4o-mini" },
  "poll_interval_minutes": 15,
  "summary_locale": "ru"
}
```
PATCH never returns the keys, only `*_set` booleans.

### `GET /api/events` (SSE)
Topics: `inbox.new`, `triage.done.{email_id}`, `ingest.run.{account_id}`, `draft.{email_id}` (token stream). One open SSE connection per dashboard tab is enough.

Errors: `application/problem+json` (RFC 7807). Status codes: 4xx for user input, 503 for provider/source down (with `retry_after` hint).

---

## E. LLM abstraction

```python
# src/mailpalace/llm/base.py
from typing import Protocol, AsyncIterator, Literal
from pydantic import BaseModel

class LLMMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str

class LLMRequest(BaseModel):
    messages: list[LLMMessage]
    temperature: float = 0.2
    max_tokens: int = 800
    response_format: Literal["text", "json"] = "text"
    json_schema: dict | None = None

class LLMResponse(BaseModel):
    text: str
    provider: str                                # 'ollama:llama3.1:8b'
    input_tokens: int | None
    output_tokens: int | None
    finish_reason: str

class LLMProvider(Protocol):
    name: str                                    # 'ollama' | 'anthropic' | 'openai'
    model: str

    async def complete(self, req: LLMRequest) -> LLMResponse: ...
    async def stream(self, req: LLMRequest) -> AsyncIterator[str]: ...
    async def health(self) -> bool: ...
```

The router (`llm/router.py`) holds an instance of each configured provider, exposes `get_active() -> LLMProvider`, and a circuit breaker: if `health()` fails 3 times in 5 min, the router marks the provider degraded and either fails loud (default) or falls back to a configured fallback chain (`ollama -> anthropic -> openai` if user enabled it). Fallback **must** be opt-in per setting `llm.fallback_chain` because falling back to a remote provider silently violates C1.

Prompt templates live in `llm/prompts.py` as plain strings with `.format()` slots. Russian summary prompt example slot:

```
SYSTEM: You are an email triage assistant for {user_name}.
USER: Below is an email. Write a Russian-language 2-line summary written
directly to {user_name} (use "ты"). Then propose one short action in
Russian (imperative). Reply ONLY in JSON with keys summary_ru and suggested_action.
EMAIL:
{email_text_truncated_8k_chars}
```

JSON mode: Ollama supports `format: "json"` since 0.1.30. Anthropic uses tool-use to force JSON. OpenAI uses `response_format={"type":"json_object"}`. The `LLMProvider.complete` impl handles each in its own adapter.

Pinned versions: `httpx>=0.27`, `anthropic>=0.34`, `openai>=1.40`, `pydantic>=2.7`.

---

## F. Email abstraction

```python
# src/mailpalace/mail/base.py
from typing import Protocol, AsyncIterator
from datetime import datetime
from pydantic import BaseModel

class NormalizedEmail(BaseModel):
    provider_msg_id: str
    provider_thread_id: str
    rfc822_message_id: str | None
    from_name: str | None
    from_email: str
    to: list[dict]
    cc: list[dict]
    subject: str | None
    snippet: str
    body_text: str
    body_html: str | None
    received_at: datetime
    raw_size_bytes: int
    is_unread: bool
    is_starred: bool
    has_attachments: bool

class MailSource(Protocol):
    account_id: int

    async def connect(self) -> None: ...
    async def fetch_since(self, sync_state: str | None) -> AsyncIterator[NormalizedEmail]: ...
    async def new_sync_state(self) -> str: ...
    async def close(self) -> None: ...
```

- `GmailSource` uses `users.history.list` with `startHistoryId = sync_state` (incremental) and falls back to `users.messages.list` with `q="newer_than:30d"` on first run / when history expires (Gmail expires history > 7 days for inactive accounts). Library: `google-api-python-client>=2.130`, `google-auth-oauthlib>=1.2`.
- `ImapSource` uses `IDLE` if the server supports it for opportunistic prompt updates, but the canonical loop is `UID SEARCH UID > {last_uid}` per `UIDVALIDITY` checkpoint. Stores `sync_state` as `"{UIDVALIDITY}:{last_uid}"` and resyncs from 0 if `UIDVALIDITY` changed. Library: stdlib `imaplib` + `email`. No third-party IMAP client in v0.
- Both implementations parse via `mail/parse.py` so the rest of the system only sees `NormalizedEmail`.

Tutanota: not natively supported (no IMAP). User runs `tuta-bridge` (community tool) locally on `127.0.0.1:1143` and adds it as a regular IMAP account. Documented, not built-in.

---

## G. Ingest loop

Scheduler: APScheduler 3.x `AsyncIOScheduler` with `MemoryJobStore`, started inside the FastAPI lifespan. One job per active account, `IntervalTrigger(minutes=15)`, `coalesce=True`, `max_instances=1` per account.

Per-cycle algorithm (per account):
```
1. Insert ingest_runs row with status='running'.
2. Resolve MailSource for account_id. Connect with timeout=30s.
3. Fetch new messages since last_sync_state. For each:
     a. UPSERT thread by (account_id, provider_thread_id).
     b. INSERT email by (account_id, provider_msg_id) ON CONFLICT DO NOTHING.
        -> dedup is a hard guarantee from the unique index.
     c. If inserted, INSERT placeholder ai_metadata row with error_message='pending'.
     d. Emit SSE 'inbox.new' event with email id.
4. Update accounts.last_sync_state to source.new_sync_state().
5. Mark ingest_run finished_at, status, counts.
6. Trigger triage worker (in-process asyncio task, separate from poll job)
   to process all rows where ai_metadata.error_message IN ('pending', NULL)
   ORDER BY received_at DESC LIMIT 20 per cycle.
```

Triage worker per email:
- Read `body_text` (truncate to 8000 chars; head + last 1500 chars if longer; this matches Ollama's typical 8k context for small models).
- Detect language with `py3langid` (offline, no network).
- Call LLM via router with classify+summarize JSON schema in one call.
- Parse JSON; on parse error, retry once with stricter prompt; on second failure store `error_message` and `retry_count++`.
- Update `ai_metadata` row in single transaction; emit SSE `triage.done.{id}`.

Partial-failure recovery:
- DB inserts and triage are decoupled. If triage crashes mid-batch, emails are already persisted. Next scheduler tick picks up `error_message='pending'` rows.
- If Gmail API rate-limits (429), `GmailSource` raises `RateLimited(retry_after_s)`; the cycle stops cleanly, marks `ingest_runs.status='partial'`, schedules one-off retry at `now + retry_after_s + jitter`.
- If `last_sync_state` is rejected (Gmail historyId too old), `GmailSource` falls back to bounded backfill: last 30 days only, never full mailbox. Backfill flag in `ingest_runs.error_summary`.

Concurrency: SQLite WAL mode + a single writer `asyncio.Lock` per process. Reads from web routes are unblocked. Writes serialized. Fine for a single-user laptop.

---

## H. Auth flows

### Gmail OAuth (installed application)
- Library: `google-auth-oauthlib` 1.x.
- Flow: `InstalledAppFlow.from_client_config(client_config, SCOPES)` then `run_local_server(port=0)` which spawns a one-off localhost listener that catches the redirect.
- Scopes (read-only v0): `https://www.googleapis.com/auth/gmail.readonly`. `gmail.modify` is added in v0.1 when send-from-app ships.
- The OAuth `client_id` / `client_secret` are baked into the app from a Google Cloud "Desktop app" credential. We ship them in `auth/gmail_oauth.py` as constants — for installed-app flow this is documented Google practice, the client secret is **not** confidential by definition.
- Refresh token storage:
  1. Try OS keyring via `keyring` library (Windows Credential Manager / macOS Keychain / Secret Service). Service name `mailpalace`, account `gmail:{email}`.
  2. If keyring unavailable (some Linux desktops), fall back to a `cryptography.fernet`-encrypted blob in `accounts.config_json`. Master key derived from a passphrase the user enters at first run, cached in memory only. The user must re-enter on each app start. Documented trade-off.
- Refresh: `google.auth.transport.requests.Request` driven; on `RefreshError`, mark account `is_active=0`, surface a banner in the dashboard, do not loop.

### IMAP password storage
- Same two-tier strategy: keyring first, encrypted blob fallback.
- Connection always over `imaplib.IMAP4_SSL` (port 993). We refuse plaintext IMAP — settings UI does not expose it. Documented.

### Dashboard auth
- v0: bound to `127.0.0.1` only. No login. Local OS user is the trust boundary.
- A random per-install token is required for `/api/*` calls (sent as `X-MailPalace-Token` header), generated at first run, stored in `~/.mailpalace/token`. The dashboard reads it from the same file. This stops curious processes on the same machine from blindly poking the API. Not a substitute for proper auth — that comes in v1 with multi-user.

---

## I. Frontend architecture

**Pick: FastAPI + Jinja2 templates + HTMX + Alpine.js + Tailwind (precompiled).**

Why, given C8 (owner has Node) but C7+C15 (Python-strong, Python 3.11):

| Option | Pros | Cons |
|---|---|---|
| **Next.js** | Modern UX standard, large component ecosystem, easy real-time UIs | Drags Node into the stack, doubles dev surface (Python backend + TS frontend), `npm install` adds 200MB on a "no-Docker, native Python" project, owner cited Python preference |
| **Vite + React (SPA, served by FastAPI as static)** | Decouples backend; can ship as static bundle | Same Node burden during development; need to maintain two type systems for API |
| **FastAPI + HTMX + Jinja2** | Single language, single process, single deploy. Real-time updates via SSE + HTMX swaps. Modern look fully achievable with Tailwind. Owner ships templates daily already (Fiverr profile, MCP). | No virtual DOM; very heavy interactive surfaces (Kanban, drag/drop) get awkward. We don't have those. |
| **Streamlit / Gradio** | Zero ceremony | Looks like a demo, not a product. UX ceiling is low. |

HTMX wins because the dashboard is fundamentally a list + detail + form app — exactly HTMX's sweet spot. Specific stack:
- FastAPI 0.110+, Jinja2 3.1.
- HTMX 1.9+ for partial swaps and SSE extension (`hx-ext="sse"`).
- Alpine.js 3.x for local UI state (modals, dropdowns, draft editor).
- Tailwind 3.x — built **once at install time** via the standalone `tailwindcss` CLI binary (a single ~30 MB executable, no Node). Output to `web/static/app.css`. Documented in install README.
- Optional: lucide icons via static SVG sprite.

Layout: `base.html` (sidebar + top bar + main slot), `inbox.html` (table-style list with HTMX infinite scroll), `thread.html` (full thread + AI metadata sidebar + draft pane), `settings.html` (provider switcher + accounts CRUD + API key form).

This keeps the project pure Python at runtime. The owner can ship a v0 without ever opening a `package.json`.

---

## J. Failure modes

| # | Failure | Detection | Handling |
|---|---|---|---|
| F1 | **Ollama not running** (default provider) | `LLMProvider.health()` returns False; `httpx.ConnectError` on first request | Mark provider degraded. Triage worker pauses (does not flip to a remote provider unless `llm.fallback_chain` is set). Dashboard shows banner "Ollama не отвечает — триаж приостановлен". Email ingest continues. Auto-resume health check every 60 s. |
| F2 | **Ollama OOM / model not pulled** | HTTP 500 or 404 from Ollama with body containing `model not found` | Surface specific error in banner with command hint `ollama pull llama3.1:8b`. Do not retry until user acts. |
| F3 | **Gmail API rate limit (429 / userRateLimitExceeded)** | `googleapiclient.errors.HttpError.resp.status == 429` | Read `Retry-After`, default to exponential backoff: 30 s, 60 s, 120 s, max 600 s with full jitter. After 3 consecutive 429s mark the run partial, wait until next scheduled tick. Per-user 250 quota units/sec — we stay well under by batching `messages.get` with `format=metadata` first, then `format=raw` only on insert. |
| F4 | **Gmail historyId expired (404 from history.list)** | API returns 404 with reason `notFound` | Fall back to bounded `messages.list` query `newer_than:30d`. Log to `ingest_runs.error_summary`. Persist new historyId from the next call. |
| F5 | **OAuth refresh token revoked / expired** | `google.auth.exceptions.RefreshError` | Set `accounts.is_active=0`, store error in `accounts.last_error`, emit SSE `account.disconnected`. Dashboard shows reconnect button that restarts the OAuth flow. Never silently retry. |
| F6 | **IMAP server unreachable / TLS fail** | `socket.gaierror`, `ssl.SSLError`, `imaplib.IMAP4.abort` | Retry 3 times with backoff 5 s, 30 s, 120 s within the same tick. Then mark `ingest_runs.status='failed'`, surface error, leave account active for next tick. |
| F7 | **IMAP UIDVALIDITY changed** | UIDVALIDITY differs from stored | Treat last_sync_state as invalid. Resync `INBOX` from the most recent 500 messages only (not full backfill — laptop bandwidth + LLM cost). Emit warning. |
| F8 | **SQLite database locked** | `sqlite3.OperationalError: database is locked` | Retry with exponential backoff up to 5 s within the writer lock. If still locked, fail the single email and continue; the placeholder `ai_metadata` row guarantees retry next tick. |
| F9 | **Disk full** | `OSError: [Errno 28]` on db write | Stop scheduler, surface red banner, refuse to ingest more. Provide `db.size_mb` and pruning hint in dashboard (delete spam/promotion older than 30 days). No silent data loss. |
| F10 | **Anthropic / OpenAI 401 (invalid key) or 429 (rate limit)** | SDK raises `AuthenticationError` / `RateLimitError` | 401 -> mark provider misconfigured, surface in settings. 429 -> backoff and respect `Retry-After`. Never auto-fall-back to the other paid provider — user explicitly chose this one. |
| F11 | **Malformed email body / encoding errors** | `UnicodeDecodeError`, `email.errors.MessageError` | Wrap parse in try/except, store raw bytes size + a marker `body_text='[unparseable]'`, still triage on subject + headers. Log to `ingest_runs.error_summary`. |
| F12 | **LLM returns non-JSON when JSON expected** | `json.JSONDecodeError` after model output | Retry once with stricter prompt that includes the previous bad output. Second failure: store `error_message`, increment `retry_count`. If `retry_count >= 3`, stop retrying that email; user can force re-triage from UI. |

---

## K. Trade-off table

| Decision | Alternative considered | Chosen | Reason | Cost we accept |
|---|---|---|---|---|
| **HTMX over Next.js** | Next.js + tRPC/SWR | HTMX | Single-language stack, no Node toolchain, owner is Python-first, dashboard is list+detail UI | We forfeit fancy client-side state (drag-drop boards, complex inline editors). Acceptable because v0 has none. |
| **SQLite, no Postgres, no Redis** | Postgres + Redis queue | SQLite + APScheduler in-process | C3 hard constraint; single-user; total emails per user <100k; no horizontal scale needed | No multi-user, no remote workers. v1 migration documented (section L). |
| **In-process scheduler + asyncio worker** | Celery / Dramatiq + broker | APScheduler + asyncio task | Avoids Redis/RabbitMQ. Single-process simplicity. | If LLM call hangs an event loop, we lose throughput. Mitigation: each LLM call has a 60 s timeout; one slow email cannot starve others (we use `anyio.create_task_group` with concurrency=2). |
| **Ollama default, opt-in remote LLM** | Always-pick-best-model | Ollama default; remote = explicit user toggle | C1: email content NEVER leaves machine by default | Ollama on Llama 3.1 8B is genuinely worse than Claude/GPT-4 at multilingual nuance. We accept lower triage quality for the privacy promise; Anthropic is one toggle away. |
| **Read-only OAuth scope in v0** | `gmail.modify` from day one | Read-only | Smaller blast radius; faster Google verification path; fewer "agent sent emails I didn't mean to" failure modes | No archive/label/send actions in v0 dashboard. Drafts are display-only. v0.1 adds modify scope behind a setting. |
| **Russian summary, English UI** | Auto-locale UI | Hard-coded EN UI + RU summaries | C5; matches CLAUDE.md "industry-standard EN code, RU prose" rule | International users would need locale support. Personal tool for one user. v1 adds i18n. |
| **One package, src layout** | Monorepo (api/, web/, worker/) | Single `mailpalace` package | Smaller code volume; no cross-package import gymnastics; deployment = one process | If we later split workers, refactor is cheap because module boundaries already mirror the eventual split. |

---

## L. Migration paths

### L1. SQLite -> Postgres
Trigger: >100k emails, or noticeable WAL contention (writes >5 s p95), or multi-user.
Plan:
1. SQLAlchemy ORM is dialect-agnostic; we already write portable types (no `INTEGER PRIMARY KEY AUTOINCREMENT` quirks in app code, only in raw migration).
2. Use Alembic migrations from day one (so the v0 schema is migration `0001_initial.py`, not raw SQL). Postgres migration becomes a later revision that swaps `INTEGER PRIMARY KEY AUTOINCREMENT` -> `BIGSERIAL` and adjusts `TEXT CHECK` constraints (Postgres has stricter check enforcement; we re-add as constraints).
3. Use `pgloader` (one-shot) to migrate data.
4. Replace WAL-lock with row-level Postgres locks on `accounts` during ingest.

### L2. Single-user -> multi-tenant
Trigger: anyone other than Dmytro uses this; SaaS pivot.
Plan:
1. Add `users` table; add `user_id` FK to `accounts`. All queries gain a `WHERE user_id = ?`.
2. Replace localhost-only binding with proper auth: WorkOS / Supabase Auth on the FastAPI side, sessions in cookies.
3. Move OAuth client credentials out of constants into per-deploy env (Google requires app re-verification for "external" use).
4. Encrypt secrets per-user with a key derived from the user's session secret, not a shared install-wide passphrase.
5. Move LLM provider config to per-user (some users bring their own key).
6. Workers: now the in-process scheduler must split into a separate process pool — APScheduler with `SQLAlchemyJobStore` on Postgres, multiple worker processes.

### L3. Local Ollama -> cloud-only LLM
Trigger: user wants no local model overhead, runs on a low-spec laptop.
Plan: already supported in v0. User flips active provider to anthropic/openai; `llm/router.py` handles it transparently. No code change.

### L4. Read-only -> full agent
Trigger: send-on-behalf, auto-archive, auto-reply.
Plan:
1. Re-OAuth users to `gmail.modify` (separate consent screen).
2. Add `actions` table: `{id, email_id, action_type, status, payload, executed_at}`.
3. Add a confirmation queue UI: "the agent wants to archive these 18 newsletters — approve?".
4. Per-action audit logs.

---

## M. Build order (for builder agents)

Each step is a self-contained PR that should pass CI before the next step starts.

1. **Project scaffold** — `pyproject.toml`, `src/mailpalace/` skeleton matching section B, ruff + pytest + mypy, `python -m mailpalace --help` prints usage. Pin Python 3.11.
2. **Config + logging** — `config.py` (Pydantic BaseSettings reads `MAILPALACE_*` env), `logging.py`. App data dir = `~/.mailpalace/`. Token file generation.
3. **DB layer** — SQLAlchemy 2.x engine, Alembic init, migration `0001_initial` matching section C exactly. WAL mode pragma at engine bootstrap. `repo.py` skeleton with the 12 most-used queries.
4. **LLM abstraction + Ollama provider** — `llm/base.py` Protocols, `llm/ollama.py` impl (httpx, JSON mode), unit tests with a mock Ollama server (respx). `llm/router.py` with `get_active()`. No Anthropic/OpenAI yet.
5. **Mail abstraction + IMAP source** — `mail/base.py`, `mail/imap.py` using stdlib `imaplib` + `email`. Integration test against a recorded IMAP fixture (no Docker — load a captured BYTES dump and replay). UIDVALIDITY tracking.
6. **Gmail source** — `mail/gmail.py` via `google-api-python-client`. OAuth flow in `auth/gmail_oauth.py`. Refresh token to OS keyring. History API + bounded backfill fallback.
7. **Ingest pipeline** — `pipeline/ingest.py`, dedup via unique index, `ingest_runs` audit, SSE event emit. Tests: insert N fake emails, assert one row per `provider_msg_id` even after re-ingest.
8. **Triage pipeline** — `pipeline/triage.py`, language detect with `py3langid`, prompt templates from `llm/prompts.py`, JSON schema validation. Idempotent: re-running triage on an already-triaged email creates one new ai_metadata row only via UPSERT.
9. **Scheduler** — APScheduler in FastAPI lifespan, 15-min interval per active account, asyncio triage worker reading the "pending" queue. Graceful shutdown drains in-flight jobs.
10. **Web app skeleton** — FastAPI app factory, base.html template, Tailwind CLI build script, HTMX + Alpine on the page, X-MailPalace-Token middleware. `/api/inbox` GET returns the list shape from section D.
11. **Inbox view + thread view** — Jinja templates, HTMX infinite scroll, filters (account, classification, language), full-thread render with AI sidebar.
12. **Draft generation** — `pipeline/draft.py`, `/api/draft` POST endpoint, SSE token streaming via `/api/events?topic=draft.{id}`. UI: "Generate draft" button, regeneration with steering instructions.
13. **Settings UI + provider switching** — accounts CRUD, provider switch, API key form (PATCH never echoes keys back). Reconnect Gmail / re-enter IMAP password flows.
14. **Anthropic + OpenAI providers** — `llm/anthropic.py` (`anthropic` SDK), `llm/openai.py` (`openai` SDK), gated behind config. `llm/router.py` circuit breaker + opt-in fallback chain.
15. **Failure-mode hardening + dogfood release** — implement F1-F12 explicitly, write `README.md` install guide (Ollama install, `ollama pull llama3.1:8b`, `pipx install mailpalace`, `mailpalace serve`). Owner connects his Gmail. First production poll cycle end-to-end.

Optional v0.1 follow-ups (out of scope here): FTS5 search, `gmail.modify` write actions, attachment extraction, embeddings + semantic search, multi-user.

---

## N. Open questions for the lead

1. **Russian summary tone** — `ты` vs `вы`? Spec assumes `ты` (matches MEMORY.md feedback style). Confirm.
2. **Llama 3.1 8B vs Qwen 2.5 7B** — Qwen is meaningfully better at Russian and Ukrainian out of the box. Switch default? (No code impact; just the recommended `ollama pull` command in README.)
3. **OAuth verification** — installed-app + read-only scope is the easy path. If we ever publish, Google will require a security review for `gmail.readonly` (sensitive scope, not restricted — review is lighter). For personal use under 100 users, "Testing" mode is fine forever. Ship as Testing for v0?
4. **Encryption passphrase fallback (H2)** — acceptable to ask the user to retype on every app start when keyring is unavailable, or do we want a `--unsafe-store-key-on-disk` opt-out?
5. **SSE keepalive on Windows** — uvicorn + httpx tunneling through localhost is fine, but some Windows AV scanners kill long-lived connections. Acceptable to fall back to short polling (every 5 s) if SSE drops? Spec assumes yes.
6. **License** — MIT (matches Mail-0/Zero) or AGPL (matches Inbox Zero hosted-tier protection)? Affects whether this can become a Fiverr Gig 7 / hosted offering later.

---

**End of v0 architecture spec.** Builder agents: implement in the order of section M. Any deviation from sections B, C, D, E, F requires updating this document first and re-approval.
