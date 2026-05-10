# 📬 MailPalace

> 🔒 **Local-first email triage with AI.** Reads your inbox, classifies every message, writes a summary in your language, drafts replies. Runs on your laptop. Email bytes never leave the box unless you explicitly switch to a remote LLM.

<p align="left">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="MIT" />
  <img src="https://img.shields.io/badge/python-3.11%2B-3776ab?style=flat-square&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/Node-20%2B-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Next.js-16-000?style=flat-square&logo=nextdotjs&logoColor=white" alt="Next.js" />
  <img src="https://img.shields.io/badge/Tailwind-4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/SQLite-WAL-003b57?style=flat-square&logo=sqlite&logoColor=white" alt="SQLite" />
  <img src="https://img.shields.io/badge/Ollama-local-000?style=flat-square&logo=ollama" alt="Ollama" />
</p>

---

```
┌──────────────┬──────────────────────────────┬─────────────────────┐
│ 📥 Inbox     │ ◾ Sender · 5m                │ ✉  Subject          │
│ 📤 Sent      │   Subject                    │ ─────────────────── │
│ 🚫 Spam      │   AI summary preview…  🟧    │  <body>             │
│ 🗑  Trash    │ ◾ Sender · 23h               │                     │
│              │   Subject                    │ ✨ Draft with AI    │
│ ⚡ Urgent    │   AI summary preview…        │ 📦 Archive          │
│ 📰 News      │ ◾ Sender · 2d                │ 🕒 Snooze           │
│ ⚙  Settings  │   Subject                    │ 📨 Send             │
└──────────────┴──────────────────────────────┴─────────────────────┘
```

---

## ✨ What it does

| | |
|---|---|
| 📨 | **Connects to Gmail (OAuth) or any IMAP host.** Multi-account out of the box. |
| 🏷  | **Triages every email** into `urgent`, `important`, `newsletter`, `promotion`, `transactional`, `spam`, or `other`. Trusts Gmail's own labels for ~80% of inbox so the local LLM is only invoked on Primary-tab messages. |
| 🌍 | **Summarises in your language.** English, Russian, Ukrainian, Polish, German, French, Spanish, and 15 others — pick in Settings. |
| ✍  | **Drafts replies in the source language** of the email. Free-form `instructions` field steers tone. |
| 📤 | **Sends real email** through `users.messages.send`. Reply lands on the same thread with proper `In-Reply-To` headers. |
| 🔄 | **Two-way sync.** Archive / read / delete in MailPalace propagates to Gmail; the inverse propagates back via `users.history.list`. |
| 💬 | **Telegram-style Sent view.** Every conversation is a chat with bubbles, not a flat list. |
| 🔐 | **No cloud.** SQLite WAL on disk. Refresh tokens in the OS keyring (Windows Credential Manager, macOS Keychain, libsecret). |
| 🧠 | **LLM provider switch in the UI.** Local Ollama by default; flip to Anthropic Claude or OpenAI without restarting — keys land in the keyring. |

---

## 🚀 Quick start

