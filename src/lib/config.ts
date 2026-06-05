/**
 * PRISM — Environment Configuration
 */

export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  // Master switch for real auth. false (default) → dev-firm header, no login,
  // today's behaviour. true → Supabase login + bearer token (needs the two
  // NEXT_PUBLIC_SUPABASE_* vars below, from your Supabase project).
  authEnabled: process.env.NEXT_PUBLIC_AUTH_ENABLED === "true",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
} as const;
