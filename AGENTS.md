# AGENTS.md — prism-analyst-platform (frontend)

> If you haven't read the workspace-level [`../AGENTS.md`](../AGENTS.md) and
> [`../PRISM_HANDOFF.md`](../PRISM_HANDOFF.md) yet, do that first. This file is
> the frontend-specific addendum.

## Stack at a glance

Next.js 15 (App Router) · React 19 · TypeScript · CSS Modules · TanStack Query
· `react-markdown` + `remark-gfm` + `rehype-highlight` (chat markdown + fenced-code
syntax highlighting) · `@supabase/ssr` + `@supabase/supabase-js` (auth) ·
`lightweight-charts` (Stock Dashboard line/candlestick) · `react-force-graph-3d`
+ `three` (legacy BMC explorer — BMC is now a 2D Osterwalder canvas) · Express
landing page (separate container). Deployed via Docker Compose on EC2 alongside
the backend (+ a backtest `worker` container).

## Knowledge graph first

```bash
graphify query "<question>"        # default
graphify explain "<concept>"        # focused
graphify path "<A>" "<B>"           # relationships
graphify update .                   # after edits
```

The graph lives at `graphify-out/`. Use it before `Read`/`Grep`.

## Design system (Lakshya) — non-negotiable

| Token | Value |
|---|---|
| Display font | Fraunces (serif, italic) |
| Body font | Inter Tight |
| Mono font | JetBrains Mono |
| Accent | `#8B6F3F` (warm gold) |
| Background | `#F4F4F1` (paper) |
| Elevated | `#FFFFFF` |

Tokens live in `src/styles/globals.css` (light + dark variants). **Every
feature component uses CSS Modules** — never inline styles, never raw Tailwind
classes on feature components. The design spec is
`PRISM_ANALYST/lakshya-analyst-mockup_4.html` in the workspace root — match it
pixel-perfect.

## Routing model — the `(workspace)` route group

Every feature view is a **URL route** under the `src/app/(workspace)/` route
group. `(workspace)` is a route group → it adds NO URL segment; it just wraps
all the views in one shared shell (sidebar + topbar + `ChatProvider` +
⌘K/⌘N keys), defined in `src/app/(workspace)/layout.tsx`. Navigation is
`router.push('/<view>')` — **there is NO `renderView()` switch any more** (the
old in-`/chat` view-switcher is gone). The active tab is derived from the URL.

A few routes live OUTSIDE the workspace shell: `src/app/page.tsx` (redirects
→ `/chat`), the public `src/app/shared/[token]/page.tsx` (read-only snapshot,
no shell/auth/ChatProvider), and the auth pages `sign-in/`, `sign-up/`,
`auth/callback/`.

## Where the chat lives

```
src/
├── app/(workspace)/
│   ├── layout.tsx                     WorkspaceShell — AppShell + SearchModal,
│   │                                  wires ⌘K / ⌘N / Esc via useKeyboard, hosts
│   │                                  ChatProvider so chat state survives tab nav
│   ├── chat/page.tsx                  New/current conversation → <ChatScreen/>
│   └── chat/[sessionId]/page.tsx      Resumed conversation (refresh / deep-link /
│                                      share) → loadConversation(id) → <ChatScreen/>
├── app/chat/components/               Chat UI (shared by BOTH routes above):
│   ├── ChatScreen.tsx                 idle → <AskScreen/> else <ChatLayout/>
│   ├── ChatLayout.tsx                 The chat shell (composer + thread + workspace)
│   ├── AskScreen.tsx                  Welcome/ask screen (paperclip is a NO-OP stub
│   │                                  — attachments not built; don't advertise upload)
│   ├── ClarificationCard.tsx          Disambiguation form (single/multi/open + search)
│   ├── TaskChecklist.tsx              Agent plan/checklist (plan event)
│   ├── FilingPdfViewer.tsx            Citation → exact PDF page
│   └── toolLabels.ts                  Human labels for tool ids
├── components/
│   └── ChatProvider.tsx               Holds useChat() ONCE (useChatState/useChatActions)
├── hooks/
│   └── useChat.ts                     SSE state machine. Title is set ONLY
│                                      on first turn (do NOT overwrite on
│                                      follow-up turns — a previous bug).
└── lib/api/
    ├── chat.ts                        SSE stream client + TS wire types — must
    │                                  mirror backend src/schemas/chat.py exactly
    ├── conversations.ts               list/search · pin/archive · rename/delete ·
    │                                  feedback · share/getShared (Phase 1–6 + 9)
    └── chat.mock.ts                   Mock-mode scenarios; localStorage flag
                                      "prism.mockMode". DEV-ONLY, localStorage-gated,
                                      OFF by default — ships disabled, not a user feature.
```

**Chat feature set (Phases 1–6 + 9, all shipped):** per-conversation URLs +
context continuity on resume, conversation search, pin/archive + pagination,
Markdown export, per-answer 👍/👎 feedback, fenced-code syntax highlighting
(`rehype-highlight`) + per-block copy, scroll-to-bottom, "continue generating"
on truncated answers, ⌘K palette, and a read-only public share link.

