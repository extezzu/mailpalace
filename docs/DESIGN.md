# Email AI Dashboard — UI Design Spec
**Date**: 2026-05-09
**Author**: Design Investigator
**For**: Frontend builder implementing v0 local-first email AI agent dashboard
**Stack context**: single-user, runs on localhost, browser-based, Python-strong owner

---

## 1. Design References

Ten references spanning live products, design galleries, and documented systems. For each: what exists + what we borrow.

---

### REF-01 — Superhuman (live product)
**URL**: https://superhuman.com / UI catalog at https://nicelydone.club/apps/superhuman

Superhuman is a keyboard-first, two-pane email client built around speed as the primary value proposition. 185 documented UI screens, 34 components. The command palette (Cmd+K) replaces all nav. Split Inbox divides email into priority buckets. Auto Labels (launched Oct 2025) classify every incoming message: response needed / waiting on / meetings / marketing / cold pitches / social — each surfaced as a colored chip.

**What we steal**: the label/badge taxonomy matches our classification schema. The command palette pattern for quick actions. The distraction-free compose view that hides UI chrome while writing. Keyboard shortcuts as first-class navigation.

---

### REF-02 — Shortwave (live product)
**URL**: https://www.shortwave.com / changelog: https://www.shortwave.com/changelog/

Three-panel layout: left nav sidebar + center list + right thread pane. Bundles related emails visually (Google Inbox resurrection). AI search across years of email as a primary affordance. Time-based inbox sections (Today / Last 7 days / Months) configurable by user. Sparkle icon as the standard AI-action trigger. January 2025: AI Organize button exposed to free tier users.

**What we steal**: time-section grouping in the email list — clean way to break chronological feed without folders. AI Organize as a prominent top-level action. Bundle/thread collapse metaphor for newsletter groups.

---

### REF-03 — shadcn/ui Mail Example (reference scaffold)
**URL**: https://v3.shadcn.com/examples/mail
**Analysis**: https://medium.com/@ramu.narasinga_61050/shadcn-ui-ui-codebase-analysis-mail-example-explained-8a3491cc1b85

Three-panel layout using react-resizable-panels with panel sizes persisted in cookies. Left: folder nav with unread counts. Center: scrollable message list with sender, subject, preview snippet, timestamp, category tags (work / important / meeting / personal), unread dot. Right: full thread with action bar (Archive / Junk / Trash / Snooze) plus Reply/Forward controls. State managed with Jotai atoms.

**What we steal**: the exact three-panel structure and resizable panel approach. The unread dot pattern. Category tag rendering on list items. Action bar placement in the detail pane. We override the neutral gray color scheme with our cream palette and add AI metadata sidebar.

---

### REF-04 — Linear (live product + documented redesign)
**URL**: https://linear.app / Redesign: https://linear.app/now/how-we-redesigned-the-linear-ui / Brand: https://linear.app/brand

Linear uses Inter Display for headings, Inter for body. LCH color space for theme generation — three variables (base, accent, contrast) replace 98 token definitions. The redesign deliberately reduced blue chrome usage for a more neutral and timeless appearance. Sidebar and header alignment is mathematically precise — icons, labels, buttons share a single alignment grid. Visual noise reduced by increasing contrast of text and decreasing it on chrome.

**What we steal**: sidebar alignment discipline on an 8px grid. The chrome-must-whisper, content-must-shout philosophy. LCH-inspired perceptual thinking for our color system. The Inter Display / Inter pairing adapted here as Geist Sans 700 / Geist Sans 400.

---

### REF-05 — Inbox Zero (open source reference)
**URL**: https://github.com/elie222/inbox-zero / Hosted: getinboxzero.com

Tech: Next.js + Tailwind + Prisma + Postgres + Redis + Turborepo. Plain-English rule engine UI, bulk unsubscribe views, email analytics charts, Slack/Telegram notification integration. 0k+ MRR from ~8k users. Solo founder built with Claude Code approach. Functional-minimal UI — no decorative elements, tight spacing, priority on action completion.

