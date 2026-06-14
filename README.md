# PRISM — AI Equity Research Platform

> **AI-powered equity research analyst for Indian markets.**
> Ask anything about companies, filings, sectors, or funds — with every figure cited and cross-checked.

> **Coding agent? Start here:** [`AGENTS.md`](AGENTS.md) and
> [`../PRISM_HANDOFF.md`](../PRISM_HANDOFF.md). The workspace supports
> multi-agent collaboration (Claude Code, Antigravity, Cursor, Aider) — those
> files are the shared single source of truth across agent sessions.

## Architecture

```
thequantsoft.co.in       → Express.js landing page (:4000)
prism.thequantsoft.co.in → Next.js 15 frontend    (:3000)
api.thequantsoft.co.in   → FastAPI backend         (:8000)
```

All services run on a single EC2 instance via Docker Compose + Nginx
reverse proxy. In production the stack is **five containers**: landing,
frontend, backend, a backtest **worker** (durable Portfolio-Builder jobs,
no ports — reuses the backend image), and nginx. The frontend talks ONLY to
PRISM's backend; the backend fan-outs to external services (`bmc` :8012,
`stock-chat` :8011, `prism-financials` :8000, `prism-news` :8001), its
primary Postgres, a read-only investment RDS (Stock Dashboard data), and a
read-only SEBI Postgres (Regulatory Lens). The old read-only company catalog
DB has been retired (company lookups now resolve via `master_securities`).

## Tech Stack

| Layer     | Technology                                |
|-----------|-------------------------------------------|
| Frontend  | Next.js 15 (App Router), React 19, TypeScript, CSS Modules |
| State     | TanStack React Query                      |
| Markdown  | `react-markdown` + `remark-gfm` + `rehype-highlight` (fenced-code syntax highlighting in chat) |
| Charts    | `lightweight-charts` (TradingView — Stock Dashboard line/candlestick) |
| Graph viz | `react-force-graph-3d` + `three` (legacy BMC explorer; BMC is now a 2D canvas) |
| Auth      | `@supabase/ssr` + `@supabase/supabase-js` (ON in prod; login not forced) |
| Backend   | FastAPI, Python 3.12, Google ADK 1.33+    |
| Landing   | Express.js, React (CDN), Vanilla CSS      |
| Database  | PostgreSQL (primary) + read-only investment RDS + read-only SEBI Postgres |
| Infra     | Docker, Nginx, GitHub Actions, AWS EC2    |

## Design System (Lakshya)

| Token          | Value                          |
|----------------|--------------------------------|
| Display font   | Fraunces (serif, italic)       |
| Body font      | Inter Tight                    |
| Mono font      | JetBrains Mono                 |
| Accent         | `#8B6F3F` (warm gold)          |
| Background     | `#F4F4F1` (paper)              |
| Elevated       | `#FFFFFF`                      |

Tokens live in `src/styles/globals.css` (light + dark variants). Every
feature component is CSS Modules — never inline styles, never raw Tailwind.

## Project Structure

