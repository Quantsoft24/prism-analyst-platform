"use client";

import * as React from "react";

import { config } from "@/lib/config";
import { MOCK_USER } from "@/lib/mockData";

export interface AuthUser {
  name: string;
  secondary: string; // firm name (mock) or email (real)
  email: string | null;
  initials: string;
  authEnabled: boolean;
  isSignedIn: boolean; // true only when a real Supabase user is present
  signOut: () => Promise<void>;
  /** Update the signed-in user's display name (Supabase user_metadata). */
  updateName: (fullName: string) => Promise<void>;
}

function initialsOf(name: string, email: string | null): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

/**
 * The current user for the sidebar chip. Auth OFF → the mock user (unchanged).
 * Auth ON → the live Supabase user, kept fresh via onAuthStateChange, plus a
 * working sign-out.
 */
export function useAuthUser(): AuthUser {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState<string | null>(null);
  const [signedIn, setSignedIn] = React.useState(false);

  React.useEffect(() => {
    if (!config.authEnabled) return;
    let unsub: (() => void) | undefined;
    let active = true;

    const apply = (u: { email?: string | null; user_metadata?: Record<string, unknown> } | null) => {
      if (!active) return;
      if (u) {
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
        setName((meta.full_name as string) || (meta.name as string) || "");
        setEmail(u.email ?? null);
        setSignedIn(true);
      } else {
        setName("");
        setEmail(null);
        setSignedIn(false);
      }
    };

    void import("@/lib/supabase/client").then(({ getBrowserSupabase }) => {
      const supabase = getBrowserSupabase();
      void supabase.auth.getUser().then(({ data }) => apply(data.user ?? null));
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
        apply(session?.user ?? null),
      );
      unsub = () => sub.subscription.unsubscribe();
    });

    return () => {
      active = false;
      unsub?.();
    };
  }, []);

  const signOut = React.useCallback(async () => {
    const { getBrowserSupabase } = await import("@/lib/supabase/client");
    await getBrowserSupabase().auth.signOut();
    window.location.href = "/sign-in";
  }, []);

  const updateName = React.useCallback(async (fullName: string) => {
    const { getBrowserSupabase } = await import("@/lib/supabase/client");
    const { error } = await getBrowserSupabase().auth.updateUser({ data: { full_name: fullName } });
    if (error) throw error;
    setName(fullName); // reflect immediately; onAuthStateChange also fires
  }, []);

  if (!config.authEnabled) {
    return {
      name: MOCK_USER.name,
      secondary: MOCK_USER.firm,
      email: null,
      initials: MOCK_USER.initials,
      authEnabled: false,
      isSignedIn: false,
      signOut,
      updateName,
    };
  }
  if (!signedIn) {
    // Auth on, but browsing anonymously → show a Sign in affordance, not logout.
    return {
      name: "Guest",
      secondary: "Not signed in",
      email: null,
      initials: "?",
      authEnabled: true,
      isSignedIn: false,
      signOut,
      updateName,
    };
  }
  return {
    name: name || email || "Account",
    secondary: email ?? "",
    email,
    initials: initialsOf(name, email),
    authEnabled: true,
    isSignedIn: true,
    signOut,
    updateName,
  };
}
