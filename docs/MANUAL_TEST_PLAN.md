# MailPalace v0 — Manual Test Plan

Run this list when reviewing the v0 demo. Each item should take 30-60 seconds. If anything breaks or feels off, flag it — we'll fix in v0.1.

## Prerequisites

```bash
# Terminal 1
cd backend
pip install -e ".[dev]"
mailpalace seed
mailpalace serve

# Terminal 2
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** in Chrome / Edge / Brave / Safari.

---

## A. Layout + branding

- [ ] **A1** — Page loads without console errors (DevTools open while clicking around).
- [ ] **A2** — Three-panel layout: left nav (220px) + email list (380px) + thread + AI sidebar (xl viewports only).
- [ ] **A3** — Cream background (`#F7F3EC`), white surface for email rows, clay accent (`#CC785C`) on the active filter and unread left-border.
- [ ] **A4** — Geist Sans renders for body text; Geist Mono for the small classification badges.
- [ ] **A5** — No horizontal scroll at 1280px width or larger. At smaller widths the AI sidebar collapses (acceptable v0 behavior).

## B. Email list

- [ ] **B1** — Exactly 10 emails visible on first load.
- [ ] **B2** — Unread rows have a 2px clay left-border; read rows do not.
- [ ] **B3** — Sender name in unread is bolder than in read (font-weight 600 vs 400). Subject is medium.
- [ ] **B4** — Timestamp shows "22m" / "1h" / "1d" relative format, right-aligned.
- [ ] **B5** — Avatar shows initials with a deterministic pastel background per sender domain.
- [ ] **B6** — Hovering a row reveals three quick-action icons (Archive / Snooze / Mark read) at the right edge.
- [ ] **B7** — Hovering a row also lifts background to `#FDFCFA`.

## C. Classification badges + language flags

- [ ] **C1** — Each row shows a colored uppercase badge: `URGENT` / `IMPORTANT` / `NEWSLETTER` / `PROMO` / `RECEIPT`.
- [ ] **C2** — Color mapping looks distinct: red for urgent, amber for important, blue-gray for newsletter, tan for promo, teal for receipt.
- [ ] **C3** — Non-English emails show a language flag emoji inline with the subject (🇷🇺 🇺🇦 🇩🇰). English emails do **not** show a flag.
- [ ] **C4** — The Russian `Вечерний разработчик` newsletter and the Danish `Skat.dk` and `Klarna` emails all carry their correct flag.

## D. Filter bar

- [ ] **D1** — Filter pills: `All 10` / `Urgent 1` / `Important 4` / `Newsletter 3` / `Promo 1` / `Receipts 1`.
- [ ] **D2** — Clicking `Urgent` shrinks the list to only the NordPay email. Active pill gets a clay underline + bolder weight.
- [ ] **D3** — Clicking `Newsletter` shows exactly 3 emails (Вечерний / HN / Notion).
- [ ] **D4** — Clicking `All` restores 10. State is purely client-side; no flicker, no re-fetch.

## E. Thread view (right panel)

- [ ] **E1** — Clicking a row in the list immediately renders the full thread in the right panel — no spinner, no delay.
- [ ] **E2** — Thread header shows the avatar (40px), sender full name + email + relative time.
- [ ] **E3** — Body renders preserving line breaks (whitespace-pre-wrap).
- [ ] **E4** — Toolbar at top has Archive / Clock / More icon buttons.
- [ ] **E5** — Inline reply composer is pinned at the bottom — `Write a reply...` placeholder, "Draft with AI" button (sparkle icon) + "Send" (clay-filled) button.

## F. AI sidebar

- [ ] **F1** — On viewports ≥1280px, an AI sidebar appears to the right of the thread. 220px wide. Cream background.
- [ ] **F2** — `SUMMARY` section: shows the Russian summary in `--ai-meta` purple-grey color.
- [ ] **F3** — `CLASSIFICATION` section: shows the badge + confidence percent + language code with flag.
- [ ] **F4** — `SUGGESTED ACTION` section: shows the imperative Russian action.
- [ ] **F5** — Footer: shows the LLM provider string (`ollama:llama3.1:8b`) + relative time.
- [ ] **F6** — All section headers are in uppercase Geist Mono caption — recessed feel, not shouty.

## G. Sidebar navigation

- [ ] **G1** — Top of sidebar shows "MailPalace" + `M` logo in clay box.
- [ ] **G2** — `Inbox 142` row has a clay left-border (active state).
- [ ] **G3** — `AI BUCKETS` section is visible with `Action required 3` / `Awaiting reply 7` / `Newsletter digest 31`.
- [ ] **G4** — Clicking any nav row hovers cleanly. None of them currently switch view (v0 stub) — that's expected.

## H. Backend health

- [ ] **H1** — `curl http://127.0.0.1:7330/api/health` returns `{"status":"ok","version":"0.1.0"}`.
- [ ] **H2** — `curl http://127.0.0.1:7330/api/inbox | jq '.emails | length'` returns 10.
- [ ] **H3** — `curl 'http://127.0.0.1:7330/api/inbox?classification=urgent' | jq '.emails | length'` returns 1.
- [ ] **H4** — Open `http://127.0.0.1:7330/api/docs` — FastAPI Swagger UI shows all 7 endpoints.

## I. Smoke test

- [ ] **I1** — `python scripts/smoke.py` from repo root passes all 5 checks. Exits 0.

## J. Things that should NOT work yet (expected gaps)

- Settings page — sidebar link is not wired to a route in v0
- Search bar — magnifier icon is decorative; full-text search ships in v0.1
- Keyboard shortcuts — listed in design spec but not implemented in v0
- Real Gmail / IMAP fetch — stubs only
- Real Ollama triage — backend can do it but you need Ollama installed; demo data is pre-seeded with mock summaries
- Live SSE updates — `/api/events` returns a heartbeat only

If anything in sections A-I breaks, paste the broken item ID + what you saw. We patch in v0.1.
