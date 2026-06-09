"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { config } from "@/lib/config";
import { getBrowserSupabase } from "@/lib/supabase/client";

import styles from "../auth.module.css";

// Flip to true to re-enable "Continue with Google" (configure the Google
// provider in Supabase first — see the Google OAuth setup steps).
const GOOGLE_AUTH_ENABLED = false;

/**
 * Sign-up: email/password (+ name), then a 6-digit OTP code emailed for
 * verification (no link). Step 1 creates the account; Step 2 confirms it with
 * `verifyOtp`, which establishes the session. No redirect / PKCE verifier, so it
 * works on any device/browser. Only meaningful when NEXT_PUBLIC_AUTH_ENABLED=true.
 */
export default function SignUpPage() {
  const router = useRouter();
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [code, setCode] = React.useState("");
  const [phase, setPhase] = React.useState<"form" | "otp">("form");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (!config.authEnabled) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>Sign up</h1>
          <p className={styles.note}>
            Authentication is disabled here (<code>NEXT_PUBLIC_AUTH_ENABLED=false</code>).
          </p>
          <Link className={styles.primaryBtn} href="/chat">Go to PRISM</Link>
        </div>
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const callback = `${origin}/auth/callback`; // OAuth (PKCE, same-browser)

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  // Step 1 — create the account; Supabase emails a 6-digit code (Confirm email ON).
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void withBusy(async () => {
      const supabase = getBrowserSupabase();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;
      // Supabase obfuscates "email already registered" (anti-enumeration) by
      // returning a success-shaped response — but the user comes back with an
      // EMPTY `identities` array. Detect that and tell the user clearly.
      if (data.user && (data.user.identities?.length ?? 0) === 0) {
        setErr("An account with this email already exists. Please sign in instead.");
        return;
      }
      // If confirmation is somehow off, a session is returned → straight in.
      if (data.session) {
        router.push("/chat");
        router.refresh();
        return;
      }
      // Otherwise move to the code-entry step.
      setPhase("otp");
      setMsg(`We emailed a 6-digit code to ${email}. Enter it below to finish.`);
    });
  };

  // Step 2 — verify the emailed code → establishes the session.
  const onVerify = (e: React.FormEvent) => {
    e.preventDefault();
    void withBusy(async () => {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "signup",
      });
      if (error) throw error;
      router.push("/chat");
      router.refresh();
    });
  };

  const onResend = () =>
    void withBusy(async () => {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      setMsg(`New code sent to ${email}.`);
    });

  const onGoogle = () =>
    void withBusy(async () => {
      const supabase = getBrowserSupabase();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback },
      });
      if (error) throw error;
    });

  // ── Step 2: OTP code entry ──
  if (phase === "otp") {
    return (
      <div className={styles.page}>
        <form className={styles.card} onSubmit={onVerify}>
          <h1 className={styles.title}>Enter your code</h1>

          <label className={styles.label}>6-digit code</label>
          <input
            className={styles.otpInput}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            autoFocus
            required
          />

          {err && <div className={styles.error}>{err}</div>}
          {msg && <div className={styles.msg}>{msg}</div>}

          <button className={styles.primaryBtn} type="submit" disabled={busy || code.length < 6}>
            Verify &amp; continue
          </button>

          <div className={styles.row}>
            <button className={styles.linkBtn} type="button" onClick={onResend} disabled={busy}>
              Resend code
            </button>
            <button
              className={styles.linkBtn}
              type="button"
              onClick={() => { setPhase("form"); setCode(""); setErr(null); setMsg(null); }}
              disabled={busy}
            >
              ← Wrong email? Start over
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ── Step 1: account form ──
  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={onSubmit}>
        <h1 className={styles.title}>Create your PRISM account</h1>

        <label className={styles.label}>Full name</label>
        <input className={styles.input} value={fullName}
          onChange={(e) => setFullName(e.target.value)} autoComplete="name" />

        <label className={styles.label}>Email</label>
        <input className={styles.input} type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />

        <label className={styles.label}>Password</label>
        <input className={styles.input} type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />

        {err && <div className={styles.error}>{err}</div>}
        {msg && <div className={styles.msg}>{msg}</div>}

        <button className={styles.primaryBtn} type="submit" disabled={busy}>Create account</button>
        {GOOGLE_AUTH_ENABLED && (
          <button className={styles.googleBtn} type="button" onClick={onGoogle} disabled={busy}>
            Continue with Google
          </button>
        )}

        <p className={styles.note}>
          Already have an account? <Link className={styles.link} href="/sign-in">Sign in</Link>
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