**What we steal**: the plain-English rule UI for AI triage configuration (our Settings page). Analytics view pattern for AI performance metrics. Bulk action UX for archive/unsubscribe flows. The open-source-then-hosted-tier business model.

---

### REF-06 — Front Inbox (Mobbin reference)
**URL**: https://mobbin.com/explore/screens/e1fbb598-ea2f-4f28-b02c-0af2e870e250

Front is a collaborative inbox tool. List items show: avatar, sender name, subject, body preview, timestamp, label badge. Uses a 2px left-border accent to indicate unread state instead of bold-text pattern. Selected email in right pane gets faint background elevation, not a border.

**What we steal**: the 2px left-border unread indicator — cleaner than bold text, no layout shift when read. Avatar with initials fallback. Background elevation pattern for selected state.

---

### REF-07 — CentralFlow CRM Email SaaS (Behance)
**URL**: https://www.behance.net/gallery/208923943/CentralFlow-CRM-Email-SaaS-UI-UX-Design

CRM-integrated email SaaS by Ron Design Lab. Prioritizes information density without visual noise. Data cards for communication metrics, centralized navigation, accent-on-white philosophy where sparse colored accents guide attention to mission-critical data.

**What we steal**: data card approach for AI agent stats in the sidebar (emails processed / triaged / awaiting action today). The sparse accent-on-neutral philosophy translated to our clay-on-cream system.

---

### REF-08 — AI Agent Customer Service Dashboard (Behance)
**URL**: https://www.behance.net/gallery/237704797/AI-Agent-Customer-Service-Dashboard-UIUX-Design

Nexchat-branded AI agent dashboard. Minimal blue-white theme, grid-based layout. Smart data cards for agent status and performance. Designed for operators who look at it all day — cognitive load reduction is primary.

**What we steal**: agent status indicator pattern — a chip showing the AI current action (processing / triaged / awaiting). The all-day-viewing cognitive philosophy: our primary user is themselves, running this on localhost for hours.

---

### REF-09 — Notis+ Smart AI Workspace (Behance)
**URL**: https://www.behance.net/gallery/245890113/Notis-Smart-AI-Workspace-UX-UI-Design

AI workspace for text/voice/image capture with AI-powered categorization. Treats AI classification as a first-class navigation axis, not a secondary filter. The mental model is AI categories, not manual folders.

**What we steal**: AI categories as primary navigation tabs. The AI categorization as the organizing mental model — users do not manage folders, they trust the AI buckets and override exceptions.

---

### REF-10 — Collect UI Inbox Challenge (Dribbble aggregate)
**URL**: https://collectui.com/challenges/inbox

Aggregates Dribbble shots by Michael Korwin (Pipeline UI Inbox), Michal Parulski (Inbox Web App), Apostol Voicu (Bucket Email Client), Krijn Rijshouwer (Inbox Voyage UI Kit), and others. Recurring pattern across top shots: 56-64px row height, sender avatar left-anchored, timestamp right-anchored, subject medium weight, snippet truncated at one line, classification chip inline with subject, unread indicator as small colored dot. List uses 1px separator lines, not card borders.

**What we steal**: the 60px row height as standard list item. Dot-separator pattern instead of card borders. Chip inline with subject as the dominant classification display pattern.

---
## 2. Color Palette

