# PRISM Deployment Guide

Single source of truth for deploying PRISM to production. Covers both repos
(`prism-analyst-platform`, `prism-analyst-services`), every common scenario,
and the gotchas we've already hit so we don't hit them again.

---

## Quick reference

| I want to... | Do this |
|---|---|
| Ship a code change (typical) | Open PR into `main` → review → merge as **merge commit** → open PR `main → production` → merge as **merge commit**. Auto-deploys on push to `production`. |
| Change a backend env var (e.g. `BMC_URL`) | SSH to EC2, edit `~/PRISM/prism-analyst-services/.env`, then `docker compose ... up -d --force-recreate backend` (NOT `restart` — see Scenario 2). |
| Change a frontend `NEXT_PUBLIC_*` var | Edit `docker-compose.prod.yml` `frontend.build.args` block, commit, deploy through git (build-time inlined). |
| Add a new third-party API key | Add to `.env` on EC2 + add the setting to `src/config.py` + push the config change through git. |
| Rollback | `docker tag` of the previous image + `docker compose up -d <service>` on EC2 — see [Rollback](#rollback). |
| Apply a database migration | Already automatic — backend deploy runs `alembic upgrade head` after the new image is up. |
| Apply an emergency hotfix | Edit on EC2 + restart **and** push the same change through git in the same session — see [Hotfix protocol](#emergency-hotfix-protocol). |

---

## Release-readiness for this deploy (chat features + auth + worker)

Before promoting this release to `production`, confirm:

1. **Backend migrations.** Backend migration head must reach **`0019_chat_share`**.
   The frontend chat features **pin/archive, 👍/👎 feedback, and share** return
   **500/404** without migrations `0017_chat_pin_archive`, `0018_message_feedback`,
   `0019_chat_share`. The backend deploy auto-runs `alembic upgrade head`, so a
   normal backend deploy applies them — but call it out because these are a
   **cross-repo dependency** (frontend ships the UI; the backend must ship the
   schema). Verify after deploy:
   ```bash
   ssh -i ~/.ssh/prism-analyst.pem ubuntu@15.207.146.145 \
     "docker exec prism-backend alembic current"   # expect 0019_chat_share
   ```
   ⚠️ **One-time caution:** a reverted Phase-7 `0019_agent_run_parent` was deleted
   and the DB cleaned back to `0018` before the new `0019_chat_share` was added.
   If any database ever saw the old `0019_agent_run_parent`, reconcile the alembic
   chain (stamp/down to `0018`) before upgrading, or `alembic upgrade head` will
   fail on the divergent revision.

2. **Worker is up.** The 5th container (`prism-worker`) must be running, or
   Portfolio-Builder backtests stay `queued` forever (see the troubleshooting
   note below). It reuses `prism-backend:latest`.

3. **Frontend auth build args.** The prod frontend now builds with auth ON —
   see [Scenario 3](#scenario-3--change-a-frontend-next_public_-var). Auth is
   enabled but login is **not forced** (`REQUIRE_AUTH=false` in
   `src/middleware.ts`); anonymous visitors browse freely.

4. **Public share surface.** `/shared/[token]` is externally reachable and
   bypasses auth (in middleware `PUBLIC_PREFIXES`) — include it in smoke tests.

---

## Architecture overview

**Five containers** on a single EC2 host (`ubuntu@15.207.146.145`),
orchestrated by `docker-compose.prod.yml` in this repo: landing, frontend,
backend, **worker** (durable Portfolio-Builder backtests — no ports, reuses the
backend image), and nginx.

```
                  Internet (443)
                       │
                  ┌────▼─────┐
                  │  nginx   │   nginx.conf in this repo (bind-mounted)
                  │  :80/443 │   SSL via Let's Encrypt (host /etc/letsencrypt)
                  └──┬───┬─┬─┘
        ┌────────────┘   │ └───────────────┐
        │ thequantsoft   │ prism.          │ api.
        │ .co.in         │ thequantsoft    │ thequantsoft
        │                │ .co.in          │ .co.in
   ┌────▼────┐      ┌────▼─────┐     ┌─────▼────┐      ┌──────────┐
   │ landing │      │ frontend │     │ backend  │      │  worker  │
   │ :4000   │      │ :3000    │     │ :8000    │      │ (no port)│
   │ Node    │      │ Next.js  │     │ FastAPI  │      │ backtests│
   └─────────┘      └──────────┘     └────┬─────┘      └────┬─────┘
                                          │                 │
                            ┌─────────────┼─────────┐       │ same image
                            │             │         │       │ (prism-backend:latest),
                      ┌─────▼─────┐  ┌─────▼────┐ ┌──▼─────┐ │ entrypoint
                      │ primary   │  │ invest.  │ │ SEBI   │◄┘ python -m
                      │ Postgres  │  │ RDS (RO) │ │ PG (RO)│   src.portfolio.worker
                      │ (PRISM-   │  │ Stock    │ │ Reg.   │
                      │  owned)   │  │ Dashbd   │ │ Lens   │
                      └───────────┘  └──────────┘ └────────┘
   external (teammate's VM): stock-chat :8011 · bmc :8012 ·
                             prism-financials :8000 · prism-news :8001
```

- **Two repos:** `prism-analyst-platform` (UI + landing + nginx + compose) and
  `prism-analyst-services` (FastAPI backend + Alembic).
- **The compose file orchestrates both** — backend build context is
  `../prism-analyst-services`. On EC2, both repos are cloned side-by-side
  under `~/PRISM/`.
- **The `worker` container** reuses `prism-backend:latest` (no separate build,
  no ports) and runs `python -m src.portfolio.worker`. It claims and runs
  Portfolio-Builder backtests; the API only enqueues them. **If the worker is
  down, submitted backtests stay `queued` forever.** It is restart-safe
  (reclaims stale RUNNING jobs on startup, claims with `FOR UPDATE SKIP LOCKED`).
- **Databases:** primary Postgres (PRISM-owned, the app + job queue), a
  read-only investment RDS (Stock Dashboard), and a read-only SEBI Postgres
  (Regulatory Lens). The old read-only company **catalog DB is retired** —
  company lookups now resolve via `master_securities`.
- **External services** (`stock-chat`, `bmc`, `prism-financials`, `prism-news`)
  live on a different VM and are owned by a teammate — we don't deploy them.

---

## Branch model and what triggers automatic deploys

Both repos use the same two-branch model:

| Branch | Role |
|---|---|
| `main` | Trunk. All feature work merges here via PR. CI runs on every PR + push. |
| `production` | Release pointer. Pushing here triggers the deploy workflow. |

**Triggers:**

| Event | What fires |
|---|---|
| Push or PR to `main` | CI (`ci.yml`) — lint, typecheck, tests |
| PR opened against `production` | CI runs |
| Push to `production` | Deploy (`deploy.yml`) — SSH to EC2, sync, build, restart |

**Releasing is just:** open `main → production` PR → merge it. The push to
`production` that the merge produces fires the deploy. No manual SSH needed
in the happy path.

**Always use "Create a merge commit" — never "Squash and merge" — for the
`main → production` hop.** Squash-merging creates a new commit on production
with a SHA that doesn't exist on main; main and production then "diverge"
history-wise even though their content is identical, and the next sync PR
shows dozens of phantom file changes with phantom conflicts. We hit this
twice already; the workaround is messy (`branch off production, merge main
with -X theirs`). Just don't squash main → production. Squash is fine for
feature → main.

---

## Scenarios

### Scenario 1 — Ship a code change (the typical case)

Both repos behave the same way.

1. Branch off `main`, do your work, push:
   ```bash
   git checkout -b feat/whatever
   # ... edits ...
   git commit -am "feat: whatever"
   git push -u origin feat/whatever
   ```
2. Open PR `feat/whatever → main`. CI runs. Merge when green.
   - For feature PRs into `main`: squash-merge is fine.
3. Open PR `main → production`. Wait for CI. Merge — **must be merge
   commit**, not squash.
4. The push to `production` fires `deploy.yml`. Watch the run in the Actions
   tab; it finishes in ~3–5 minutes (backend) or ~2 minutes (frontend).
5. Verify (see [Smoke tests](#smoke-tests)).

That's it for the happy path. If the deploy fails, see
[Recovering from a failed deploy](#recovering-from-a-failed-deploy).

### Scenario 2 — Change a backend env var

The backend reads `~/PRISM/prism-analyst-services/.env` on the EC2 host
via the `env_file:` directive in `docker-compose.prod.yml`. The file is
**not in git** (`.gitignore`) and lives only on the host.

**To add or update a var:**

```bash
# SSH into the EC2 host
ssh -i ~/.ssh/prism-analyst.pem ubuntu@15.207.146.145

# Edit the file
nano ~/PRISM/prism-analyst-services/.env
# add or change a line, e.g.  TAVILY_API_KEY=tvly-xxx

# Re-create the backend so it picks up the new .env. Use --force-recreate,
# NOT `restart`: with env_file:, Compose injects vars at CONTAINER CREATE time,
# so `restart` keeps the OLD environment. --force-recreate rebuilds the
# container with the new values.
cd ~/PRISM/prism-analyst-platform
docker compose -f docker-compose.prod.yml up -d --force-recreate backend

# Verify the var landed inside the container, then health
docker compose -f docker-compose.prod.yml exec backend printenv | grep -i <VAR>
docker compose -f docker-compose.prod.yml logs backend --tail 20
curl https://api.thequantsoft.co.in/health
```

**If the new var is a new setting in code:** also add it to
`prism-analyst-services/src/config.py` (the `Settings` class), push that
change through the normal PR flow. Pydantic Settings has `extra="ignore"`,
so unknown vars in `.env` are harmless, but a setting that's read by code
must be declared.

**Important:** the `.env` file on EC2 is the only copy. Keep an
out-of-band record (a password manager entry, a private repo, etc.) of its
current contents. If the EC2 instance is replaced, you re-create the file
from that record.

**Feature env-var dependencies** (each degrades gracefully if unset — the
relevant routes 503, the rest of the app is fine):

| Feature | Backend `.env` vars | Other |
|---|---|---|
| News & Sentiment (`/api/v1/news/*`) | `PRISM_NEWS_URL` | the GCP VM's :8001 firewall must allow the EC2 IP |
| Stock Dashboard (`/api/v1/stocks/*`) | `INVESTMENT_DB_HOST/PORT/NAME/USER/PASSWORD`, `INVESTMENT_DB_SSL_MODE=require` | the **investment RDS security group must allow the EC2 IP** (15.207.146.145), else connect-timeout |
| Regulatory Lens (`/api/v1/regulatory/*`) | SEBI Postgres connection vars (read-only) | SEBI Postgres reachable from the EC2 IP |
| Portfolio Builder backtests | primary DB (job queue) + investment RDS (prices) | the **`worker` container must be running** — same `.env`; else jobs stay `queued` |

> **Catalog retired.** The old read-only company catalog DB (`CATALOG_DATABASE_URL`)
> is gone — company lookups now resolve via `master_securities` on existing DBs.
> Don't re-introduce a catalog box when reasoning about downstream connectivity.

After adding any of these, re-create the backend (`up -d --force-recreate
backend`) and confirm via `printenv` + a request to the feature's endpoint.

### Scenario 3 — Change a frontend `NEXT_PUBLIC_*` var

This one bit us during deployment and needs its own scenario because
Next.js handles env vars differently from a normal server.

**Next.js inlines `NEXT_PUBLIC_*` vars into the JavaScript bundle at BUILD
time, not runtime.** Setting them in `environment:` block of compose
(which is runtime container env) has no effect — `next build` already
finished and the bundle already contains whatever value the build saw.

**To change one:**

1. Edit `docker-compose.prod.yml`, `frontend.build.args` block:
   ```yaml
   frontend:
     build:
       context: .
       dockerfile: Dockerfile
       args:
         NEXT_PUBLIC_API_URL: https://api.thequantsoft.co.in
         # Auth is ON in prod (Supabase). The anon key is the PUBLISHABLE key —
         # public by design (it ships in the browser bundle), safe to commit here.
         # The server-side JWT secret never lives in build args.
         NEXT_PUBLIC_AUTH_ENABLED: "true"
         NEXT_PUBLIC_SUPABASE_URL: https://<project>.supabase.co
         NEXT_PUBLIC_SUPABASE_ANON_KEY: sb_publishable_xxx
         # legacy args still passed but no longer read by src/lib/config.ts:
         NEXT_PUBLIC_LANDING_URL: https://thequantsoft.co.in
         # ... add or change here ...
   ```
   The app's `src/lib/config.ts` reads only four `NEXT_PUBLIC_*` vars:
   `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_AUTH_ENABLED`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Auth being ON does **not** force login —
   `REQUIRE_AUTH=false` in `src/middleware.ts` lets anonymous users browse; the
   `/shared` share-link route is whitelisted regardless.
2. If adding a new var, also accept it in `Dockerfile`'s builder stage:
   ```dockerfile
   ARG NEXT_PUBLIC_NEW_THING
   ENV NEXT_PUBLIC_NEW_THING=${NEXT_PUBLIC_NEW_THING}
   ```
3. Commit + push through the PR flow. The deploy rebuilds the frontend
   image, which re-runs `next build` with the new arg, which inlines the
   new value.

**Verify after deploy** the bundle contains the right value:
```bash
ssh -i ~/.ssh/prism-analyst.pem ubuntu@15.207.146.145 \
  "docker exec prism-frontend grep -roE 'https?://[^\"]+' .next/static/chunks/ | grep api.thequantsoft" | head -3
```

### Scenario 4 — Add a new secret (API key, etc.)

Treat secrets like any other backend env var (Scenario 2). On top of that:

- Add a placeholder to `.env.example` (in git): `NEW_API_KEY=`. Never the
  real value.
- Add the setting to `src/config.py`.
- Document what it's for in the setting's docstring.
- Record the real value in a password manager (1Password, Bitwarden, etc.)
  shared with the team.
- Set the real value in `.env` on EC2 (Scenario 2).

**Never commit the real value to git, not even briefly.** Git history is
forever — once it's pushed it's compromised. If a secret leaks, rotate it
immediately (revoke at the provider, generate a new one, update on EC2).

### Scenario 5 — Database migrations

Backend Alembic migrations live in
`prism-analyst-services/alembic/versions/`. Authoring:

```bash
# In prism-analyst-services/, with .venv active and DATABASE_URL set:
alembic revision --autogenerate -m "describe the change"
# Review the generated file in alembic/versions/ — autogenerate isn't perfect.
alembic upgrade head  # test locally
```

Commit the migration file. Push through the normal PR flow.

**On deploy, the backend `deploy.yml` runs `alembic upgrade head`
automatically** after the new container is up. You don't need to do
anything. To verify on EC2:

```bash
ssh -i ~/.ssh/prism-analyst.pem ubuntu@15.207.146.145 \
  "docker exec prism-backend alembic current"
```

**Migration safety rules** (because rolling back a migration in prod is
painful):

- **Additive migrations are safe** (new tables, new nullable columns).
- **Destructive migrations need care.** Dropping a column or table while
  the running code still references it = 500s for the duration of the
  deploy. Mitigation: deploy the code change that stops using the column
  first; then a separate deploy with the drop migration.
- **Renames are dangerous.** Express renames as add-new + backfill + drop-old
  across multiple deploys.
- **Long migrations block startup.** If a migration takes > 30s on prod
  data, run it manually during a maintenance window instead of letting
  deploy.yml run it.

### Scenario 6 — Rollback

The deploy workflow doesn't tag previous images, so rollback is currently
manual. **Before the deploy that introduces the risky change:**

```bash
# Tag the running image as :previous
ssh -i ~/.ssh/prism-analyst.pem ubuntu@15.207.146.145 \
  "docker tag prism-analyst-platform-frontend:latest prism-analyst-platform-frontend:previous"
```

(Same for backend / landing.) If the new deploy breaks something:

```bash
# Re-tag :previous as :latest and restart
ssh -i ~/.ssh/prism-analyst.pem ubuntu@15.207.146.145 << 'EOF'
  cd ~/PRISM/prism-analyst-platform
  docker tag prism-analyst-platform-frontend:previous prism-analyst-platform-frontend:latest
  docker compose -f docker-compose.prod.yml up -d --no-build frontend
EOF
```

**For schema rollback** — generally don't. Migrations should be
forward-compatible. If the new code is broken but the migration applied
cleanly, roll back code only and patch forward.

This is one of the recommended improvements (see [Gaps](#gaps-from-true-industry-standard)).
The automated version would tag :previous in deploy.yml before the build
and auto-restart it on health-check failure.

### Scenario 7 — Recovering from a failed deploy

If the deploy workflow fails midway, the EC2 state can end up
inconsistent. Common failures and recovery:

**`error: Your local changes to the following files would be overwritten by merge`**

Someone (or a previous hotfix) edited a file directly on EC2 outside git.
The deploy workflow now hard-resets to `origin/production` so this
shouldn't happen anymore. If it does on an old workflow:

```bash
ssh -i ~/.ssh/prism-analyst.pem ubuntu@15.207.146.145
cd ~/PRISM/prism-analyst-platform   # or prism-analyst-services
git status                          # see what's modified
git checkout .                      # discard ALL local changes
# Then re-trigger the deploy.
```

**Build fails (out-of-memory, npm install errors, etc.)**

```bash
ssh ... "docker system df"          # check disk
ssh ... "docker system prune -af"   # nuke unused images/layers
# Re-trigger the deploy.
```

**Health check fails after restart**

```bash
ssh ...
cd ~/PRISM/prism-analyst-platform
docker compose -f docker-compose.prod.yml logs backend --tail 100
# or frontend, landing, nginx — pick the unhealthy one
```

Common causes: env var typo in `.env`, missing migration, downstream
service unreachable, port conflict.

**Re-triggering a deploy without changing code:**

```bash
# From your laptop, on a maintainer-clone:
git checkout production
git pull
git commit --allow-empty -m "chore: re-trigger deploy"
git push origin production
```

### Scenario 8 — Emergency hotfix protocol

When something is broken in prod and the normal PR flow is too slow.

**Rules:**

1. **Hotfix on EC2 + push the same fix to git in the same session.** The
   deploy workflow hard-resets to `origin/production`, so any uncommitted
   edit on EC2 will be silently reverted by the next deploy. The git copy
   is the source of truth.
2. **Branch off `production`, not `main`.** You'll PR back to `production`
   directly; then cherry-pick to `main` separately.
3. **Open an incident note** (Slack message, Linear ticket, whatever) — so
   the team knows we deviated from the normal flow.

**The flow:**

```bash
# Step 1: SSH and apply the fix on EC2 to unblock
ssh -i ~/.ssh/prism-analyst.pem ubuntu@15.207.146.145
cd ~/PRISM/prism-analyst-platform   # or services
# ... edit the file ...
docker compose -f docker-compose.prod.yml restart <service>
# Verify the issue is gone.
exit

# Step 2: Make the same fix locally on a branch off production
git fetch origin
git checkout -b hotfix/short-name origin/production
# ... apply the same edit ...
git commit -am "hotfix: short-name"
git push -u origin hotfix/short-name

# Step 3: PR straight into production (skipping main)
# Open it on GitHub; merge as merge commit.
# Deploy fires; hard-resets EC2 to the git version of your fix.

# Step 4: Cherry-pick the same commit onto main so they don't diverge
git checkout main
git pull
git cherry-pick <commit-sha>
git push
# Or open the cherry-pick as a PR if main needs CI gating.
```

**If you skip step 4**, the next `main → production` PR will re-introduce
the bug (because main is the trunk and doesn't have the fix yet).

### Scenario 9 — Adding or replacing a service

If you add a new container (e.g. a worker, a redis), or replace an
existing one:

1. Add the service to `docker-compose.prod.yml`.
2. Add an nginx server block in `nginx.conf` if it needs to be exposed
   under a subdomain.
3. If a new subdomain, get a Let's Encrypt cert on EC2:
   ```bash
   ssh ... "sudo certbot --nginx -d new.thequantsoft.co.in"
   ```
4. Deploy through the normal PR flow.

---

## How automatic deploy works (the contract)

Both `deploy.yml` files do roughly the same thing:

1. Triggered by `push: [production]`.
2. SSH into EC2 via `appleboy/ssh-action`.
3. `cd ~/PRISM/<repo>` and `git fetch + reset --hard + clean -fd` to match
   `origin/production`. This is the hardened step — see [Gotcha 2](#gotcha-2--local-edits-on-ec2-block-deploys).
4. `docker compose build --no-cache <service>` (the affected one only).
5. `docker compose up -d <service>` to recreate.
6. `sleep` to let the container boot.
7. `curl http://localhost:<port>/<healthcheck>` to verify.
8. (Backend only) `docker compose exec backend alembic upgrade head`.
9. `docker image prune -f` to free disk.

**The `worker` shares the backend image.** `worker` has no `build:` of its own —
it runs `prism-backend:latest` (tagged by the `backend` service build) with a
different entrypoint. So a backend deploy that rebuilds the image should also
recreate the worker: `docker compose -f docker-compose.prod.yml up -d worker`.
A backend rollback (re-tag `:previous` → `:latest`) implicitly covers the
worker too — just re-`up -d worker` afterwards so it picks up the rolled-back
image.

**Concurrency:** both workflows declare `concurrency.group:` so two pushes
to production never deploy simultaneously. The second push waits for the
first to finish. Do not remove this — concurrent deploys can corrupt
images mid-build.

**Timeout:** 15 minutes per deploy. If yours runs longer, something is
wrong (probably a network hang downloading base images).

---

## Smoke tests

After any deploy, verify:

```bash
# 1. API health
curl https://api.thequantsoft.co.in/health
# Expected: {"status":"ok","service":"prism-analyst-services","version":"0.1.0"}

# 2. Frontend renders
curl -sI https://prism.thequantsoft.co.in/chat | head -1
# Expected: HTTP/1.1 200 OK

# 3. Landing renders
curl -sI https://thequantsoft.co.in | head -1
# Expected: HTTP/1.1 200 OK

# 3b. Public share page is reachable WITHOUT auth (it's in middleware
#     PUBLIC_PREFIXES; nginx serves it transparently under prism. → frontend).
#     Use a real shared token, or just confirm the route resolves (not a 404
#     from the proxy). An invalid token returns the page's own "not found" UI.
curl -sI "https://prism.thequantsoft.co.in/shared/<token>" | head -1
# Expected: HTTP/1.1 200 OK  (NOT redirected to /sign-in)

# 3c. Worker is running (else Portfolio-Builder backtests stay `queued`)
ssh -i ~/.ssh/prism-analyst.pem ubuntu@15.207.146.145 \
  "docker ps --filter name=prism-worker --format '{{.Names}} {{.Status}}'"
# Expected: prism-worker  Up ...

# 4. CORS preflight (after any nginx or main.py CORS change)
# Use any live endpoint — this tests the CORS middleware, not the route itself.
# (The old /api/v1/companies catalog endpoint is retired; use /api/v1/integrations.)
curl -sI -X OPTIONS https://api.thequantsoft.co.in/api/v1/integrations \
  -H 'Origin: https://prism.thequantsoft.co.in' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: x-dev-firm,content-type' | grep -i 'access-control'
# Expected: ONE access-control-allow-origin: https://prism.thequantsoft.co.in line
# (NOT two — see Gotcha 3)

# 5. Browser-side: hard refresh, DevTools open, hit a few pages.
```

---

## Gotchas (we've hit all of these)

### Gotcha 1 — Squash-merging `main → production` causes divergence

When you squash-merge a PR into `production`, GitHub creates one new
commit with a new SHA. The original commits on `main` are unrelated to
this new commit. The next `main → production` PR walks commits, sees the
"missing" ones on `production`, tries to merge them again — hitting
phantom conflicts on files that are already in sync.

**Fix:** always use "Create a merge commit" (not "Squash") for the
`main → production` hop.

If it's already happened: branch off `production`, merge `main` with
`-X theirs` (= main wins on conflicts), PR that branch into `production`.

### Gotcha 2 — Local edits on EC2 block deploys

The OLD `deploy.yml` ran `git pull`. `git pull` aborts the moment the
working tree has any uncommitted edit (e.g. from a `sed -i` or `scp`
hotfix done directly on EC2). Result: deploy fails with
`error: Your local changes to the following files would be overwritten by merge`.

**Fix (already applied):** `deploy.yml` now does
`git fetch + reset --hard + clean -fd` instead of `git pull`. The EC2
working tree is treated as a deploy artifact — whatever is on disk yields
to what's in git.

**Side effect:** if you make a hotfix on EC2 and DON'T push the same fix
to git, the next deploy silently reverts it. See [Hotfix protocol](#scenario-8--emergency-hotfix-protocol).

### Gotcha 3 — Duplicate CORS headers from two layers

The OLD nginx.conf added `Access-Control-Allow-Origin` headers in the
`api.thequantsoft.co.in` server block. FastAPI's `CORSMiddleware` was
also adding them. The browser receives two `ACAO` values and rejects the
response — `fetch()` throws "Failed to fetch" even though the HTTP status
is 200.

**Fix (already applied):** nginx no longer adds CORS headers; FastAPI
handles CORS exclusively, including OPTIONS preflight.

**Rule going forward:** CORS lives in ONE place. The backend is
self-sufficient — it should work without nginx wrapping it. If you need
to add a CORS-related header, do it in `src/main.py`'s middleware setup,
not in nginx.

### Gotcha 4 — `NEXT_PUBLIC_*` set as runtime env has no effect

Setting `NEXT_PUBLIC_API_URL` in compose's `environment:` block didn't
work — the bundle was already built and contained the default
`http://localhost:8000`. **Fix:** these MUST go in `build.args:` and be
accepted in the Dockerfile as `ARG`/`ENV` BEFORE `RUN npm run build`. See
[Scenario 3](#scenario-3--change-a-frontend-next_public_-var).

### Gotcha 5 — `pgvector` removal breaks Alembic

Removing `pgvector` from `pyproject.toml` while historical migrations
still `import pgvector.sqlalchemy.Vector` makes alembic crash at startup
with `ModuleNotFoundError` — because alembic imports every migration
module to build the chain.

**Fix (already applied):** `pgvector>=0.3.6` is back in deps even though
runtime code no longer uses it. The clean long-term fix is to squash
historical migrations and drop the dep — left as a follow-up.

### Gotcha 6 — Browsers cache failed CORS preflight for 24 hours

`Access-Control-Max-Age: 86400` means a browser that saw a broken
preflight will keep using the cached failure for up to a day, even after
you fix the server.

**After any CORS-affecting fix:** hard refresh (Ctrl+Shift+R) or
incognito. If users report it's still broken, walk them through clearing
site data for `prism.thequantsoft.co.in`.

### Gotcha 7 — Portfolio-Builder backtests stuck `queued` → the worker is down

Portfolio-Builder backtests run in the **`worker` container** (`prism-worker`),
not the web process — the API only enqueues them into `pb_backtests`. If
submitted backtests never start (stay `queued`), the worker is almost certainly
down or never came up after a deploy (it has `depends_on: backend`, but a
backend that failed its health check can leave the worker un-started).

```bash
ssh -i ~/.ssh/prism-analyst.pem ubuntu@15.207.146.145
docker ps -a --filter name=prism-worker            # is it Up?
cd ~/PRISM/prism-analyst-platform
docker compose -f docker-compose.prod.yml logs worker --tail 100
docker compose -f docker-compose.prod.yml up -d worker   # (re)start it
```

The worker is restart-safe: it reclaims stale RUNNING jobs on startup and
claims work with `FOR UPDATE SKIP LOCKED`, so restarting it (or running
replicas) won't double-run a backtest. Because it shares `prism-backend:latest`,
it never needs its own build — if the image is current, `up -d worker` is enough.

---

## Gaps from true industry standard

The current setup is fine for a 4-person team shipping to one EC2 box. As
the team grows or stakes go up, the following gaps matter. None of these
block today's work — they're the next-step roadmap.

### Gap 1 — Build happens on EC2

Today: GitHub Actions SSHs into EC2 and runs `docker compose build` there.

**Industry standard:** build in CI, push the image to a registry (ECR,
Docker Hub), then EC2 just `docker pull`s and restarts. Reasons: builds
don't compete with running services for CPU/RAM; deploys are faster (pull
+ restart vs build); images are immutable artifacts you can roll back to.

When to fix: when builds start taking > 5 minutes or when you have
multiple environments (staging + prod) sharing build artifacts.

### Gap 2 — No staging environment

Today: changes go straight from `main` → `production`.

**Industry standard:** at least one pre-prod env that mirrors prod, fed
by `main`. You verify there before promoting to prod.

When to fix: when a single broken deploy starts costing you real money or
real users.

### Gap 3 — Secrets in a plaintext `.env` on the host

Today: `~/PRISM/prism-analyst-services/.env` on EC2, manually placed.

**Industry standard:** AWS Secrets Manager or SSM Parameter Store, mapped
to env at container start via a sidecar or the entrypoint script. Audit
logs, rotation, no secrets in shell history.

When to fix: when SOC2 / compliance enters the conversation, or when the
team grows past the point where everyone can be trusted with the same
flat file.

### Gap 4 — No automatic rollback on health-check failure

Today: if the new container fails its post-restart health check, the
deploy workflow exits 1 but the broken `:latest` is already running.
Recovery is manual.

**Industry standard:** tag the running image as `:previous` before pull,
restart `:previous` if health check fails. Even better: blue/green with
two compose stacks and an nginx upstream switch.

When to fix: after the first incident where a bad deploy costs more than
a few minutes of downtime.

### Gap 5 — No structured logging or APM

Today: `docker compose logs` is all we have. Errors visible only if you
SSH and grep.

**Industry standard:** ship logs to a centralized service (Logtail,
CloudWatch, Datadog) with structured JSON. Sentry for exceptions. A
dashboard with request rates, latency p95, error rates.

When to fix: as soon as the team grows past "everyone watching the same
terminal" — usually around the 6-person mark.

### Gap 6 — Branch protection inconsistent

Today: PRs into `production` from non-`main` branches are allowed
(needed for hotfixes). Direct pushes to `production` are technically
possible.

**Industry standard:** `production` only accepts PRs from `main` (or
explicit `hotfix/*` branches). Direct push is blocked. CI must pass.

When to fix: low-stakes; safe to defer until the team grows or someone
makes a costly accident.

### Gap 7 — No infrastructure-as-code

Today: EC2 instance, Let's Encrypt certs, .env files, all set up by
hand. The setup steps are in commit history and team memory.

**Industry standard:** Terraform or Pulumi defines the EC2 + DNS + IAM +
secret stores. Re-creating prod from scratch is a single `terraform
apply`.

When to fix: when you replace EC2 (e.g. move to ECS Fargate, or split
into multiple instances), or when the answer to "how was this set up?"
becomes "ask <person who left the team>".

---

## On industry-standard practice — honest assessment

**The strong parts of the current setup:**

- Two-branch model with merge commits (`main → production`) preserves
  history and gives you `git revert` as a real escape hatch.
- CI gates every change. Push-to-deploy is automatic and reproducible.
- Migrations apply automatically with the deploy that introduces them.
- Concurrency groups prevent racing deploys.
- The compose file is in git — the entire orchestration is reviewable.

**The weak parts (already captured in [Gaps](#gaps-from-true-industry-standard)):**

- Build-on-deploy-target instead of build-in-CI.
- No staging env.
- Secrets in plaintext on host.
- Manual rollback.
- No centralized logging or APM.
- EC2 + nginx + certs configured by hand, not by code.

The gap between current and industry-standard is real but not embarrassing
for a 4-person bootstrapped team shipping to one box. **What matters is
that you know which gaps you have, in what order you'll close them, and
when.** Closing all six at once would slow you down for weeks without
proportionate payoff. Close one when its specific failure mode costs you
something.

Suggested order (cheapest-to-most-valuable):

1. **Tag :previous before build** (Gap 4, ~30 min) — gives you a
   one-command rollback the very next deploy.
2. **Sentry on backend + frontend** (Gap 5 partial, ~1 hour) — exceptions
   stop being invisible.
3. **Branch protection on `production`** (Gap 6, ~10 min config) — closes
   a low-likelihood but high-impact mistake path.
4. **Build in CI, push to ECR** (Gap 1, ~half day) — pays off the day
   builds slow down or you add a staging env.
5. **Staging EC2** (Gap 2, ~half day) — needs to share a build artifact
   with prod, so do after Gap 1.
6. **AWS Secrets Manager** (Gap 3, ~1 day) — meaningful when you take on
   compliance work or rotate secrets routinely.
7. **Terraform** (Gap 7, ~2-3 days) — biggest payoff when you replace
   EC2 or replicate to a new region.

---

## Reference — file map

| File | Purpose |
|---|---|
| `prism-analyst-platform/docker-compose.prod.yml` | Orchestrates all 5 containers (landing, frontend, backend, worker, nginx). |
| `prism-analyst-platform/Dockerfile` | Frontend image. Reads `NEXT_PUBLIC_*` ARGs (incl. `NEXT_PUBLIC_AUTH_ENABLED` + Supabase). |
| `prism-analyst-platform/Dockerfile.landing` | Landing image. |
| `prism-analyst-platform/deploy-first-time.sh` | From-scratch EC2 bootstrap — clones both repos, writes envs, issues SSL, `up -d --build`. |
| `prism-analyst-platform/nginx.conf` | Reverse proxy + SSL termination. CORS lives in FastAPI, NOT here. The `prism.` block is a single `location /` → frontend, so `/shared/[token]` is served transparently (no special block). |
| `prism-analyst-platform/.github/workflows/deploy.yml` | Frontend + landing deploy. |
| `prism-analyst-platform/.github/workflows/ci.yml` | Frontend CI. |
| `prism-analyst-services/Dockerfile` | Backend image (tagged `prism-backend:latest`; the `worker` container reuses it). Includes `config/` (integration registry). |
| `prism-analyst-services/src/portfolio/worker.py` | The `worker` entrypoint (`python -m src.portfolio.worker`) — runs durable Portfolio-Builder backtests. |
| `prism-analyst-services/.env` | **Not in git.** Lives on EC2 only. Contains all backend secrets. |
| `prism-analyst-services/.env.example` | In git. Template; never has real values. |
| `prism-analyst-services/alembic/versions/` | DB migrations. `alembic upgrade head` runs on each deploy. |
| `prism-analyst-services/src/config.py` | Pydantic Settings — every env var the backend reads is declared here. |
| `prism-analyst-services/src/main.py` | FastAPI app + CORS middleware. |
| `prism-analyst-services/.github/workflows/deploy.yml` | Backend deploy + alembic. |
| `prism-analyst-services/.github/workflows/ci.yml` | Backend CI. |
| EC2 host paths | `~/PRISM/prism-analyst-platform/`, `~/PRISM/prism-analyst-services/` |
| EC2 SSH | `ssh -i ~/.ssh/prism-analyst.pem ubuntu@15.207.146.145` |
| EC2 SSL certs | `/etc/letsencrypt/` (host) — bind-mounted into nginx. |

---

## Questions?

Update this doc when you hit a deployment situation it doesn't cover.
Future-you (and the rest of the team) will thank you.