```
prism-analyst-platform/
├── src/
│   ├── middleware.ts               Supabase session refresh + route guard
│   │                               (gated by NEXT_PUBLIC_AUTH_ENABLED; /shared
│   │                               whitelisted; REQUIRE_AUTH=false → login not forced)
│   ├── app/
│   │   ├── layout.tsx              Root layout + ToastProvider
│   │   ├── page.tsx                Redirect → /chat
│   │   ├── (workspace)/            Route group — shared shell (sidebar + topbar +
│   │   │   │                       ChatProvider); NO URL segment. Every feature
│   │   │   │                       view is a URL route here (router.push('/<view>')).
│   │   │   ├── layout.tsx          WorkspaceShell — AppShell + SearchModal + ⌘K/⌘N keys
│   │   │   ├── chat/page.tsx       New / current conversation → <ChatScreen/>
│   │   │   ├── chat/[sessionId]/   Per-conversation URL (resume / deep-link /
│   │   │   │   page.tsx            refresh / share) → <ChatScreen/>
│   │   │   ├── dashboard/          Dashboard view
│   │   │   ├── bmc/                Business Models — renders <BMCView/> (chat→BMC handoff)
│   │   │   ├── news/               News & Sentiment — feed-first, company chips
│   │   │   ├── stocks/             Stock Dashboard — search + price chart + financials
│   │   │   ├── regulatory/         Regulatory Lens (read-only SEBI Postgres)
│   │   │   ├── portfolio/          Portfolio Builder (durable backtests via worker)
│   │   │   ├── account/            My Activity
│   │   │   └── settings/           Settings — incl. Tools & Capabilities (real registry)
│   │   ├── chat/components/        Chat UI (shared by both chat routes above):
│   │   │                          ChatScreen (idle→AskScreen else ChatLayout),
│   │   │                          ChatLayout, AskScreen, ClarificationCard,
│   │   │                          TaskChecklist, FilingPdfViewer, toolLabels
│   │   ├── bmc/components/         BMCView, BMCBlock, BMCEvidencePanel, BMCVersionTimeline,
│   │   │                          BMCDiffView, BMCHome, BMCLibrary, BMC3DExplorer (legacy)
│   │   ├── news/components/        NewsView, NewsFeed, WatchlistPulse, InvestigationDrawer
│   │   ├── stocks/components/      StockDashboardView, SecuritySearch, PriceChart,
│   │   │                          MetricDropdown, LatestStrip, AnnualFinancials, …
│   │   ├── shared/[token]/         PUBLIC read-only conversation snapshot — OUTSIDE
│   │   │   page.tsx               the (workspace) shell (no sidebar/topbar/auth)
│   │   ├── sign-in/, sign-up/      Supabase auth pages (public)
│   │   └── auth/callback/          OAuth / magic-link callback
│   ├── components/                 AppShell, Sidebar, Topbar, Toast, SearchModal,
│   │                              ChatProvider (holds useChat once), ShareModal,
│   │                              ConversationActionsMenu, QuotaNotice
│   ├── hooks/                      useChat, useTheme, useKeyboard
│   ├── lib/
│   │   ├── api/                    Typed API clients + React Query hooks
│   │   │   ├── client.ts           Base fetch wrapper (auth / X-Dev-Firm header)
│   │   │   ├── conversations.ts    list/search · pin/archive · rename/delete ·
│   │   │   │                       feedback · share/getShared (Phase 1–6 + 9)
│   │   │   ├── bmc.ts              BMC types + hooks (proxied via PRISM)
│   │   │   ├── news.ts             News & sentiment hooks (proxied via PRISM)
│   │   │   ├── stocks.ts           Stock Dashboard hooks + in-memory search + formatters
│   │   │   ├── regulatory.ts       Regulatory Lens hooks (SEBI Postgres)
│   │   │   ├── portfolio.ts        Portfolio Builder hooks (backtests)
│   │   │   ├── chat.ts             Chat SSE stream client (mock-mode plumbing colocated)
│   │   │   └── integrations.ts     Settings → Tools & Capabilities
│   │   ├── config.ts               Reads the 4 NEXT_PUBLIC_* vars (build-time!)
│   │   ├── mockData.ts             Sidebar nav (NAV_ITEMS), intent routing, scaffold
│   │   └── utils.ts                cn(), small helpers
│   └── styles/                     globals.css (tokens), tailwind.css (legacy)
├── thequantsoft/                   Landing page (Express + React CDN)
├── Dockerfile                      Next.js standalone build (uses build args)
├── Dockerfile.landing              Express landing page
├── docker-compose.prod.yml         Production: landing + frontend + backend + worker + nginx
├── deploy-first-time.sh            From-scratch EC2 bootstrap (clones, envs, SSL, up)
├── nginx.conf                      Subdomain routing + SSL termination
└── package.json
```

## Local Development