Light theme primary. Harmonizes with locked brand palette (cream #F5F0E8 / clay #CC785C / ink #1F1F1F / muted #8A8580) but adapted for a tool. Tools need higher surface contrast and categorical colors for AI classification.

| Token | Hex | Role |
|---|---|---|
| --bg | #F7F3EC | Page background. Warm cream, slightly lighter than PDF brand to avoid muddy screen rendering. |
| --surface | #FFFFFF | Email list rows, cards, input fields. Pure white creates hierarchy over bg. |
| --surface-elevated | #FDFCFA | Selected email pane, floating dropdowns, modals. One step above surface. |
| --border | #E4DDD3 | Row separators, panel dividers, input outlines. PDF hairline adapted for screen. |
| --text-primary | #1F1F1F | Sender name, subject, body text. Brand ink, inherited directly. |
| --text-secondary | #5C5752 | Snippet preview, metadata, timestamps. Warm mid-tone between ink and muted. |
| --text-tertiary | #9B9591 | Placeholder text, disabled labels. Lighter than brand muted. |
| --accent | #CC785C | Brand clay. Unread left-border, selected state, active nav, primary button. One use per component max. |
| --urgent | #D94F3D | Classification badge: Action Required. Warm red, distinct from clay. |
| --important | #E09530 | Classification badge: Important. Amber, reads as warning-level. |
| --newsletter | #6B7A9F | Classification badge: Newsletter/Digest. Muted blue, low visual priority. |
| --ai-meta | #7A6F8A | AI-generated content: summary, confidence. Warm purple-grey signals machine-generated. |

Extension colors (same muted register): --promo #9B8A6B (warm tan, promotional) and --transactional #5B8A75 (muted teal, receipts). Five categorical colors for five classification buckets.

Accent rule: --accent appears in exactly one place per visible component. Never two accent-colored elements in the same row or panel simultaneously. This is the single most important visual discipline rule.

---

## 3. Typography Stack

Font: Geist Sans + Geist Mono (Vercel, free commercial use, npm package geist). Already the locked brand font from the PDF system -- using the same family in the web app unifies the brand across all touchpoints. Geist Sans is a geometric sans-serif with Swiss-design DNA, UI-rendering-optimized. Geist Mono for labels, metadata chips, keyboard key rendering.

Fallback: Geist Sans, Inter, system-ui, -apple-system, sans-serif
Mono fallback: Geist Mono, JetBrains Mono, Fira Code, monospace

| Step | Name | Size | Weight | Line-height | Tracking | Usage |
|---|---|---|---|---|---|---|
| 1 | Display | 28px / 1.75rem | 700 | 1.1 | -0.03em | App name, empty state headline |
| 2 | H1 | 20px / 1.25rem | 700 | 1.2 | -0.02em | Panel section headers, Settings titles |
| 3 | H2 | 16px / 1rem | 600 | 1.3 | -0.01em | Thread header, AI summary section header |
| 4 | Body | 14px / 0.875rem | 400 | 1.5 | 0 | Email body, descriptions, settings labels |
| 5 | Small | 12px / 0.75rem | 400 | 1.4 | 0 | Email snippet, timestamp, metadata |
| 6 | Caption | 11px / 0.6875rem | 500 | 1.3 | +0.01em | Classification badges, keyboard chips (Geist Mono) |

Key rules:
- Sender name in list: Body 14px weight 600 when unread, 400 when read. Weight delta alone is sufficient -- no color or size change.
- Subject line in list: Body 14px weight 500 always.
- Snippet: Small 12px weight 400, --text-secondary color, single line, ellipsis overflow.
- Russian AI summaries: Body size, --ai-meta color. No italic -- Cyrillic italic in Geist reads poorly at small sizes.
- Never mix Geist Mono and Geist Sans on the same text run within a single element.

---

## 4. Layout Patterns

### 4.1 Master-Detail: Three-Panel Layout

Three panels using react-resizable-panels, consistent with the shadcn/ui mail example scaffold.

ASCII structure:

  +---nav---+------list-pane------+--------detail-pane---------+
  | 220px   |  320px min,         |  flex: 1 remaining width   |
  | fixed   |  resizable          |                            |
  | Account |  Filter bar (48px)  |  Thread toolbar (48px)     |
  | switcher|  Email list rows    |  Thread messages scroll    |
  | Nav     |  scroll             |  Inline reply (bottom)     |
  | Settings|                     |  AI sidebar (200px right)  |
  +---------+---------------------+----------------------------+

Nav panel: 220px fixed. Collapses to 48px icon-only rail at viewports narrower than 1200px. Contains: account switcher top (avatar 32px + name, click opens provider switcher sheet), folder list (Inbox / Sent / Archive / Drafts + AI-defined categories), settings link pinned bottom.

Center list pane: 320px minimum, resizable via drag handle. Width persisted in localStorage.

Right detail pane: fills remaining width (flex: 1). Internally splits at >1400px viewport into thread (flex) + AI sidebar (200px). On smaller viewports the AI sidebar collapses to a toggleable drawer.

### 4.2 Header / Toolbar

No global app header bar. Each panel owns its 48px micro-toolbar.

Nav panel top: Account avatar (32px circle) + account display name. Clicking opens provider switcher sheet. No hamburger, no global title.

List pane toolbar (48px, sticky): Filter pills [All] [Urgent 3] [Important 12] [Newsletter 31] [Other 96] left-anchored, search icon and compose (+) right-anchored. Counts shown as small unread badges. Search icon expands to full-width inline input, no modal. Compose (+) is a 32px icon button.

Detail pane toolbar (48px, sticky): Optional back arrow for mobile. Sender name and subject snippet center-left. Archive, Snooze, and More (...) right-anchored as 32px icon buttons. More opens Radix DropdownMenu: Mark unread / Move to folder / Forward / Flag / Report spam / Delete.

### 4.3 Email List Item

Row height: 60px. Left-border: 2px --accent when unread, 2px transparent when read. Background: --surface. Hover: --surface-elevated. Selected: --surface-elevated + --accent left-border always visible (even when read).

Row layout (left to right):
- Avatar 36px circle with initials fallback, background is deterministic pastel from sender email domain hash
- Sender name (14px, weight 600 unread / 400 read) + timestamp right-aligned (12px, --text-tertiary)
- Subject (14px, weight 500) + ClassificationBadge + LanguageFlag inline
- Snippet (12px, --text-secondary, single line, ellipsis overflow)

Hover reveals: Archive, Snooze, Mark-read icon buttons (20px each) at row right edge with 150ms fade-in. Pressing any auto-selects the next row.

### 4.4 Email Detail View

Thread header section: Avatar 40px left. From: Full Name plus email address right-padded with timestamp. To: field. Subject line in H2 weight (16px 600).

Thread messages: vertically stacked cards. Last 2 messages expanded, earlier messages hidden behind a show-N-earlier expand control. Each card uses --surface background, --border 1px outline, 12px border-radius, 16px internal padding.

Inline reply: always visible at thread bottom, never a modal. 4-line textarea, auto-expands on focus. Three buttons: Send (--accent filled background, white text) / Discard (ghost, --text-secondary) / Draft with AI (opens Radix Popover with tone options: Formal / Casual / Brief / Detailed).

AI metadata sidebar (200px wide, right of thread on viewports wider than 1400px):
  Section headers at H2 size. Separator: 1px --border hairlines.
  1. AI SUMMARY -- 2-4 sentence summary in Body size, --ai-meta color.
  2. CLASSIFICATION -- ClassificationBadge + Confidence percentage (Caption, --text-secondary), right-aligned on same line.
  3. SUGGESTED ACTION -- action label (Body) + suggested draft line (Small, --text-secondary).
  4. PROCESSING TIME -- elapsed time since classification (Caption, --text-tertiary).
  Sidebar background: --bg (cream, recessed from white thread pane).

### 4.5 Settings Page

Full-page view, not a modal. Left sidebar nav 160px + content panel right.

Settings nav (40px row height, active row: --accent left-border): Accounts, AI Configuration, Notifications, Appearance, Keyboard Shortcuts.

Accounts: each connected account is an 80px card showing provider icon (20px), email address, sync status chip (Active green / Error --urgent). Add Account button opens Radix Sheet from right: provider radio (Gmail / Outlook / IMAP), then credential fields. OAuth shows a Continue with Google button. IMAP shows server, port, username, password fields.

AI Configuration: ApiKeyField per key, model selector dropdown (OpenAI GPT-4o / Claude Sonnet / Ollama local), summary language radio (Russian / English / auto-detect), plain-English triage rules textarea (one rule per line following Inbox Zero style).

Appearance: light/dark theme toggle as radio group, density selector (Comfortable 60px rows / Compact 48px rows).

### 4.6 Empty States

Empty category (e.g., Urgent clear): 40px inbox outline icon in --text-tertiary, Display (28px) headline Nothing in Urgent, Body subtext Your AI will surface action-required emails here. Centered in list pane. No illustration, no animation.

Inbox zero: 40px checkmark circle in --accent (rare icon use), Display headline Inbox zero., Body stat line pulled from FastAPI backend (e.g., 28 emails processed today -- 12 archived, 9 newsletters, 7 replied).

No accounts (first launch): 40px envelope-plus icon in --accent, Display headline Connect your inbox, Body Add a Gmail account or IMAP credentials to start., Primary CTA button Add Account (--accent bg, white text).

Loading state (first sync): 8 skeleton rows at 60px with shimmer (--border to --surface gradient, 1.5s loop). Label: Syncing inbox... in Caption --text-tertiary. No spinner.

AI classification running: non-blocking banner at top of list pane with thin --accent progress bar below filter bar. Auto-dismisses on completion. UI is never blocked.

---

## 5. Interaction Patterns

### 5.1 Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| j / k | Move selection down / up in email list |
| Enter | Open selected email in detail pane |
| e | Archive selected email, advance selection to next |
| r | Reply -- focus inline reply composer |
| u | Toggle read/unread on selected email |
| / | Focus search input |
| c | Compose new email |
| Esc | Close detail pane / dismiss modal / blur search |
| ? | Show keyboard shortcut reference overlay |
| g then i | Go to Inbox (g+i sequence within 500ms) |
| g then a | Go to Archive |
| g then s | Go to Sent |
| 1 / 2 / 3 / 4 / 5 | Switch filter: All / Urgent / Important / Newsletter / Other |
| Shift+A | Archive all emails in current filter |
| Tab | Move focus: list pane to detail pane to AI sidebar |
| Cmd+K | Open command palette (v0.1 feature) |

Implement via a global keydown listener on document. Show shortcut hints in element title attributes initially; upgrade to a custom KeyboardShortcutChip tooltip component in v0.1. The g+key sequence uses a 500ms timeout to reset state.

### 5.2 Quick Actions on Email

Hover in list: Archive, Snooze, Mark-read icon buttons (20px each, --text-tertiary at rest, --text-primary on hover) fade in at row right edge with 150ms ease-in. Pressing any auto-selects next row in the list.

Detail pane toolbar: Archive, Snooze, More. More is a Radix DropdownMenu: Mark unread / Move to folder / Forward / Flag / Report spam / Delete.

Keyboard in detail pane: e = archive + advance to next. r = focus reply composer. f = forward. These three require no mouse reach. Results announced in a toast notification (bottom-right corner, 2s auto-dismiss, --surface-elevated background, --border ring).

### 5.3 Filter Bar Behavior

Classification filter pills (default mode): [All 142] [Urgent 3] [Important 12] [Newsletter 31] [Other 96]. Clicking filters client-side instantly -- all email metadata is loaded at startup, no network call required. Active pill: --accent 2px bottom underline, text --text-primary weight 600. Inactive: --text-secondary weight 400. Counts update in real-time as AI classification completes.

Search mode (/ key or search icon click): pills slide up and fade out (200ms ease-out), full-width search input slides down and in. Local index search fires instantly on each keystroke from metadata held in memory. Backend semantic search fires after 300ms debounce. Small spinner icon replaces the unread count indicator during backend search. Esc returns to filter pills with previously active filter retained.

Combined filter+search (v1 feature): secondary category pills appear below search input, allowing search narrowed to a single category.

---

## 6. Frontend Stack Recommendation

### Decision: Next.js 15 (App Router) + shadcn/ui + Tailwind CSS

Rationale:

1. The shadcn/ui mail example (https://v3.shadcn.com/examples/mail) is a directly reusable scaffold. It already implements three-panel layout with react-resizable-panels, Jotai state, and the exact component set needed. Starting here eliminates 2+ weeks of bootstrap time versus any other choice.

2. Local-first (localhost) removes Next.js primary complexities: server-side auth, CDN, edge functions. Used purely as a React framework with built-in dev server. No deployment complexity for v0.

3. Geist Sans/Mono (brand fonts) is a Vercel-published npm package (geist). Zero config in a Next.js project -- the geist package or next/font/local handles it natively. Brand font consistency from day one with zero effort.

4. Python expertise stays in FastAPI. Next.js communicates with it via fetch to localhost:8000. Backend stays Python, frontend is a thin display and interaction layer. Node complexity bounded to: bun dev plus two config files.

Against alternatives:

- Vite+React: equivalent power, no scaffold. Building resizable panels and all Radix primitives from scratch adds 1-2 weeks. Only choose if scaffold approach is blocked.
- SvelteKit: excellent DX for small apps but shadcn ecosystem does not exist in Svelte. Every component built from scratch.
- SolidJS: technically superior fine-grained reactivity but near-zero ecosystem for this use case. This is a single-user localhost tool, not a performance product where runtime overhead matters.
- FastAPI + HTMX: appealing given Python strength. HTMX interaction model is too coarse for a keyboard-shortcut-heavy, state-rich inbox. Panel swapping, filter pills, real-time skeleton loading, and command palette are all painful in HTMX. HTMX is correct for content sites. React is correct for interactive apps with complex ephemeral state.

UI library: shadcn/ui (Radix primitives + Tailwind utilities). Not Mantine, not Tailwind UI.

Reason: shadcn/ui components are copied into the project, not installed as opaque dependencies. Full style control without fighting library overrides. Radix handles accessibility: keyboard nav, ARIA roles, focus trap in modals. Tailwind CSS custom properties handle the cream/clay token system via extend.colors mapping tokens to utility classes.

State management: Jotai for local UI state (selected email, active filter, panel sizes, sidebar open/closed). TanStack Query (React Query) for server state against FastAPI endpoints. No Redux, no Zustand.

Node complexity mitigation: use bun instead of npm (faster installs, simpler). FastAPI backend runs as a separate uvicorn process, never touches Node. Owner runs exactly two commands: bun dev and uvicorn main:app.

Token strategy: define all 14 color tokens as CSS custom properties in globals.css. Tailwind extend.colors maps them to utility classes (text-text-primary, bg-surface-elevated, etc.). Dark theme in v1 is a single :root[data-theme=dark] block swapping token values -- zero component changes required.

---

## 7. Component Catalog

15 components in components/email/ and components/ui/.

| # | Component | File | Description |
|---|---|---|---|
| 1 | EmailListItem | email/EmailListItem.tsx | Single 60px row. Props: email object, isSelected, isUnread. Renders avatar, sender, subject, snippet, time, ClassificationBadge, LanguageFlag. Hover reveals quick action icons. |
| 2 | ClassificationBadge | email/ClassificationBadge.tsx | Small pill (11px Geist Mono). Props: category (urgent/important/newsletter/promo/transactional/other), size (sm or md). Background = category color at 15% opacity, text at 100% opacity. |
| 3 | LanguageFlag | email/LanguageFlag.tsx | 16px emoji flag from 2-letter language code. Returns null when lang matches user primary language (da for Danish). Props: lang string. |
| 4 | EmailList | email/EmailList.tsx | Scrollable list container. Renders time-section headers (Today / Yesterday / This Week / Older) between grouped rows. Renders SkeletonRow during loading state. |
| 5 | FilterBar | email/FilterBar.tsx | Sticky 48px bar at list pane top. Manages filter pills and search mode. Handles slide animation between modes. Exposes onFilterChange and onSearchChange callbacks. |
| 6 | FilterPill | email/FilterPill.tsx | Single classification filter tab. Props: label, count, isActive. Active state: --accent 2px bottom underline, weight 600. Inactive: --text-secondary weight 400. |
| 7 | ThreadViewer | email/ThreadViewer.tsx | Full thread view. Props: thread as EmailMessage array. Last message always expanded. Earlier messages behind expand control. InlineReplyComposer pinned at bottom. |
| 8 | AiMetaSidebar | email/AiMetaSidebar.tsx | 200px right sidebar. Props: emailId, aiData (summary, category, confidence, suggestedAction, processedAt). Caption typography throughout. Collapsible via toggle button in detail toolbar. |
| 9 | InlineReplyComposer | email/InlineReplyComposer.tsx | Textarea at thread bottom. 4 lines collapsed, auto-expands on focus. Buttons: Send (--accent filled) / Discard (ghost) / Draft with AI (Radix Popover with Formal / Casual / Brief / Detailed tone options). Not a modal. |
| 10 | ProviderSwitcher | settings/ProviderSwitcher.tsx | Account list in Settings > Accounts. Each account: card (80px) with provider icon, email, status chip. Add Account opens Radix Sheet from right with provider radio + credential form. |
| 11 | ApiKeyField | settings/ApiKeyField.tsx | Password input with show/hide toggle and Test Connection button. Inline success/error state after test. Never stores key in localStorage -- passes directly to FastAPI backend on save. |
| 12 | SkeletonRow | ui/SkeletonRow.tsx | Animated shimmer placeholder at 60px height. CSS keyframe animation on --border-to--surface gradient, 1.5s loop. No third-party skeleton library required. |
| 13 | EmptyState | ui/EmptyState.tsx | Centered panel: icon (40px), headline (Display 28px), body text, optional CTA button. Variants: empty-category / inbox-zero / no-accounts / loading. Icon and copy determined by variant prop. |
| 14 | CommandPalette | ui/CommandPalette.tsx | Radix Dialog triggered by Cmd+K. Fuzzy-searchable action list and email quick-open. Centered modal with --surface-elevated background and --border ring. v0.1 feature -- build after core layout is stable. |
| 15 | KeyboardShortcutChip | ui/KeyboardShortcutChip.tsx | Geist Mono 11px pill for rendering keyboard keys in tooltips and shortcut overlay. Props: keys as string array. Each key rendered as a 20px rounded rect with --border background. |

---

## Sources Consulted

1. https://superhuman.com -- live product, accessed via WebSearch and description from nicelydone.club/apps/superhuman
2. https://nicelydone.club/apps/superhuman -- fetched, index metadata only (images behind auth)
3. https://www.shortwave.com/changelog/ -- fetched, Jan-Feb 2025 entries retrieved
4. https://v3.shadcn.com/examples/mail -- fetched, full three-panel layout description extracted
5. https://medium.com/@ramu.narasinga_61050/shadcn-ui-ui-codebase-analysis-mail-example-explained-8a3491cc1b85 -- via WebSearch
6. https://linear.app/now/how-we-redesigned-the-linear-ui -- fetched, typography and LCH color system details
7. https://linear.app/brand -- cited in internal codebase doc polypalace-pdfs-design-content-2026-05-04.md
8. https://www.saasframe.io/categories/inbox -- fetched, 15 product inbox examples listed
9. https://mobbin.com/explore/web/screens/emails-messages -- 403 Forbidden (auth required)
10. https://mobbin.com/explore/screens/e1fbb598-ea2f-4f28-b02c-0af2e870e250 -- Front inbox screen, URL verified via WebSearch
11. https://collectui.com/challenges/inbox -- fetched, top 10 Dribbble inbox shots with designer names
12. https://www.behance.net/gallery/237704797/AI-Agent-Customer-Service-Dashboard-UIUX-Design -- fetched, design description extracted
13. https://www.behance.net/gallery/208923943/CentralFlow-CRM-Email-SaaS-UI-UX-Design -- fetched (design philosophy extracted, images not in HTML)
14. https://www.behance.net/gallery/245890113/Notis-Smart-AI-Workspace-UX-UI-Design -- fetched (images not in HTML)
15. https://vercel.com/font -- Geist font page, via WebSearch
16. https://github.com/elie222/inbox-zero -- cited via internal landscape research
17. https://github.com/Mail-0/Zero -- cited via internal landscape research
18. Internal: C:/Users/Bruger/Desktop/projects/money/data/research/email-ai-agent-landscape-2026-05-09.md -- read directly, authoritative for product landscape
19. Internal: C:/Users/Bruger/Desktop/projects/money/data/research/polypalace-pdfs-design-content-2026-05-04.md -- read directly, authoritative for locked brand palette and Geist typography system