> **Not in the build — do NOT document or re-introduce:** edit-a-message /
> true-tree branching / a `‹k/n›` branch switcher (Phase 7 was built then
> **reverted**); file attachments (Phase 8 — the AskScreen paperclip is a no-op
> stub).

## SSE event types (must match backend)

`meta` · `tool_call` · `tool_result {ok, error, error_code, next_action}` ·
`token` · `plan` · `agent_thought` · `tool_retry` · `data_freshness` · `chart` ·
`final` (with structured `FinalAnswer`) · `clarification` · `error`.
Verify exact shapes in `src/lib/api/chat.ts` before editing.

`FinalAnswer = {text, citations[], confidence, data_freshness, kpis[], sections[], suggestions?}`.

Two recently added fields that the chat features depend on:

- **`FinalEvent.truncated?`** — `true` when the model hit its output-token cap
  (`finish_reason=MAX_TOKENS`); the answer is cut off and the UI offers
  **"Continue generating"**.
- **`MetaEvent.agent_run_id`** (also on `FinalEvent`) — threaded onto the
  message so the per-answer **👍/👎 feedback** call can attribute the run.

If you change the TS shape, change the Pydantic shape at
`prism-analyst-services/src/schemas/chat.py` in the same PR.

## Conversations API + cross-repo dependency

`src/lib/api/conversations.ts` backs the Phase 1–6 + 9 chat features:
`list`/search, `get`, `rename`, `remove`, pin/archive (via the
`usePin/useArchive` hooks), `share`/`getShared`, and feedback
(`useSubmitFeedback`). Client modules: `ShareModal.tsx` (create/copy a public
link), `ConversationActionsMenu.tsx` (rename / pin / archive / delete /
share), `QuotaNotice.tsx` (daily-limit banner).

> **Cross-repo deploy dependency.** Feedback, pin/archive, and share **500/404
> without the backend migrations applied** — `0017_chat_pin_archive`,
> `0018_message_feedback`, `0019_chat_share` (backend migration head =
> `0019_chat_share`). The deploy auto-runs `alembic upgrade head`, but if the
> backend hasn't shipped these, those chat actions break.

## Auth + middleware

`src/middleware.ts` refreshes the Supabase session cookie and (optionally)
guards routes. It's a no-op when `appConfig.authEnabled` is false. When on:

- `PUBLIC_PREFIXES = ["/sign-in", "/sign-up", "/auth", "/shared"]` — note
  `/shared` is whitelisted so public share links survive even if login is forced.
- `REQUIRE_AUTH = false` — login is NOT forced; anonymous visitors browse
  everything, signing in just adds identity. (Flip to `true`, or move gating to
  the backend `config/access_policy.yml`, once the team sets the gating matrix.)

In prod the build sets `NEXT_PUBLIC_AUTH_ENABLED="true"` with a real Supabase
URL + publishable anon key, so auth is ON — but per `REQUIRE_AUTH=false`, not
enforced.

## Build-time vs runtime env vars (CRITICAL)

Next.js inlines `NEXT_PUBLIC_*` **statically at build time**. Setting them at
runtime in `docker-compose` `environment:` has NO effect on the bundled JS.

- Local dev: `.env.local` — picked up at `npm run dev`.
- Production: passed as `build.args` in `docker-compose.prod.yml` → `ARG`+`ENV`
  in `Dockerfile` builder stage → `next build` inlines them.

If you add a new `NEXT_PUBLIC_*` var, you MUST update BOTH `Dockerfile` and
`docker-compose.prod.yml`.

## Settings → Tools & Capabilities

This page lists registered integrations via `GET /api/v1/integrations`.
Current expected counts (matching backend):

- `stock-chat · 3 tools`
- `bmc · 6 tools`
- `prism-financials · 1 tool` ← added 2026-05-27; if your backend session
  shows fewer, the prod env var `PRISM_FINANCIALS_URL` may be unset.
- `prism-news · 4 tools` (news_sentiment / news_trending / news_search /
  news_compare). The Stock Dashboard's investment-DB data is a UI feature with
  NO agent tool, so it does not appear here.

## Keyboard shortcuts

Only three are wired, at the workspace level (`useKeyboard(...)` in
`src/app/(workspace)/layout.tsx`). There are no ⌘B / ⌘1 / ⌘2 / ⌘3 bindings.

| Shortcut | Action |
|---|---|
| ⌘K / Ctrl+K | Toggle the command palette (search + navigate) |
| ⌘N / Ctrl+N | New research (navigates to `/chat`) |
| Esc | Close the command palette |

## Views beyond chat (URL routes under `(workspace)/`)

