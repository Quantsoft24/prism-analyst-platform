"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { getBrowserSupabase } from "@/lib/supabase/client";
import styles from "../../auth.module.css";

/**
 * Auth callback (client) — finishes OAuth / magic-link / email-confirm /
 * password-reset.
 *
 * Why client, not a server route: Supabase returns FAILURES in the URL **hash**
 * (`#error=...&error_code=otp_expired`), which a server route can't read; and in
 * Next standalone behind nginx, server-side redirects resolve the host to the
 * internal `0.0.0.0:3000` bind. Doing this in the browser fixes both — we read
 * the real `window.location` and can show a friendly message on expired links.
 */
export default function AuthCallbackPage() {
  return (
    <React.Suspense fallback={<div className={styles.page} />}>
      <CallbackInner />
    </React.Suspense>
  );
}

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Errors arrive in the hash (#error=...). Parse hash first, then query.
    const hash =
      typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
    const hp = new URLSearchParams(hash);

    if (hp.get("error") || params.get("error")) {
      const desc = hp.get("error_description") || params.get("error_description");
      const code = hp.get("error_code") || params.get("error_code");
      setErrorMsg(
        desc
          ? decodeURIComponent(desc.replace(/\+/g, " "))
          : code || "This link is invalid or has expired.",
      );
      return;
    }

    const next = params.get("next") || "/chat";

    // Nothing to process (direct visit) → just go.
    if (!params.get("code") && !hp.get("access_token")) {
      router.replace(next);
      return;
    }

    // IMPORTANT: do NOT call exchangeCodeForSession here. The @supabase/ssr
    // browser client has `detectSessionInUrl` on by default, so it ALREADY
    // exchanges the ?code on load (consuming the one-time PKCE verifier). A
    // second manual exchange double-spends it → "code verifier not found".
    // Instead, just wait for the session the auto-exchange establishes.
    const supabase = getBrowserSupabase();
    let settled = false;
    const go = () => {
      if (settled) return;
      settled = true;
      router.replace(next);
      router.refresh();
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go();
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });
    const timer = setTimeout(() => {
      if (!settled) {
        setErrorMsg(
          "Couldn't complete sign-in — the link may have expired, been used already, or been opened in a different browser. Please request a fresh one.",
        );
      }
    }, 6000);

    return () => {
      clearTimeout(timer);
      sub.subscription.unsubscribe();
    };
  }, [params, router]);

  if (errorMsg) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Link expired</h1>
          <p className={styles.note}>{errorMsg}</p>
          <p className={styles.note}>
            Sign-in links are single-use and expire quickly (and some email
            scanners open them first). Please request a fresh one.
          </p>
          <Link className={styles.primaryBtn} href="/sign-in">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Signing you in…</h1>
        <p className={styles.note}>One moment.</p>
      </div>
    </div>
  );
}
