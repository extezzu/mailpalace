# MailPalace — Setup Guide

> **Built for ADHD brains and AI assistants.** Every step is a checkbox. Every click has a screenshot or a copy-pasteable command. If something looks confusing, jump to **[Troubleshooting](#troubleshooting)** at the end.

---

## How to read this guide

```
👉  Do this now           ⚠️   Stop and check                ✅  Done — move on
🔧  Optional power user    🤖  Section for AI assistants
```

You will end up with:

- ✅ Backend running on **`127.0.0.1:7330`**
- ✅ Frontend running on **`http://localhost:3000`**
- ✅ At least one Gmail or IMAP mailbox connected
- ✅ A local LLM (Ollama) classifying your inbox

Estimated time: **15–25 minutes** for a fresh machine, **5 minutes** if you already have Python, Node, and Ollama.

---

## Stage 0 — One-time prerequisites

You only do this once per machine. Skip lines you already have.

### 0.1  Python 3.11 or newer

```powershell
# Windows
winget install --id Python.Python.3.12 -e --source winget --accept-source-agreements --accept-package-agreements
```

```bash
# macOS
brew install python@3.12
```

```bash
# Linux (Debian/Ubuntu)
sudo apt-get install python3.12 python3.12-venv python3-pip
```

```powershell
python --version    # ⚠️  must print 3.11.x or higher
```

### 0.2  Node.js 20 or newer

```powershell
# Windows
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
```

```bash
# macOS
brew install node
```

```bash
# Linux (Debian/Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
```

```powershell
node --version      # ⚠️  must print v20.x.x or higher
```

### 0.3  Ollama (the local LLM brain)

```powershell
# Windows
winget install --id Ollama.Ollama -e --accept-source-agreements --accept-package-agreements
```

```bash
# macOS
brew install ollama
```

```bash
# Linux
curl -fsSL https://ollama.com/install.sh | sh
```

After install, pull the small fast model **MailPalace defaults to**:

```powershell
ollama pull llama3.2:1b
```

```
✅  Ollama daemon is now running on 127.0.0.1:11434
```

> 🔧 **Power user**: replace `llama3.2:1b` with `llama3.2:3b` (better quality, slower) or `llama3.1:8b` (best, needs a beefier GPU). Configure in Settings → Active LLM provider.

---

## Stage 1 — Get the code

```powershell
git clone https://github.com/extezzu/mailpalace
cd mailpalace
```

You should now see a `mailpalace/` folder containing `backend/`, `frontend/`, `docs/`.

---

## Stage 2 — Set up the backend

```powershell
cd backend
pip install -e ".[dev]"
```

If `pip` complains about permissions, prepend `python -m`:

```powershell
python -m pip install -e ".[dev]"
```

```
✅  You should see "Successfully installed mailpalace-0.1.0 …"
```

Try the CLI:

```powershell
mailpalace --help
```

> ⚠️  **Windows tip**: if `mailpalace` is not found, use `python -m mailpalace --help` instead. Same for every `mailpalace` command later in this guide.

---

## Stage 3 — Get a Google Cloud OAuth credential

This is the only fiddly part. **It is required** for Gmail accounts. Skip if you plan to use only IMAP accounts.

The Google Cloud Console UI was reorganised in late 2025 — older guides on the internet point at screens that no longer exist. Use the URLs below; they are current as of May 2026.

### 3.1  Create a Google Cloud project

👉  Open **https://console.cloud.google.com/projectcreate**

Fields:

- **Project name** — anything (e.g. `mailpalace-local`)
- **Organization** — leave as "No organization"

Click **Create**. Wait ~10 seconds for the project to provision. Switch into it from the project picker at the top of the console.

### 3.2  Enable the Gmail API

👉  Open **https://console.cloud.google.com/flows/enableapi?apiid=gmail.googleapis.com**

Click **Enable**. The page redirects to the Gmail API dashboard.

### 3.3  Configure OAuth Branding

👉  Open **https://console.developers.google.com/auth/branding**

If you see "Get Started", click it. Fill the required fields:

- **App name** — `MailPalace`
- **User support email** — your email
- **Developer contact information** (bottom of the page) — your email

Click **Save**.

### 3.4  Configure Audience (User type + Test users)

👉  Open **https://console.developers.google.com/auth/audience**

- **User type** → **External**
- Leave **Publishing status** as **Testing**.
- Scroll to **Test users** → **+ Add users** → enter your Gmail address (and any other Gmail addresses you want to connect). Save.

> ⚠️  **Important**: only emails listed under "Test users" can sign into MailPalace. Up to 100 test users.

### 3.5  Configure Data Access (Scopes)

👉  Open **https://console.developers.google.com/auth/scopes**

Click **Add or remove scopes**. In the search box type `gmail.modify` and select:

```
https://www.googleapis.com/auth/gmail.modify
```

Click **Update** then **Save and continue**.

### 3.6  Create the OAuth Client

👉  Open **https://console.developers.google.com/auth/clients**

Click **Create Client**:

- **Application type** → **Desktop app**
- **Name** → `MailPalace Local`

Click **Create**. The console shows a dialog with a download icon — **download the JSON**.

### 3.7  Drop the JSON in the right folder

The downloaded file is named like `client_secret_XXXX.json`. Move and rename it:

```powershell
# Windows
mkdir $HOME\.mailpalace -Force
Move-Item -Path "$HOME\Downloads\client_secret_*.json" -Destination "$HOME\.mailpalace\google_credentials.json"
```

```bash
# macOS / Linux
mkdir -p ~/.mailpalace
mv ~/Downloads/client_secret_*.json ~/.mailpalace/google_credentials.json
```

```
✅  Credentials are now where MailPalace looks for them.
```

---

## Stage 4 — Run the backend

In your terminal that is already inside `backend/`:

```powershell
mailpalace serve
```

You should see:

```
INFO  Started server process [pid]
INFO  Uvicorn running on http://127.0.0.1:7330
```

Leave this terminal open. **Don't close it** — that's your backend.

---

## Stage 5 — Run the frontend

Open a **new terminal**, then:

```powershell
cd mailpalace/frontend
npm install
npm run build
npm start
```

After ~30 seconds you should see:

```
✓ Ready on http://localhost:3000
```

---

## Stage 6 — Connect your inbox

👉  Open **http://localhost:3000** in your browser.

You see the connect wizard:

```
┌──────────────────────────────────────┐
│  ✉  Connect your inbox              │
│                                      │
│  [ Gmail ]   [ IMAP ]                │
│                                      │
│  ┌─ Continue with Google ─┐          │
│  └────────────────────────┘          │
│                                      │
│  Email content stays on this machine.│
└──────────────────────────────────────┘
```

### Gmail path

1. Click **Continue with Google**.
2. Your default browser opens Google's consent screen.
3. Pick the Gmail address you added as a Test User in Stage 3.4.
4. Google will warn you "This app isn't verified" — that is normal because the app is in **Testing**. Click **Continue**.
5. Approve the requested scopes.
6. The browser tab closes itself; the wizard hops straight to the dashboard.

### IMAP path (Outlook, Fastmail, iCloud, mailbox.org, Proton)

1. Click **IMAP**.
2. Pick a preset from the dropdown (auto-fills host + port).
3. Fill in your email address and your **app-specific password** (most providers require app passwords now — your account password will not work).
4. Click **Connect**.

> ⚠️  **Gmail through IMAP is intentionally NOT in the preset list.** Use the OAuth path above — it is strictly better than IMAP+app-password (no token rotation, real label semantics, native send).

> 🔧  **Proton Mail**: requires the official **Proton Bridge** desktop app to be running locally. The form auto-detects whether Bridge is up.

---

## Stage 7 — Wait for the first ingest

After you connect, MailPalace fetches every message in the background. Default cap on the first run is **500 most recent messages per folder** (Inbox, Sent, Spam, Trash, Drafts). You'll see them stream into the inbox over the next few seconds.

The triage indicator at the top of the dashboard shows progress:

```
ollama:llama3.2:1b · 248/657 triaged
```

When that hits 100% you're fully synced. Then:

- ✅ Click any message — read pane opens on the right.
- ✅ Click **Draft with AI** — local LLM writes a reply in the email's source language.
- ✅ Click **Send** — real send through Gmail.
- ✅ The Sidebar **Sync now** button forces a refresh; otherwise auto-poll every 60 seconds.

🎉 **You're done.**

---

## Stage 8 (optional) — Use Anthropic or OpenAI instead of Ollama

If you have a paid API key and want better triage quality, in the dashboard:

1. Click **Settings** (sidebar bottom).
2. Under **Active LLM provider**, click **Anthropic Claude** or **OpenAI**.
3. Paste your API key. Get one at:
   - Anthropic — **https://console.anthropic.com/settings/keys**
   - OpenAI — **https://platform.openai.com/api-keys**
4. Click **Save & activate**.

The key is stored in your OS keyring, never on disk in plain text, never returned by the API.

> ⚠️  Switching to a remote provider crosses the local-first boundary. The email body will be sent to the chosen vendor for classification and summarisation.

---

## Troubleshooting

### "Google blocked the request — access_denied"

Your Gmail address is not in the Test users list. Go back to **Stage 3.4** and add it.

### "Application-specific password required" (IMAP)

Your provider rejects normal passwords on IMAP. Create an **app password**:

- Gmail (only relevant if you ignored the OAuth recommendation): https://myaccount.google.com/apppasswords (requires 2-Step Verification on)
- Outlook: https://account.microsoft.com/security → "App passwords"
- Fastmail: https://app.fastmail.com/settings/security/devicekeys
- iCloud: https://account.apple.com → "App-Specific Passwords"

### "No LLM provider is reachable"

Either Ollama is not running, or your remote API key is wrong:

```powershell
# Check Ollama
curl http://127.0.0.1:11434/api/tags
```

If empty, restart Ollama. On Windows: launch the tray icon. On macOS/Linux: `ollama serve &`.

### Triage is stuck at "0 / N"

```powershell
# Re-run the triage queue
curl -X POST http://127.0.0.1:7330/api/retriage_all
```

### Settings page redirects to the wizard

Settings is gated — you need at least one connected account. Connect via the wizard first.

### Backend port 7330 already in use

You probably have an older `mailpalace serve` still alive. On Windows:

```powershell
Get-NetTCPConnection -LocalPort 7330 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

```bash
# macOS / Linux
lsof -ti tcp:7330 | xargs kill -9
```

### Frontend port 3000 already in use

```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

```bash
lsof -ti tcp:3000 | xargs kill -9
```

### How do I disconnect an account?

Settings → Accounts → click the trash icon on the row. The OAuth refresh token is removed from the keyring and every email for that account is purged from the local DB.

### Where does my data live?

Everything is in `~/.mailpalace/`:

- `mail.db` — SQLite WAL with all email rows + AI metadata
- `google_credentials.json` — your Google Cloud OAuth client (you put it there)
- OS keyring entries `service=mailpalace`, `service=mailpalace-llm` — refresh tokens and API keys

Delete the folder + the keyring entries to wipe MailPalace completely.

---

## 🤖 Section for AI assistants

If you're an AI agent (Claude Code, Cursor, etc.) helping a human set this up, here is the minimum-viable deterministic path:

```bash
# 1. Verify prerequisites
python --version            # >= 3.11
node --version              # >= 20
curl http://127.0.0.1:11434/api/tags   # Ollama running

# 2. Clone + install
git clone https://github.com/extezzu/mailpalace
cd mailpalace
( cd backend && pip install -e ".[dev]" )
( cd frontend && npm install && npm run build )

# 3. Verify the OAuth credential file is in place
test -f ~/.mailpalace/google_credentials.json    # OR  $HOME\.mailpalace\google_credentials.json on Windows
# If absent, instruct the human to follow Stage 3 in this guide.

# 4. Boot
( cd backend && mailpalace serve & )
( cd frontend && npm start & )

# 5. Health check
curl -sf http://127.0.0.1:7330/api/version       # JSON with process_token
curl -sfI http://localhost:3000                  # 200 OK

# 6. Tell the human to open http://localhost:3000 and click "Continue with Google".
```

**Important constants** (when reading or modifying the code):

- Backend listens on `127.0.0.1:7330` — see `backend/src/mailpalace/config.py`.
- Frontend served on `localhost:3000` — Next.js default.
- Direct backend URL is hardcoded in `frontend/lib/api.ts` (`API_BASE`) — the frontend bypasses Next.js's rewrite proxy on purpose.
- DB: `~/.mailpalace/mail.db` (SQLite WAL).
- LLM router cache: `_router` in `backend/src/mailpalace/llm/router.py`. Invalidated by PATCH `/api/settings`.
- OAuth ingest runs in a **daemon `threading.Thread` with its own `asyncio.run`** — see `accounts.py:_thread_target`. Do not regress to `asyncio.create_task` on the main loop; googleapiclient is synchronous and blocks it.

**When the human asks "is it working":**

- Hit `GET /api/accounts` — non-empty list means at least one mailbox is connected.
- Hit `GET /api/inbox?folder=all&limit=10` — non-empty `emails` array means ingest succeeded.
- Hit `GET /api/accounts/gmail/status` — `phase` should be `done`, `triaged_count` increases over time.

**Common pitfalls you may walk a human through:**

- They forgot to add their Gmail to Test users in Google Cloud Console (3.4).
- They put `google_credentials.json` in the project folder instead of `~/.mailpalace/`.
- They tried IMAP with a normal Gmail password and need an app password — recommend the OAuth path instead.
- Ollama is installed but the daemon isn't running — `ollama serve` (Linux/macOS) or launch the tray icon (Windows).
