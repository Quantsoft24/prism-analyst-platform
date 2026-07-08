#!/usr/bin/env python3
"""Daily TLS-certificate expiry alarm for the PRISM production hosts.

Purpose
-------
A safety net *around* certbot auto-renewal (see docs/TLS_CERTS.md). Once a day it
reads the certificate nginx is actually serving for each host and, if any cert is
within ``CERT_ALERT_DAYS`` (default 5) of expiring — or can't be read at all —
sends ONE email listing the offenders. It sends again every day the condition
holds, so you keep getting nudged over the final days.

Why this stays quiet when healthy: certbot renews at 30 days remaining and the
new cert is valid 90 days, so a healthy cert never drops to <=5 days. Therefore
**no email == everything is fine**; an email means auto-renewal is stuck and
needs a human (exactly the failure that took prism.thequantsoft.co.in down).

How it reads the cert
---------------------
It opens a TLS handshake to the nginx container (``CERT_ALERT_CONNECT_HOST``,
default ``nginx`` on the compose network) using each public hostname as the SNI,
and reads the served cert's ``notAfter``. Connecting to nginx directly (not the
public DNS name) avoids NAT hairpin issues and reflects exactly what nginx
serves after its reload. Verification is disabled so an already-expired cert can
still be inspected. Pure stdlib — no pip installs.

Config (all via env; SMTP_* come from the shared landing .env)
--------------------------------------------------------------
  CERT_ALERT_HOSTS         csv of hostnames to check (SNI)
  CERT_ALERT_DAYS          alert threshold in days (default 5)
  CERT_ALERT_INTERVAL_SEC  loop sleep (default 86400 = daily)
  CERT_ALERT_CONNECT_HOST  where nginx is reachable (default "nginx")
  CERT_ALERT_CONNECT_PORT  default 443
  CERT_ALERT_TO            recipient (default TARGET_EMAIL, else SMTP_USER)
  SMTP_HOST/SMTP_PORT      default smtp.gmail.com / 587 (STARTTLS)
  SMTP_USER/SMTP_PASS      Gmail address + app password (reused from landing)
"""
from __future__ import annotations

import datetime as dt
import os
import smtplib
import socket
import ssl
import sys
import time
from email.message import EmailMessage

DEFAULT_HOSTS = "thequantsoft.co.in,prism.thequantsoft.co.in,api.thequantsoft.co.in"


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def days_until_expiry(sni_host: str, connect_host: str, connect_port: int) -> tuple[int, dt.datetime]:
    """Return (days_left, expiry_utc) for the cert nginx serves for ``sni_host``.
    Raises on any connection/parse failure so the caller can alert on it."""
    ctx = ssl._create_unverified_context()  # noqa: SLF001 — must read expired certs too
    with socket.create_connection((connect_host, connect_port), timeout=10) as sock:
        with ctx.wrap_socket(sock, server_hostname=sni_host) as tls:
            cert = tls.getpeercert()
    # notAfter looks like "Jul  8 17:18:07 2026 GMT"
    expiry = dt.datetime.strptime(cert["notAfter"], "%b %d %H:%M:%S %Y %Z")
    days = (expiry - dt.datetime.utcnow()).days
    return days, expiry


def check_all() -> list[str]:
    """Return a list of human-readable alert lines (empty == all healthy)."""
    hosts = [h.strip() for h in _env("CERT_ALERT_HOSTS", DEFAULT_HOSTS).split(",") if h.strip()]
    threshold = int(_env("CERT_ALERT_DAYS", "5") or "5")
    connect_host = _env("CERT_ALERT_CONNECT_HOST", "nginx")
    connect_port = int(_env("CERT_ALERT_CONNECT_PORT", "443") or "443")

    alerts: list[str] = []
    for host in hosts:
        try:
            days, expiry = days_until_expiry(host, connect_host, connect_port)
        except Exception as exc:  # noqa: BLE001 — any failure is itself alert-worthy
            alerts.append(f"❌ {host}: could NOT read certificate ({exc})")
            print(f"[cert-monitor] {host}: read failed: {exc}", flush=True)
            continue
        state = "EXPIRED" if days < 0 else f"{days}d left"
        print(f"[cert-monitor] {host}: {state} (expires {expiry:%Y-%m-%d %H:%M UTC})", flush=True)
        if days <= threshold:
            verb = "has EXPIRED" if days < 0 else f"expires in {days} day(s)"
            alerts.append(f"⚠️  {host} {verb} — {expiry:%Y-%m-%d %H:%M UTC}")
    return alerts


def send_email(alerts: list[str]) -> None:
    smtp_user = _env("SMTP_USER")
    smtp_pass = _env("SMTP_PASS")
    if not smtp_user or not smtp_pass:
        print("[cert-monitor] SMTP_USER/SMTP_PASS not set — skipping email (would have alerted).", flush=True)
        return
    to_addr = _env("CERT_ALERT_TO") or _env("TARGET_EMAIL") or smtp_user
    host = _env("SMTP_HOST", "smtp.gmail.com")
    port = int(_env("SMTP_PORT", "587") or "587")

    msg = EmailMessage()
    msg["Subject"] = "[PRISM] TLS certificate expiring — renewal needs attention"
    msg["From"] = smtp_user
    msg["To"] = to_addr
    body = (
        "Automated alert from the PRISM cert-monitor.\n\n"
        "One or more TLS certificates are at/near expiry, which usually means\n"
        "certbot auto-renewal is stuck. Recover using docs/TLS_CERTS.md.\n\n"
        + "\n".join(alerts)
        + "\n\nThis email repeats daily until the certificate is renewed.\n"
    )
    msg.set_content(body)

    with smtplib.SMTP(host, port, timeout=20) as server:
        server.starttls(context=ssl.create_default_context())
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
    print(f"[cert-monitor] alert email sent to {to_addr}", flush=True)


def run_once() -> None:
    alerts = check_all()
    if alerts:
        try:
            send_email(alerts)
        except Exception as exc:  # noqa: BLE001 — don't crash the loop on a mail failure
            print(f"[cert-monitor] failed to send alert email: {exc}", flush=True)
    else:
        print("[cert-monitor] all certificates healthy — no alert.", flush=True)


def main() -> int:
    interval = int(_env("CERT_ALERT_INTERVAL_SEC", "86400") or "86400")
    if "--once" in sys.argv:
        run_once()
        return 0
    print(f"[cert-monitor] started — checking every {interval}s "
          f"(threshold {_env('CERT_ALERT_DAYS', '5')}d)", flush=True)
    while True:
        run_once()
        time.sleep(interval)


if __name__ == "__main__":
    raise SystemExit(main())