### Prerequisites
- Node.js 20+
- npm 10+
- PRISM backend running locally on :8000 (see the
  [backend repo](https://github.com/Quantsoft24/prism-analyst-services))

### Setup
```bash
git clone https://github.com/Quantsoft24/prism-analyst-platform.git
cd prism-analyst-platform
npm install
cp .env.example .env.local       # set NEXT_PUBLIC_API_URL if not localhost:8000
```

### Run
```bash
npm run dev
```

Open <http://localhost:3000/chat>.

### Landing page (separate dev server)
```bash
cd thequantsoft
npm install
node server.js
```

Open <http://localhost:4000>.

## Views

All feature views are URL routes under the `(workspace)/` route group (shared
shell — sidebar + topbar). Navigating is `router.push('/<view>')`; there is no
in-page view switcher.

| View       | What it does |
|------------|--------------|
| **Chat** (`/chat`, `/chat/[sessionId]`) | Ask screen → live agent stream via SSE. **Per-conversation URLs** with full context continuity on resume/refresh/deep-link. Conversation **search**, **pin/archive** + pagination, **Markdown export**. Per-answer **👍/👎 feedback**. Fenced-code **syntax highlighting** (`rehype-highlight`) + per-block copy. **Scroll-to-bottom** button, **"continue generating"** on truncated answers, **⌘K command palette**, and a **read-only public share link**. Tool-call timeline shows each `stock_filings_*` / `bmc_*` / `financials_query` call; inline citation popovers; stop+retry. `@bmc <name>` routes to Business Models. |
| **`/shared/[token]`** (public) | Read-only snapshot of a shared conversation. Lives **outside** the workspace shell (no sidebar/topbar/auth/ChatProvider) and is whitelisted in middleware, so the link works even if auth is forced on. |
| **Business Models** (`/bmc`) | 9-block Business Model Canvas as a **2D Osterwalder canvas** (light/dark, responsive) with a **version timeline**, **temporal diff** between versions, clickable **PDF citations**, and export. Click any `[n]` citation marker → evidence panel with the cited filing excerpt + drill-down chat. Proxied to the external `bmc` service. (A legacy `BMC3DExplorer` lingers but is not the headline view.) |
| **News & Sentiment** (`/news`) | Feed-first market-intelligence surface — all headlines by default; a company chips bar (track / remove / quick-pick) scopes the feed to tracked names with per-company sentiment cards + an inline "why is X moving?" investigation drawer. 20/page numbered pagination. Proxied to the external `prism-news` service. |
| **Stock Dashboard** (`/stocks`) | Search any NSE/BSE security → **Overview** section (interactive price chart: metric dropdown line↔candlestick, range filter 5D–MAX, crosshair tooltip, latest-values strip) and a stacked **Annual Financials** section (10-year Balance Sheet tree, standalone/consolidated toggle, Value/YoY%/common-size views, per-row "Ask PRISM"). Direct reads of the investment RDS via `/api/v1/stocks/*`. Income Statement + Cash Flow tabs present but disabled. |
| **Regulatory Lens** (`/regulatory`) | View over the read-only SEBI Postgres — regulatory filings/actions surface for Indian markets. |
| **Portfolio Builder** (`/portfolio`) | Institutional systematic-portfolio builder. Backtests are **durable jobs**: the API enqueues, the dedicated `worker` container runs them (if the worker is down, submitted backtests stay `queued`). |
| **Dashboard** (`/dashboard`) | Hero greeting, watchlist sparklines, activity feed (currently mock — wires to real telemetry in a later slice). |
| **Settings** (`/settings`) | Sections incl. **Tools & Capabilities** — lists registered integrations from `GET /api/v1/integrations` (`stock-chat · 3 tools`, `bmc · 6 tools`, `prism-financials · 1 tool`, `prism-news · 4 tools`) with per-firm enable/disable toggles. |
| **Account** (`/account`) | My Activity — recent runs / usage. |

## Keyboard Shortcuts

Only three shortcuts are wired at the workspace level (see
`useKeyboard(...)` in `src/app/(workspace)/layout.tsx`):

| Shortcut | Action                       |
|----------|------------------------------|
| ⌘K / Ctrl+K | Toggle the command palette (search + navigate) |
| ⌘N / Ctrl+N | New research (navigates to `/chat`) |
| Esc      | Close the command palette     |

## Environment Variables

⚠️ **Critical**: Next.js inlines `NEXT_PUBLIC_*` **statically at BUILD time**.
Setting them at runtime (e.g. via `docker-compose` `environment:`) has NO
effect on the bundled JS. The production setup passes them as `build.args`
in `docker-compose.prod.yml` → `ARG` + `ENV` in the `Dockerfile` builder
stage → `next build` sees them and inlines.

**The app actually reads only FOUR vars** (`src/lib/config.ts`):

| Var | Used for |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL (defaults to `http://localhost:8000`) |
| `NEXT_PUBLIC_AUTH_ENABLED` | Master auth switch — `"true"` turns on Supabase login + bearer token; otherwise dev-firm header, no login |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (needed when auth is on) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase **publishable** anon key — browser-safe, intentionally committed |

The legacy `NEXT_PUBLIC_LIVE_API`, `NEXT_PUBLIC_STREAMING`, `NEXT_PUBLIC_AUTH`,
`NEXT_PUBLIC_LANDING_URL`, and `NEXT_PUBLIC_PRISM_URL` are still threaded
through the Docker build args but are no longer read by `config.ts`.

> **Prod fact — auth is ON but login is NOT forced.** The prod build sets
> `NEXT_PUBLIC_AUTH_ENABLED="true"` with a real Supabase URL + publishable
> anon key, so the middleware wires up sessions. But `src/middleware.ts` has
> `REQUIRE_AUTH = false` — anonymous visitors browse everything; signing in
> just adds identity. `/sign-in`, `/sign-up`, `/auth`, and the public
> `/shared` snapshot are whitelisted (`PUBLIC_PREFIXES`).

### Local (`.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
# Leave auth off for local dev (dev-firm header, no login):
NEXT_PUBLIC_AUTH_ENABLED=false
# Only needed if you flip auth on locally:
# NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
# NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx
```

### Production (passed as build args in `docker-compose.prod.yml`)
```yaml
frontend:
  build:
    args:
      NEXT_PUBLIC_API_URL: https://api.thequantsoft.co.in
      NEXT_PUBLIC_AUTH_ENABLED: "true"
      NEXT_PUBLIC_SUPABASE_URL: https://<project>.supabase.co
      NEXT_PUBLIC_SUPABASE_ANON_KEY: sb_publishable_xxx   # publishable — safe to commit
      # legacy build args still passed but unused by config.ts:
      NEXT_PUBLIC_LANDING_URL: https://thequantsoft.co.in
      NEXT_PUBLIC_LIVE_API: "false"
      NEXT_PUBLIC_STREAMING: "false"
      NEXT_PUBLIC_AUTH: "false"
```

The Dockerfile's builder stage has matching `ARG`/`ENV` lines BEFORE
`RUN npm run build`. If you add a new `NEXT_PUBLIC_*` var, you MUST update
both files.

### Landing (`thequantsoft/.env`)
```env
PORT=4000
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
TARGET_EMAIL=hello@thequantsoft.co.in
PRISM_APP_URL=https://prism.thequantsoft.co.in
```

## Production Deployment

> **Full deployment guide:** [DEPLOYMENT.md](DEPLOYMENT.md) — covers every
> scenario (code changes, env var changes, secrets, migrations, rollback,
> hotfixes), all the gotchas we've already hit, and an honest assessment of
> where this setup is industry-standard vs where the gaps are.

### Branch model

`main` is trunk; `production` is the release pointer. Deploy fires ONLY on
`push: [production]`. CI runs on PR + push to either branch.

```bash
# After PR merged to main, CI green:
git fetch origin
git push origin main:production    # fast-forwards production → triggers deploy
```

### CI / CD

- **CI** (`.github/workflows/ci.yml`) — runs on PRs to `main` / `production`
  and pushes to either: `npm ci` → `npm run lint` → `tsc --noEmit`.
- **Deploy** (`.github/workflows/deploy.yml`) — SSH to EC2 → git pull
  production → `docker compose build --no-cache frontend` + `landing` →
  `docker compose up -d frontend landing nginx` → health checks. The
  backend repo's deploy also brings up the **worker** container (durable
  Portfolio-Builder backtests, reuses `prism-backend:latest`).

### One-time host setup (already done; for reference)

DNS A records pointing `thequantsoft.co.in`, `prism.thequantsoft.co.in`,
`api.thequantsoft.co.in` at the EC2 IP. SSL via Let's Encrypt / certbot
mounted into the nginx container. The two repos cloned side-by-side under
`~/PRISM/` so the frontend repo's `docker-compose.prod.yml` can build the
backend from the sibling directory.

### Verify after deploy
```bash
curl https://thequantsoft.co.in            # Landing
curl https://prism.thequantsoft.co.in      # Frontend (chat shell)
curl https://api.thequantsoft.co.in/health # Backend
```

In the browser, open DevTools → Network on `/chat` and confirm requests go
to `api.thequantsoft.co.in` (NOT `localhost:8000`). If they go to localhost,
the `NEXT_PUBLIC_API_URL` build arg wasn't picked up — re-check the compose
file and rebuild with `docker compose build --no-cache frontend`.

## License

Proprietary — © 2026 TheQuantSoft. All rights reserved.
