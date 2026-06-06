"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { config } from "@/lib/config";
import { getBrowserSupabase } from "@/lib/supabase/client";

import styles from "../auth.module.css";

// Flip to true to re-enable "Continue with Google" (configure the Google
// provider in Supabase first — see the Google OAuth setup steps).
const GOOGLE_AUTH_ENABLED = false;

/**
 * Sign-in: email/password + Google + magic link, with a reset-password link.
 * Only meaningful when NEXT_PUBLIC_AUTH_ENABLED=true (otherwise the app has no
 * login). All flows go through Supabase; the callback route finishes OAuth /
 * magic-link sign-ins.
 */
export default function SignInPage() {
  // useSearchParams must be inside a Suspense boundary (Next 15 build rule).
  return (
    <React.Suspense fallback={<div className={styles.page} />}>
      <SignInForm />
    </React.Suspense>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/chat";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (!config.authEnabled) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Sign in</h1>
          <p className={styles.note}>
            Authentication is disabled in this environment
            (<code>NEXT_PUBLIC_AUTH_ENABLED=false</code>). Open the app directly.
          </p>
          <Link className={styles.primaryBtn} href="/chat">Go to PRISM</Link>
        </div>
      </div>
    );
  }

  const callback = `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback?next=${encodeURIComponent(next)}`;

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  const onPassword = (e: React.FormEvent) => {
    e.preventDefault();
    void withBusy(async () => {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push(next);
      router.refresh();
    });
  };

  const onGoogle = () =>
    void withBusy(async () => {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback },
      });
      if (error) throw error;
    });

  const onMagicLink = () =>
    void withBusy(async () => {
      if (!email) throw new Error("Enter your email first.");
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: callback },
      });
      if (error) throw error;
      setMsg("Check your email for a sign-in link.");
    });

  const onReset = () =>
    void withBusy(async () => {
      if (!email) throw new Error("Enter your email first.");
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback });
      if (error) throw error;
      setMsg("Password-reset email sent.");
    });

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={onPassword}>
        <h1 className={styles.title}>Sign in to PRISM</h1>

        <label className={styles.label}>Email</label>
        <input className={styles.input} type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />

        <label className={styles.label}>Password</label>
        <input className={styles.input} type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />

        {err && <div className={styles.error}>{err}</div>}
        {msg && <div className={styles.msg}>{msg}</div>}

        <button className={styles.primaryBtn} type="submit" disabled={busy}>Sign in</button>
        {GOOGLE_AUTH_ENABLED && (
          <button className={styles.googleBtn} type="button" onClick={onGoogle} disabled={busy}>
            Continue with Google
          </button>
        )}

        <div className={styles.row}>
          <button className={styles.linkBtn} type="button" onClick={onMagicLink} disabled={busy}>
            Email me a magic link
          </button>
          <button className={styles.linkBtn} type="button" onClick={onReset} disabled={busy}>
            Forgot password?
          </button>
        </div>

        <p className={styles.note}>
          New here? <Link className={styles.link} href="/sign-up">Create an account</Link>
        </p>

        <div className={styles.divider}>or</div>
        <button
          className={styles.guestBtn}
          type="button"
          onClick={() => router.push("/dashboard")}
          disabled={busy}
        >
          Continue as guest
        </button>
      </form>
    </div>
  );
}
