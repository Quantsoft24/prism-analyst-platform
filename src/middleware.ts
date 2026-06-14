/**
 * Auth middleware — refreshes the Supabase session cookie and guards routes.
 *
 * Gated by `NEXT_PUBLIC_AUTH_ENABLED`: when auth is OFF (default) it's a no-op
 * pass-through, so today's behaviour is unchanged. When ON, unauthenticated
 * users are redirected to /sign-in (except on the public auth routes), and
 * signed-in users are bounced away from the auth pages.
 *
 * NOTE: which features are gated for anonymous users is a product decision
 * (config/access_policy.yml on the backend is the source of truth). This
 * middleware currently protects the whole workspace; relax it here once the
 * team sets the gating matrix (see final_docs/12 §8).
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { config as appConfig } from "@/lib/config";

// `/shared` is a public read-only conversation snapshot — must stay reachable
// without a session even once auth gating is turned on.
const PUBLIC_PREFIXES = ["/sign-in", "/sign-up", "/auth", "/shared"];

// Per the team's "anonymous can do everything for now" call, login is NOT forced
// — anonymous visitors browse freely; signing in just adds identity. Flip this
// to true (or move gating into config/access_policy.yml on the backend) when the
// team decides the gating matrix before launch. See final_docs/12 §8.
const REQUIRE_AUTH = false;

export async function middleware(request: NextRequest) {
  if (!appConfig.authEnabled) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(items) {
        for (const { name, value } of items) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of items) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some((p) => path.startsWith(p));

  if (REQUIRE_AUTH && !user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && (path.startsWith("/sign-in") || path.startsWith("/sign-up"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
