"use client";

/**
 * Browser-side Supabase client (singleton). Only constructed when auth is on
 * (`config.authEnabled`), so the empty-key dev default never instantiates it.
 * Used for login/signup, the session token attached to API calls, and the
 * sidebar's live user.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { config } from "@/lib/config";

let _client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient {
  if (!_client) {
    _client = createBrowserClient(config.supabaseUrl, config.supabaseAnonKey);
  }
  return _client;
}
