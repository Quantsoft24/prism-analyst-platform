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

All three services run on a single EC2 instance via Docker Compose + Nginx
reverse proxy. The frontend talks ONLY to PRISM's backend; the backend
fan-outs to external services (`bmc` :8012, `stock-chat` :8011,
`prism-financials` :8000, `prism-news` :8001), a shared read-only catalog
Postgres, and a read-only investment RDS (Stock Dashboard data).

## Tech Stack

| Layer     | Technology                                |
|-----------|-------------------------------------------|
| Frontend  | Next.js 15 (App Router), React 19, TypeScript, CSS Modules |
| State     | TanStack React Query                      |
| 3D viz    | `react-force-graph-3d` + `three` (BMC)    |
| Charts    | `lightweight-charts` (TradingView — Stock Dashboard line/candlestick) |
| Backend   | FastAPI, Python 3.12, Google ADK 1.33+    |
| Landing   | Express.js, React (CDN), Vanilla CSS      |
| Database  | PostgreSQL (primary) + read-only catalog + read-only investment (RDS) |
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
│   ├── app/
│   │   ├── layout.tsx              Root layout + ToastProvider
│   │   ├── page.tsx                Redirect → /chat
│   │   ├── chat/                   Chat shell — Ask screen + live agent stream
│   │   ├── dashboard/              Dashboard view
│   │   ├── companies/              Companies catalog view (4,773 entries)
│   │   ├── bmc/                    Business Model Canvas — 2D grid + 3D explorer
│   │   │   └── components/         BMCView, BMCBlock, BMCEvidencePanel, BMC3DExplorer
│   │   ├── news/                   News & Sentiment — feed-first, company chips
│   │   │   └── components/         NewsView, NewsFeed, WatchlistPulse, InvestigationDrawer
│   │   ├── stocks/                 Stock Dashboard — search + price chart + financials
│   │   │   └── components/         StockDashboardView, SecuritySearch, PriceChart,
│   │   │                          MetricDropdown, LatestStrip, AnnualFinancials,
│   │   │                          BalanceSheetTable
│   │   └── settings/               Settings — incl. Tools & Capabilities (real registry)
│   ├── components/                 AppShell, Sidebar, Topbar, Toast, SearchModal
│   ├── hooks/                      useChat, useTheme, useKeyboard
│   ├── lib/
│   │   ├── api/                    Typed API clients + React Query hooks
│   │   │   ├── client.ts           Base fetch wrapper (X-Dev-Firm header)
│   │   │   ├── bmc.ts              BMC types + hooks (proxied via PRISM)
│   │   │   ├── companies.ts        Companies catalog hooks
│   │   │   ├── news.ts             News & sentiment hooks (proxied via PRISM)
│   │   │   ├── stocks.ts           Stock Dashboard hooks (securities, prices,
│   │   │   │                       balance-sheet) + in-memory search + formatters
│   │   │   ├── chat.ts             Chat SSE stream client
│   │   │   └── integrations.ts     Settings → Tools & Capabilities
│   │   ├── config.ts               Reads NEXT_PUBLIC_API_URL (build-time!)
│   │   ├── mockData.ts             Sidebar nav, intent routing, settings scaffold
│   │   └── utils.ts                cn(), small helpers
│   └── styles/                     globals.css (tokens), tailwind.css (legacy)
├── thequantsoft/                   Landing page (Express + React CDN)
├── Dockerfile                      Next.js standalone build (uses build args)
├── Dockerfile.landing              Express landing page
├── docker-compose.prod.yml         Production: landing + frontend + backend + nginx
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

| View       | What it does |
|------------|--------------|
| **Chat**       | Ask screen → live agent stream via SSE. Tool-call timeline shows each `stock_filings_*` / `bmc_*` / `financials_query` call. Markdown rendering, inline citation popovers, copy-to-clipboard, and a stop+retry control. `@bmc <name>` routes to the BMC view. |
| **BMC**        | 9-block Business Model Canvas in a 2D grid (primary) + a 3D explorer toggle (energy-core force graph). Click any `[n]` citation marker → side panel with the cited filing excerpt + drill-down chat. PDF / JSON export. Proxied to the external `bmc` service. |
| **Companies** | Paginated list of the 4,773-row Indian markets catalog (search by name/code, filter by industry). Backed by the catalog Postgres read-only. |
| **News & Sentiment** | Feed-first market-intelligence surface — all headlines by default; a company chips bar (track / remove / quick-pick) scopes the feed to tracked names with per-company sentiment cards + an inline "why is X moving?" investigation drawer. 20/page numbered pagination. Proxied to the external `prism-news` service. |
| **Stock Dashboard** | Search any NSE/BSE security → **Overview** section (interactive price chart: metric dropdown line↔candlestick, range filter 5D–MAX, crosshair tooltip, latest-values strip) and a stacked **Annual Financials** section (10-year Balance Sheet tree, standalone/consolidated toggle, Value/YoY%/common-size views, per-row "Ask PRISM"). Direct reads of the investment RDS via `/api/v1/stocks/*`. Income Statement + Cash Flow tabs present but disabled. |
| **Dashboard**  | Hero greeting, watchlist sparklines, activity feed (currently mock — wires to real telemetry in a later slice). |
| **Settings**   | 10 sections incl. **Tools & Capabilities** — lists registered integrations from `GET /api/v1/integrations` (`stock-chat · 3 tools`, `bmc · 6 tools`, `prism-financials · 1 tool`) with per-firm enable/disable toggles. |

## Keyboard Shortcuts

| Shortcut | Action                       |
|----------|------------------------------|
| ⌘K       | Open search                  |
| ⌘N       | New research                 |
| ⌘B       | Toggle collapsed sidebar     |
| ⌘1       | Dashboard                    |
| ⌘2       | Research Chat                |
| ⌘3       | Settings                     |
| Esc      | Close modal                  |

## Environment Variables

⚠️ **Critical**: Next.js inlines `NEXT_PUBLIC_*` **statically at BUILD time**.
Setting them at runtime (e.g. via `docker-compose` `environment:`) has NO
effect on the bundled JS. The production setup passes them as `build.args`
in `docker-compose.prod.yml` → `ARG` + `ENV` in the `Dockerfile` builder
stage → `next build` sees them and inlines.

### Local (`.env.local`)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_LANDING_URL=http://localhost:4000
NEXT_PUBLIC_LIVE_API=false
NEXT_PUBLIC_STREAMING=false
NEXT_PUBLIC_AUTH=false
```

### Production (passed as build args in `docker-compose.prod.yml`)
```yaml
frontend:
  build:
    args:
      NEXT_PUBLIC_API_URL: https://api.thequantsoft.co.in
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
  `docker compose up -d frontend landing nginx` → health checks.

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
