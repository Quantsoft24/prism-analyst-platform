"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { config } from "@/lib/config";
import { getBrowserSupabase } from "@/lib/supabase/client";

import styles from "../auth.module.css";

/**
 * Sign-up: email/password (+ name) and Google. Supabase sends a verification
 * email if "Confirm email" is on in the dashboard; otherwise the user is signed
 * in immediately. Only meaningful when NEXT_PUBLIC_AUTH_ENABLED=true.
 */
export default function SignUpPage() {
  const router = useRouter();
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
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

  const callback = `${typeof window !== "undefined" ? window.location.origin : ""}/auth/callback`;

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true); setErr(null); setMsg(null);
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void withBusy(async () => {
      const supabase = getBrowserSupabase();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName }, emailRedirectTo: callback },
      });
      if (error) throw error;
      // If email confirmation is required, there's no active session yet.
      if (data.session) {
        router.push("/chat");
        router.refresh();
      } else {
        setMsg("Check your email to confirm your account, then sign in.");
      }
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
        <button className={styles.googleBtn} type="button" onClick={onGoogle} disabled={busy}>
          Continue with Google
        </button>

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
