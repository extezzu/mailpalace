# MailPalace

**Local-first email triage with AI.** Reads your inbox, classifies every message, writes a summary in your language, drafts replies. Runs on your laptop. Email bytes never leave the box unless you explicitly switch to a remote LLM.

```
┌──────────┬────────────────────────┬───────────────┐
│ Sidebar  │ Inbox / Sent (chat)    │ Thread + AI   │
│ Inbox    │ ◾ Sender · 5m          │ Subject       │
│ Sent     │   Subject              │ ─────────────│
│ Spam     │   Snippet…             │ <body>        │
│ Trash    │ ◾ Sender · 23h         │               │
│          │   Subject              │ Draft with AI │
│ Urgent   │   Snippet…             │ Send / Snooze │
│ Newsletter                                        │
└──────────┴────────────────────────┴───────────────┘
```

## What it does

- **Connects to Gmail (OAuth) or any IMAP host.** Multi-account out of the box.
- **Triages every email** into `urgent`, `important`, `newsletter`, `promotion`, `transactional`, `spam`, or `other`. Trusts Gmail's own labels for 80% of inbox so the local LLM is only invoked on Primary-tab messages.
- **Summarises in your language.** Pick from English, Russian, Ukrainian, Polish, German, French, Spanish, and 16 others in Settings.
- **Drafts replies in the source language.** Free-form `instructions` field steers tone.
- **Sends real email back** through Gmail's `users.messages.send`. Reply lands on the same thread, with proper `In-Reply-To` headers.
- **Two-way sync.** Archive / read / delete in MailPalace propagates to Gmail; the inverse propagates back via `users.history.list`.
- **Telegram-style Sent view.** Every conversation is a chat with bubbles, not a flat list.
- **No cloud.** SQLite WAL on disk. Refresh tokens in the OS keyring (Windows Credential Manager, macOS Keychain, libsecret).

## Quick start

> **TL;DR:** Two terminals, two `pip install` / `npm install`, one Google Cloud Desktop OAuth client, then go.

Full guide with every click: [`SETUP.md`](SETUP.md).

```bash
# 1. Clone
git clone https://github.com/extezzu/mailpalace
cd mailpalace

# 2. Backend
cd backend
pip install -e ".[dev]"
mailpalace serve            # listens on 127.0.0.1:7330

# 3. Frontend (new terminal)
cd frontend
npm install
npm run build && npm start  # serves on :3000

# 4. Open http://localhost:3000
#    First load shows the connect wizard — Continue with Google.
```

You also need:

- **Ollama** running locally for triage. `ollama pull llama3.2:1b` then start the daemon. Skip if you plan to use Anthropic or OpenAI keys (configurable in Settings).
- **A Google Cloud OAuth Desktop client** saved to `~/.mailpalace/google_credentials.json`. Walkthrough in [`SETUP.md`](SETUP.md).

## Architecture

```
┌─ frontend (Next.js 15 + Tailwind) ──┐    ┌─ backend (FastAPI) ─────────┐
│  app/page.tsx          inbox        │    │  /api/inbox                 │
│  components/email/...               │◄──►│  /api/email/{id}/{send,…}   │
│  components/settings/...            │    │  /api/threads               │
└─────────────────────────────────────┘    │  /api/accounts              │
                                           │  /api/settings              │
                                           └────────┬────────────────────┘
                                                    │
                ┌─────────────┐  ┌─────────────┐    │     ┌─────────────────┐
                │ Gmail API   │  │ IMAP server │    │     │ LLM router      │
                │ (gmail.modify)│ (RFC 3501)  │◄───┤     │ Ollama / Claude │
                └─────────────┘  └─────────────┘    │     │  / OpenAI       │
                                                    │     └─────────────────┘
                                                    ▼
                                          ┌─────────────────┐
                                          │ SQLite (WAL)    │
                                          │ ~/.mailpalace/  │
                                          │   mail.db       │
                                          └─────────────────┘
```

Every external call (Gmail HTTP, IMAP socket, Ollama HTTP) is wrapped in `asyncio.to_thread` so the FastAPI event loop never stalls on a synchronous SDK. Gmail's `messages.list` calls go through a `with_gmail_retry` wrapper for 429/5xx tolerance.

## Project layout

```
mailpalace/
├── backend/
│   ├── pyproject.toml
│   └── src/mailpalace/
│       ├── auth/        OAuth + keyring secrets
│       ├── db/          SQLAlchemy schema, repo
│       ├── llm/         Ollama / Anthropic / OpenAI providers + router
│       ├── mail/        Gmail and IMAP sources, RFC822 parsing
│       ├── pipeline/    ingest, triage, draft generation
│       └── web/         FastAPI app + routes
├── frontend/
│   ├── package.json
│   ├── app/             Next.js App Router (page.tsx, settings/, layout.tsx)
│   └── components/
│       ├── email/       list item, thread viewer, sent chat, snooze menu, …
│       └── settings/    accounts section, LLM provider section
├── docs/                ARCHITECTURE.md, DESIGN.md, MANUAL_TEST_PLAN.md
├── SETUP.md             step-by-step setup guide for humans + AI
└── scripts/
```

## Roadmap

- [x] Real Gmail OAuth + `gmail.modify`
- [x] Real IMAP fetch with UIDVALIDITY-aware incremental sync
- [x] Bidirectional sync (Gmail labels ↔ local state)
- [x] Real send / reply / archive / snooze / trash
- [x] Multi-account
- [x] Telegram-style Sent chat view
- [x] Live LLM provider switch with API-key input + keyring storage
- [ ] SMTP send for IMAP accounts (Gmail-only today)
- [ ] APScheduler for snoozed-message wake-up
- [ ] PWA manifest so the dashboard installs as a native-feeling app
- [ ] Push notifications via Gmail Pub/Sub watch
- [ ] FTS5 full-text search

## License

MIT. See [`LICENSE`](LICENSE).
