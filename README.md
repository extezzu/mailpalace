# MailPalace

A local-first email triage tool. Reads your inbox, classifies each message, writes a Russian summary, and drafts replies in the language of the incoming email. Runs Ollama on your laptop by default; Anthropic and OpenAI keys are optional fallbacks.

> Status: v0. The dashboard ships with seeded demo data so you can see the design without connecting a mailbox. Gmail OAuth and the IMAP fetch loop land in v0.1.

## Why this exists

The cloud-hosted AI inbox tools (Superhuman, Shortwave, Cora) read your mail on their servers. That is a non-starter for anyone with attorney-client privilege, NDA-bound communication, or HIPAA-shaped data. MailPalace keeps email bytes on disk and runs the LLM call against a local Ollama instance. The default install never sends a single subject line off the box.

## Features

- Classifies every email into one of `urgent`, `important`, `newsletter`, `promotion`, `transactional`, `spam`, `other`.
- Writes a two-line Russian summary addressed to the user (`ты` form, configurable).
- Generates a reply draft in the source language of the email. Free-form instructions steer the tone.
- Provider switch via one env var: Ollama, Anthropic, OpenAI, or any OpenAI-compatible endpoint.
- Mail sources: Gmail native API in v0.1; IMAP via `imaplib` covers Outlook, iCloud, Fastmail, and Tutanota (via the `tuta-bridge` community tool).
- No Docker, no Postgres, no Redis. SQLite WAL only.
- Web dashboard built on Next.js 15 + Tailwind + Geist Sans. Three-panel master / detail / AI sidebar layout.
- 15 unit and integration tests; smoke test exercises the full HTTP surface.

## Quick start

Two terminals.

Backend:

```bash
cd backend
pip install -e ".[dev]"
mailpalace seed
mailpalace serve
```

The API listens on `127.0.0.1:7330`.

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The Next.js dev server proxies `/api/*` to the backend.

End-to-end smoke check (no servers required):

```bash
python scripts/smoke.py
```

## Provider configuration

Default install runs Ollama. You install Ollama separately and pull the model:

```bash
# https://ollama.com
ollama pull llama3.1:8b
```

To use Anthropic or OpenAI instead:

```bash
export MAILPALACE_ACTIVE_PROVIDER=anthropic
export MAILPALACE_ANTHROPIC_API_KEY=sk-ant-...
mailpalace serve
```

| Provider  | Env var                          | Default model       |
| --------- | -------------------------------- | ------------------- |
| Ollama    | `MAILPALACE_OLLAMA_BASE_URL`     | `llama3.1:8b`       |
| Anthropic | `MAILPALACE_ANTHROPIC_API_KEY`   | `claude-haiku-4-5`  |
| OpenAI    | `MAILPALACE_OPENAI_API_KEY`      | `gpt-4o-mini`       |

Fallback chain is opt-in. The router never silently falls back from a local provider to a remote one without explicit configuration:

```bash
export MAILPALACE_FALLBACK_CHAIN='["anthropic"]'
```

## Architecture

Two services. They talk REST and SSE on `127.0.0.1:7330`.

```
+-- frontend/ ------+      +-- backend/ -----------------+
|  Next.js 15       |      |  FastAPI                    |
|  Tailwind         | <==> |  /api/inbox                 |
|  Geist Sans       |      |  /api/email/{id}            |
|  three-panel UI   |      |  /api/draft                 |
+-------------------+      |  /api/settings              |
                           |  /api/events  (SSE)         |
                           +-----+--------+--------------+
                                 |        |
                       +---------v---+ +--+--------------+
                       | SQLite (WAL)| | LLM router      |
                       | mail.db     | | -> Ollama       |
                       +-------------+ | -> Anthropic    |
                                       | -> OpenAI       |
                                       +-----------------+
```

Full architecture spec: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Frontend design tokens and component catalog: [`docs/DESIGN.md`](docs/DESIGN.md).

## Layout

```
mailpalace/
  backend/
    pyproject.toml
    src/mailpalace/
      __main__.py       CLI entry
      config.py         Pydantic Settings
      db/               schema, repo, seed, engine
      llm/              Protocol, Ollama provider, router
      mail/             Gmail and IMAP source adapters
      pipeline/         triage, draft, language detection
      auth/             secrets storage (keyring + Fernet fallback)
      web/              FastAPI app and routes
    tests/              15 tests
  frontend/
    package.json
    app/                Next.js App Router
    components/email/   list item, filter bar, thread view, AI sidebar
    lib/                types, mock data, utils
  scripts/smoke.py
  docs/
    ARCHITECTURE.md
    DESIGN.md
    MANUAL_TEST_PLAN.md
```

## Roadmap

v0 (this release): scaffold complete, dashboard shows seeded data. Ollama provider wired and tested.

v0.1: Gmail OAuth installed-app flow with refresh tokens in the OS keyring; IMAP fetch loop with UIDVALIDITY tracking; APScheduler 15-minute poll cycle and async triage worker; PWA manifest so the dashboard installs as an OS app; live data fetch in the frontend (TanStack Query).

v0.2: `gmail.modify` scope for archive, label, send; FTS5 full-text search; settings page accounts CRUD wired to OAuth.

v1: multi-user mode (Postgres migration path documented in the spec); embeddings and semantic search; optional hosted tier under the same MIT license.

## License

MIT. See [LICENSE](LICENSE).
