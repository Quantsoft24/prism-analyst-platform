# PRISM — AI Equity Research Platform

> **AI-powered equity research analyst for Indian markets.**
> Ask anything about companies, filings, sectors, or funds — with every figure cited and cross-checked.

## Architecture

```
thequantsoft.co.in       → Express.js landing page (:4000)
prism.thequantsoft.co.in → Next.js 15 frontend    (:3000)
api.thequantsoft.co.in   → FastAPI backend         (:8000)
```

All three services run on a single EC2 instance (`15.207.146.145`) via Docker Compose + Nginx reverse proxy.

## Tech Stack

| Layer     | Technology                                |
|-----------|-------------------------------------------|
| Frontend  | Next.js 15, React 19, TypeScript, CSS Modules |
| Backend   | FastAPI, Python 3.12, Google ADK          |
| Landing   | Express.js, React (CDN), Vanilla CSS      |
| Database  | PostgreSQL (AWS RDS)                      |
| Infra     | Docker, Nginx, GitHub Actions, EC2        |

## Design System (Lakshya)

| Token          | Value                          |
|----------------|--------------------------------|
| Display font   | Fraunces (serif, italic)       |
| Body font      | Inter Tight                    |
| Mono font      | JetBrains Mono                 |
| Accent         | `#8B6914` (gold)               |
| Background     | `#F0EDE6` (ivory)              |
| Elevated       | `#FAFAF5` (paper)              |

## Project Structure

```
prism-analyst-platform/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout + ToastProvider
│   │   ├── page.tsx                # Redirect → /chat
│   │   ├── chat/                   # Chat view (Ask + Agent simulation)
│   │   ├── dashboard/              # Dashboard (stats, watchlist, activity)
│   │   ├── reports/                # Reports Library (filter + grid)
│   │   └── settings/               # Settings (10 sections, tool toggles)
│   ├── components/                 # Shared: AppShell, Sidebar, Topbar, Toast, SearchModal, Skeleton
│   ├── hooks/                      # useChat, useTheme, useKeyboard
│   ├── lib/                        # mockData, api, config, utils
│   └── styles/                     # globals.css, fonts.ts
├── thequantsoft/                   # Landing page (Express app, as-is copy)
├── Dockerfile                      # Next.js standalone build
├── Dockerfile.landing              # Express landing page
├── docker-compose.prod.yml         # Production: 4 services
├── nginx.conf                      # Subdomain routing + SSL
└── package.json
```

## Local Development

### Prerequisites
- Node.js 20+
- npm 10+

### Setup
```bash
git clone https://github.com/Quantsoft24/prism-analyst-platform.git
cd prism-analyst-platform
npm install
```

### Run
```bash
npm run dev
```

Open [http://localhost:3000/chat](http://localhost:3000/chat)

### Landing page (separate)
```bash
cd thequantsoft
npm install
node server.js
```

Open [http://localhost:3000](http://localhost:3000)

## Production Deployment

### 1. DNS Records (GoDaddy)

| Type | Name  | Value            |
|------|-------|------------------|
| A    | @     | 15.207.146.145   |
| A    | prism | 15.207.146.145   |
| A    | api   | 15.207.146.145   |

### 2. SSL Certificates

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d thequantsoft.co.in \
  -d prism.thequantsoft.co.in \
  -d api.thequantsoft.co.in
```

### 3. Deploy

```bash
# SSH into EC2
ssh -i prism-analyst.pem ubuntu@15.207.146.145

# Clone repos
mkdir ~/PRISM && cd ~/PRISM
git clone https://github.com/Quantsoft24/prism-analyst-platform.git
git clone https://github.com/Quantsoft24/prism-analyst-services.git

# Create .env files
cp prism-analyst-platform/thequantsoft/.env.example prism-analyst-platform/thequantsoft/.env
cp prism-analyst-services/.env.example prism-analyst-services/.env
# Edit .env files with production values

# Build and start
cd prism-analyst-platform
docker compose -f docker-compose.prod.yml up -d --build
```

### 4. Verify

```bash
curl https://thequantsoft.co.in           # Landing page
curl https://prism.thequantsoft.co.in     # PRISM app
curl https://api.thequantsoft.co.in/health # Backend health
```

## Keyboard Shortcuts

| Shortcut | Action          |
|----------|-----------------|
| ⌘K       | Open search     |
| ⌘N       | New research    |
| ⌘1       | Dashboard       |
| ⌘2       | Research Chat   |
| ⌘3       | Reports Library |
| ⌘4       | Settings        |
| Esc      | Close modal     |

## Views

| View       | Features |
|------------|----------|
| Dashboard  | Hero greeting, 3 stat cards, 5-ticker watchlist with sparklines, activity feed, 15 tool chips |
| Chat       | Ask screen → agent simulation (thinking → tool calls → streaming answer → workspace) |
| Reports    | Category filters, 3-column tile grid, click → chat navigation |
| Settings   | 10 sections, 15 tool toggles, profile, data sources, model config |

## Environment Variables

```env
# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_LIVE_API=false
NEXT_PUBLIC_STREAMING=false
NEXT_PUBLIC_AUTH=false
NEXT_PUBLIC_LANDING_URL=http://localhost:4000

# Landing (thequantsoft/.env)
PORT=4000
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
TARGET_EMAIL=hello@thequantsoft.co.in
PRISM_APP_URL=https://prism.thequantsoft.co.in
```

## Phase 2 Roadmap

- [ ] Backend agent integration (Google ADK)
- [ ] Real-time filing ingestion pipeline
- [ ] SSE streaming for chat responses
- [ ] User authentication (JWT/OAuth)
- [ ] PostgreSQL data persistence
- [ ] Real market data APIs (NSE, BSE)

## License

Proprietary — © 2026 TheQuantSoft. All rights reserved.
