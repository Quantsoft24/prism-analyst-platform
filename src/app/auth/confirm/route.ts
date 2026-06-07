/**
 * Email OTP confirmation (token_hash flow) — the robust, cross-device way to
 * confirm sign-ups / magic links / recovery in an SSR app.
 *
 * Unlike the PKCE `?code` flow (which needs a `code_verifier` stored in the
 * SAME browser that started sign-up — so it breaks when the email is opened on
 * a phone, another profile, or after a scanner pre-opens it), `verifyOtp` takes
 * the `token_hash` from the link directly and establishes the session. No
 * verifier required → works from any browser/device.
 *
 * The Supabase email template must point here, e.g. (Confirm signup):
 *   {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=signup&next=/chat
 * (with `emailRedirectTo` set to `<origin>/auth/confirm` so {{ .RedirectTo }}
 *  resolves to the right host for both localhost and prod).
 */

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") || "/chat";

  // Build redirects from the PUBLIC host (nginx forwards it) — never the
  // Next-standalone internal `0.0.0.0:3000` bind.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const base = host ? `${proto}://${host}` : request.nextUrl.origin;

  const code = searchParams.get("code");
  const supabase = await getServerSupabase();

  // Preferred: token_hash (verifyOtp) — works on any device/browser. Used once
  // a custom-SMTP email template sends `?token_hash=…&type=…`.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      // Session cookies are now set → land the user where they were headed.
      return NextResponse.redirect(new URL(next, base));
    }
  } else if (code) {
    // Fallback: the DEFAULT Supabase template still sends a PKCE `?code`.
    // Exchange it (works when opened in the same browser as sign-up).
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, base));
    }
  }

  // Missing params / invalid / expired → show the friendly "Link expired" card
  // (the /auth/callback page reads ?error and renders it).
  const fail = new URL("/auth/callback", base);
  fail.searchParams.set("error", "verify_failed");
  fail.searchParams.set("error_description", "Email link is invalid or has expired.");
  return NextResponse.redirect(fail);
}