Every feature is its own URL route under `src/app/(workspace)/`, NOT a case in
a `renderView()` switch (that switch is gone). The shared shell derives the
active tab from the URL. **To add a view:** add `src/app/(workspace)/<view>/page.tsx`,
extend `NavView` + add a `NAV_ITEMS` entry in `src/lib/mockData.ts`, and wire
the `Sidebar.tsx` icon + `Topbar.tsx` label. (No `renderView` case to touch.)

Live views (`NAV_ITEMS`): **Dashboard**, **Research Chat**, **Business Models**
(`/bmc`), **News & Sentiment**, **Stock Dashboard**, **Regulatory Lens**,
**Portfolio Builder**; plus **Account** + **Settings** in the sidebar footer.
There is no "Companies" view and no "Reports" view.

- **Business Models** (`src/app/(workspace)/bmc/page.tsx` → `src/app/bmc/components/BMCView`)
  — 2D Osterwalder canvas (light/dark, version timeline, temporal diff, PDF
  citations, export). Reads `?ticker=` / the `@bmc` chat→BMC handoff.
- **News & Sentiment** (`src/app/(workspace)/news/`, components in
  `src/app/news/components/`) — feed-first; `news.ts` hooks proxy to
  `/api/v1/news/*`. Company tracking via a localStorage watchlist
  (`useWatchlist`); the company sub-filter re-scopes the feed server-side.
- **Stock Dashboard** (`src/app/(workspace)/stocks/`, components in
  `src/app/stocks/components/`) — `stocks.ts` hooks hit `/api/v1/stocks/*`
  (direct investment-DB reads). Two stacked sections: Overview (price chart) +
  Annual Financials (Balance Sheet tree; Income Statement / Cash Flow disabled
  — no data yet). Per-row **Ask PRISM** routes into chat via the `onAsk` prop
  (mirrors NewsView). Search is **instant in-memory**: `useSecurities()` fetches
  all ~8,230 securities ONCE (cached), then `searchSecurities()` filters
  client-side — no per-keystroke API.
- **Regulatory Lens** (`src/app/(workspace)/regulatory/`) — view over the
  read-only SEBI Postgres; `regulatory.ts` hooks.
- **Portfolio Builder** (`src/app/(workspace)/portfolio/`) — `portfolio.ts`
  hooks; backtests are durable jobs run by the `worker` container, not the API.

## Two gotchas the Stock Dashboard / sidebar hit

- **`lightweight-charts` is client-only** — load `PriceChart` via
  `next/dynamic({ ssr: false })` (it touches the DOM). It reads Lakshya tokens
  via `getComputedStyle` and recreates on theme change. v5 API:
  `chart.addSeries(LineSeries | AreaSeries | CandlestickSeries, …)`. Pin colours
  from CSS vars; don't hardcode.
- **Flex + `overflow: hidden` clips children.** The sidebar scroll zone
  (`.scrollArea`) and any flex column with overflow-hidden rows must set
  `flex-shrink: 0` on the rows, or flexbox squishes them below content height
  and clips the text. (Fixed in `Sidebar.module.css`.)

## Other recent UX to know about

- **Collapsible icon-rail sidebar** with ⌘B + localStorage persistence
  (`prism.sidebar.collapsed`). Three-zone layout: pinned brand + New Research,
  a scrollable middle (`.scrollArea` — nav + recent), pinned user/footer. Custom
  `Tooltip` primitive for collapsed-mode labels.
- **Markdown rendering** in the chat thread (`react-markdown` + `remark-gfm`) +
  citation popovers + copy button. Fenced code blocks get **syntax highlighting**
  via `rehype-highlight` plus a per-block copy control.
- **Tool-call timeline** in the right pane (Tools tab). Each `stock_filings_*`
  / `bmc_*` / `financials_query` call gets a card with status + retry chip.

## Tests + checks

```bash
npm run lint        # ESLint
npx tsc --noEmit    # TypeScript type check
npm run dev         # local dev server :3000
graphify update .   # after edits
```

There is no Jest/Vitest suite yet — verification is manual (open the chat,
exercise the change).

## Common traps

- Don't render the response stream as raw JSON — the `chat.ts` SSE client
  parses events; render via the React Query state shape, not strings.
- The composer chip ("contextTag") used to read `intentConfig.contextTag`
  unconditionally and stuck on every conversation. Don't re-introduce that.
- Mock mode (`localStorage["prism.mockMode"]`) blocks real SSE calls. It's
  **dev-only, localStorage-gated, and off by default** (ships disabled — not a
  user feature). If you're debugging "why isn't anything happening," check that
  flag first.
- The frontend talks ONLY to PRISM's backend. Don't introduce direct calls to
  `35.234.221.166:8000` or `:8011` or `:8012` — those are backend-internal.

## Files always worth reading first

- `src/app/chat/components/ChatLayout.tsx` — the chat shell.
- `src/hooks/useChat.ts` — the SSE state machine.
- `src/lib/api/chat.ts` — wire-type source of truth.
- `DEPLOYMENT.md` — production gotchas, hotfix recipes, rollback.
