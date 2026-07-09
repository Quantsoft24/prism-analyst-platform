# TLS Certificates — Let's Encrypt (production)

How HTTPS is issued, auto-renewed, and recovered for the three production hosts:

| Host | Serves | Cert path on the EC2 |
|---|---|---|
| `thequantsoft.co.in` (+ `www`) | Landing (`landing:4000`) | `/etc/letsencrypt/live/thequantsoft.co.in/` |
| `prism.thequantsoft.co.in` | Frontend (`frontend:3000`) | `/etc/letsencrypt/live/prism.thequantsoft.co.in/` |
| `api.thequantsoft.co.in` | Backend (`backend:8000`) | `/etc/letsencrypt/live/api.thequantsoft.co.in/` |

All three are **Let's Encrypt** certs (90-day, free), terminated at the `nginx`
container (`nginx.conf`). Everything runs on the single EC2 box via
`docker-compose.prod.yml`.

## What a cert is for / cost (quick primer)

A TLS certificate does two things for each hostname: it **proves identity** (the
browser trusts that this server really is `prism.thequantsoft.co.in`) and it
**enables HTTPS encryption**. Without a valid cert the browser shows "Your
connection is not private" and — because we send an HSTS header — blocks access
entirely, so the site is effectively down. The cert doesn't run the app; it's
purely the HTTPS layer at nginx.

**Cost: ₹0, always.** Let's Encrypt is a free non-profit CA; certbot is free
open-source. There is no billing, tier, or credit card — only the EC2 costs
money.

## The ACME account (there is no password)

Let's Encrypt has **no username/password**. Identity is an **ACME account key**
(a keypair) created by certbot on first use and stored on the EC2 at:

```
/etc/letsencrypt/accounts/acme-v02.api.letsencrypt.org/directory/<hash>/
  ├─ private_key.json   ← the account key (secret; never leaves the server, never committed)
  └─ regr.json          ← registration record (contains the contact email)
```

- **Registered contact email:** `praveen.kumar@thequantsoft.co.in` (Let's Encrypt
  emails this address before a cert expires). Set in `deploy-first-time.sh`.
- Inspect the live account on the box: `sudo certbot show_account`
- The account key is a **server-side secret** — it is **not** in the repo and
  cannot be recovered from anywhere else. If the EC2 is lost, certbot simply
  registers a **new** account on the next issue (no data to migrate) — the certs
  themselves are what matter, and those are re-issued for free.

## How auto-renewal works (the automation)

Three cooperating services in `docker-compose.prod.yml`:

1. **`certbot`** — runs `certbot renew --webroot -w /var/www/certbot` once a day.
   - No-op until a cert is within **30 days** of expiry, then it renews.
   - Uses the **HTTP-01 webroot** challenge: writes the ACME token under
     `./certbot/www` (a volume shared with nginx). `nginx.conf` already serves
     `/.well-known/acme-challenge/` from that path on :80 for every domain, so
     Let's Encrypt can validate. Renewed certs land in the shared
     `/etc/letsencrypt` volume.
2. **`nginx`** — its `command` runs `nginx -s reload` once a day in the
   background. nginx only re-reads cert files on reload, so this is what makes a
   renewed cert take effect. The reload is a near-instant, zero-downtime graceful
   reload (not an expiry check); daily is ample given the 30-day head-start.
3. **`cert-monitor`** — a daily **email alarm** safety net
   (`scripts/cert_expiry_alert.py`). It reads the cert nginx serves for each host
   (TLS handshake to the `nginx` service, SNI per host) and, if any cert is
   within **`CERT_ALERT_DAYS`** (default 5) of expiry — or unreadable — emails
   `TARGET_EMAIL` via the landing page's Gmail SMTP creds, repeating daily until
   fixed. Because healthy auto-renewal keeps every cert ≥~30 days out, **you get
   no email when things are fine** — an email means renewal is stuck and needs a
   human. Tune via env in the compose service (`CERT_ALERT_DAYS`,
   `CERT_ALERT_HOSTS`, `CERT_ALERT_TO`, `CERT_ALERT_INTERVAL_SEC`).

   Test it on demand (prints per-host days-left; emails only if ≤ threshold):
   ```bash
   docker compose -f docker-compose.prod.yml run --rm cert-monitor \
     python -u /app/cert_expiry_alert.py --once
   ```

