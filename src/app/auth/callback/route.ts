/**
 * OAuth / magic-link callback — exchanges the `?code` for a session cookie,
 * then redirects to `?next` (default /chat). Set this URL as the redirect in
 * the Supabase dashboard (Auth → URL Configuration) and on Google OAuth.
 */

import { NextResponse, type NextRequest } from "next/server";

import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/chat";

  if (code) {
    const supabase = await getServerSupabase();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(next, origin));
}
