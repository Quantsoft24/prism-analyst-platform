/**
 * Server-side Supabase client (Server Components, Route Handlers). Reads/writes
 * the session cookies via Next 15's async ``cookies()``. Used by the OAuth /
 * magic-link callback route to exchange the code for a session.
 */

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { config } from "@/lib/config";

export async function getServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(items) {
        try {
          for (const { name, value, options } of items) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll from a Server Component (read-only cookies) — safe to ignore;
          // the middleware refreshes the session cookie on the next request.
        }
      },
    },
  });
}