### Why renewal was silently broken before (root cause)

The certs were first issued with `certbot --standalone`, which needs to **bind
port 80** — but in production **nginx** owns :80. So the renewal timer's
`certbot renew` (inheriting the stored `standalone` method) could never bind :80
and **failed every time**. `prism.thequantsoft.co.in` expired on 2026-07-08 as a
result; the apex only survived because its cert was issued ~18 days later.

The `certbot` service fixes this by passing `--webroot -w /var/www/certbot` on
the `renew` command line, which **overrides** the stored `standalone` method for
that run. To make the switch permanent in each cert's renewal config (optional
but recommended), re-issue once with webroot — see "Make webroot permanent".

## Immediate recovery — fix an expired cert NOW

Run on the EC2 (host that serves `prism.thequantsoft.co.in`):

```bash
cd ~/PRISM/prism-analyst-platform

# 1. Pull the updated compose (adds the certbot service + nginx reload loop)
git pull origin production

# 2. Bring up the new certbot service + recreate nginx with the reload loop
docker compose -f docker-compose.prod.yml up -d nginx certbot

# 3. Force an immediate renewal (don't wait up to 12h). --force-renewal because
#    an already-expired cert may need a nudge; webroot is served by nginx above.
docker compose -f docker-compose.prod.yml run --rm --entrypoint \
  "certbot renew --webroot -w /var/www/certbot --force-renewal" certbot

# 4. Reload nginx now (don't wait up to 6h)
docker exec prism-nginx nginx -s reload

# 5. Verify — expiry should now be ~90 days out
echo | openssl s_client -connect prism.thequantsoft.co.in:443 \
  -servername prism.thequantsoft.co.in 2>/dev/null | openssl x509 -noout -dates
```

> ⚠️ The apex `thequantsoft.co.in` cert expires **2026-07-26** — the same broken
> renewal would take it down then. Steps 2–4 above renew **all** due certs at
> once, so doing this now also saves the apex.

## Verify / monitor

```bash
# All certs + expiry, straight from certbot
docker compose -f docker-compose.prod.yml run --rm --entrypoint \
  "certbot certificates" certbot

# Is the renewal loop alive?
docker logs prism-certbot --tail 20

# Quick expiry check for any host
echo | openssl s_client -connect <host>:443 -servername <host> 2>/dev/null \
  | openssl x509 -noout -enddate
```

**Built-in alarm:** the `cert-monitor` service emails when any cert is within 5
days of expiry (see "How auto-renewal works" #3). Note Let's Encrypt is phasing
out its own expiry emails (2025+), so this monitor is the primary alarm. An
external check (UptimeRobot / BetterStack "SSL expiry") is a nice extra
independent signal but not required.

## Make webroot permanent (optional, recommended)

So `certbot renew` uses webroot even without the CLI override, re-issue each cert
once via webroot (nginx must be up to serve the challenge):

```bash
for d in "thequantsoft.co.in -d www.thequantsoft.co.in" \
         "prism.thequantsoft.co.in" "api.thequantsoft.co.in"; do
  docker compose -f docker-compose.prod.yml run --rm --entrypoint \
    "certbot certonly --webroot -w /var/www/certbot -d ${d} \
     --cert-name ${d%% *} --non-interactive --agree-tos \
     -m praveen.kumar@thequantsoft.co.in --force-renewal" certbot
done
docker exec prism-nginx nginx -s reload
```

This rewrites each `/etc/letsencrypt/renewal/*.conf` to `authenticator = webroot`.

## First issue on a fresh box

`deploy-first-time.sh` (STEP 6) issues all three certs with `--standalone`
**before** nginx starts (so :80 is free). After that, the `certbot` service takes
over renewal via webroot — no host cron/systemd timer needed; it's all in
compose. Requirement: DNS A-records for all three hosts must point at the EC2,
and the security group must allow inbound :80 and :443.