> 📖 **Full step-by-step walkthrough**: see [**`SETUP.md`**](SETUP.md) — every click, every URL, troubleshooting, plus an [🤖 AI-assistants section](SETUP.md#-section-for-ai-assistants).

### Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| 🐍 Python | `3.11+` | Backend |
| 🟢 Node.js | `20+` | Frontend |
| 🦙 Ollama | latest | Local LLM (skip if using only Claude/OpenAI keys) |
| 🔑 Google Cloud OAuth Desktop client | — | Gmail accounts only — see SETUP.md §3 |

### 1️⃣ Clone

```bash
git clone https://github.com/extezzu/mailpalace
cd mailpalace
```

### 2️⃣ Backend (terminal A)

```bash
cd backend
pip install -e ".[dev]"
mailpalace serve              # 🌐 http://127.0.0.1:7330
```

> 💡 On Windows, if `mailpalace` is not on PATH, use `python -m mailpalace serve`.

### 3️⃣ Frontend (terminal B)

```bash
cd frontend
npm ci                        # uses package-lock.json — reproducible
npm run dev                   # 🌐 http://localhost:3000   (fast hot-reload)
```

> 🚀 For a production build instead: `npm run build && npm start`.

### 4️⃣ Drop your Google credentials in place

```bash
# Once you have client_secret_XXXX.json from Google Cloud Console:
mkdir -p ~/.mailpalace                                    # macOS / Linux
mv ~/Downloads/client_secret_*.json ~/.mailpalace/google_credentials.json
```

```powershell
# Windows
mkdir $HOME\.mailpalace -Force
Move-Item "$HOME\Downloads\client_secret_*.json" "$HOME\.mailpalace\google_credentials.json"
```

### 5️⃣ Open the app

🌐 http://localhost:3000 → click **Continue with Google** → done.

---

## 🏗  Architecture

```
┌─ 🖥  frontend (Next.js 16 + Tailwind 4) ─┐    ┌─ 🐍 backend (FastAPI) ──────┐
│  app/page.tsx           inbox            │    │  /api/inbox                 │
│  components/email/...                    │◄──►│  /api/email/{id}/{send,…}   │
│  components/settings/...                 │    │  /api/threads               │
└──────────────────────────────────────────┘    │  /api/accounts              │
                                                │  /api/settings              │
                                                └────────┬────────────────────┘
                                                         │
                ┌─────────────┐  ┌─────────────┐         │      ┌─────────────────┐
                │ 📨 Gmail API│  │ 📡 IMAP/SSL │         │      │ 🧠 LLM router   │
                │ gmail.modify│  │  RFC 3501   │ ◄───────┤      │  🦙 Ollama      │
                └─────────────┘  └─────────────┘         │      │  🟪 Anthropic   │
                                                         │      │  🟢 OpenAI      │
                                                         │      └─────────────────┘
                                                         ▼
                                              ┌─────────────────┐
                                              │ 💾 SQLite WAL   │
                                              │ ~/.mailpalace/  │
                                              │      mail.db    │
                                              └─────────────────┘
```

Every external call (Gmail HTTP, IMAP socket, Ollama HTTP) is wrapped in `asyncio.to_thread` so the FastAPI event loop never stalls on a synchronous SDK. Gmail `messages.list` calls flow through a `with_gmail_retry` wrapper for 429 / 5xx tolerance.

---

## 📁 Project layout

```
mailpalace/
├── 🐍 backend/
│   ├── pyproject.toml
│   └── src/mailpalace/
│       ├── auth/        🔐 OAuth + keyring secrets
│       ├── db/          📊 SQLAlchemy schema, repo
│       ├── llm/         🧠 Ollama / Anthropic / OpenAI providers + router
│       ├── mail/        📨 Gmail and IMAP sources, RFC822 parsing
│       ├── pipeline/    ⚙  ingest, triage, draft generation
│       └── web/         🌐 FastAPI app + routes
├── 🖥  frontend/
│   ├── package.json
│   ├── app/             📑 Next.js App Router (page.tsx, settings/)
│   └── components/
│       ├── email/       💬 list item, thread viewer, sent chat, snooze menu, …
│       └── settings/    ⚙  accounts section, LLM provider section
├── 📚 docs/             ARCHITECTURE.md, DESIGN.md, MANUAL_TEST_PLAN.md
├── 📖 SETUP.md          step-by-step setup guide
└── 🛠  scripts/
```

---

## ✅ What ships in this release

- ✅ Real Gmail OAuth + `gmail.modify`
- ✅ Real IMAP fetch with UIDVALIDITY-aware incremental sync
- ✅ Bidirectional sync (Gmail labels ↔ local state)
- ✅ Real send / reply / archive / snooze / trash
- ✅ Multi-account
- ✅ Telegram-style Sent chat view
- ✅ Live LLM provider switch with API-key input + keyring storage

---

## 📜 License

MIT — see [`LICENSE`](LICENSE).
