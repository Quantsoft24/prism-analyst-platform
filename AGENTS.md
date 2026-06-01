# AGENTS.md — prism-analyst-platform (frontend)

> If you haven't read the workspace-level [`../AGENTS.md`](../AGENTS.md) and
> [`../PRISM_HANDOFF.md`](../PRISM_HANDOFF.md) yet, do that first. This file is
> the frontend-specific addendum.

## Stack at a glance

Next.js 15 (App Router) · React 19 · TypeScript · CSS Modules · TanStack Query
· `react-force-graph-3d` + `three` (BMC 3D explorer) · `lightweight-charts`
(Stock Dashboard line/candlestick) · Express landing page (separate container).
Deployed via Docker Compose on EC2 alongside the backend.

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

## Where the chat lives

```
src/
├── app/chat/
│   ├── page.tsx                       Ask-screen entry
│   └── components/
│       └── ChatLayout.tsx             The chat shell (~1.5k lines —
│                                      composer + thread + sidebar)
├── hooks/
│   └── useChat.ts                     SSE state machine. Title is set ONLY
│                                      on first turn (do NOT overwrite on
│                                      follow-up turns — a previous bug).
└── lib/api/
    ├── chat.ts                        TS wire types — must mirror backend
    │                                  src/schemas/chat.py exactly
    └── chat.mock.ts                   Mock-mode scenarios; localStorage flag
                                      "prism.mockMode" via sidebar lightning
                                      bolt. REMOVE BEFORE PRODUCTION.
```

## SSE event types (must match backend)

`meta` · `tool_call` · `tool_result {ok, error, error_code, next_action}` ·
`token` · `agent_thought` · `tool_retry` · `data_freshness` · `chart` ·
`final` (with structured `FinalAnswer`) · `error`.

`FinalAnswer = {text, citations[], confidence, data_freshness, kpis[], sections[]}`.

If you change the TS shape, change the Pydantic shape at
`prism-analyst-services/src/schemas/chat.py` in the same PR.

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

| Shortcut | Action |
|---|---|
| ⌘K | Open search |
| ⌘N | New research |
| ⌘B | Toggle collapsed sidebar |
| ⌘1 | Dashboard |
| ⌘2 | Research Chat |
| ⌘3 | Reports Library |
| ⌘4 | Settings |
| Esc | Close modal |

## Views beyond chat (each a component in the `/chat` AppShell view-switcher)

`NavView` (`src/lib/mockData.ts`) + the `renderView()` switch in
`src/app/chat/page.tsx` host every feature. To add a view: extend `NavView`,
add a `NAV_ITEMS` entry + a `Sidebar.tsx` icon + a `Topbar.tsx` label + a
`renderView` case. Live views: Dashboard, Chat, Companies, BMC,
**News & Sentiment**, **Stock Dashboard**, Reports, Settings.

- **News & Sentiment** (`src/app/news/`) — feed-first; `news.ts` hooks proxy to
  `/api/v1/news/*`. Company tracking via a localStorage watchlist
  (`useWatchlist`); the company sub-filter re-scopes the feed server-side.
- **Stock Dashboard** (`src/app/stocks/`) — `stocks.ts` hooks hit
  `/api/v1/stocks/*` (direct investment-DB reads). Two stacked sections:
  Overview (price chart) + Annual Financials (Balance Sheet tree; Income
  Statement / Cash Flow disabled — no data yet). Per-row **Ask PRISM** routes
  into chat via the `onAsk` prop (mirrors NewsView). Search is **instant
  in-memory**: `useSecurities()` fetches all ~8,230 securities ONCE (cached),
  then `searchSecurities()` filters client-side — no per-keystroke API.

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
- **Markdown rendering** in the chat thread + citation popovers + copy button.
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
- Mock mode (`localStorage["prism.mockMode"]`) blocks real SSE calls. If
  you're debugging "why isn't anything happening," check that flag first.
- The frontend talks ONLY to PRISM's backend. Don't introduce direct calls to
  `35.234.221.166:8000` or `:8011` or `:8012` — those are backend-internal.

## Files always worth reading first

- `src/app/chat/components/ChatLayout.tsx` — the chat shell.
- `src/hooks/useChat.ts` — the SSE state machine.
- `src/lib/api/chat.ts` — wire-type source of truth.
- `DEPLOYMENT.md` — production gotchas, hotfix recipes, rollback.
