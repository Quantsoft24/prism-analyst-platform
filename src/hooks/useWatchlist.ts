"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * News watchlist persisted to localStorage.
 *
 * v1 storage is per-browser (no auth yet). When Clerk lands, this migrates to
 * a per-user `firm_watchlists` table — the hook's public surface stays the
 * same so consumers don't change. See PRISM_HANDOFF.md.
 *
 * SSR-safe: reads localStorage only after mount (Next hydration). Writes are
 * wrapped in try/catch for private-mode / quota errors.
 */

const STORAGE_KEY = "prism.news.watchlist";
const MAX_WATCHLIST = 12; // keep the pulse grid + polling bounded

function readStored(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, MAX_WATCHLIST);
  } catch {
    return [];
  }
}

function writeStored(list: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // private mode / quota — non-fatal, the in-memory state still works.
  }
}

export interface UseWatchlist {
  watchlist: string[];
  add: (company: string) => void;
  remove: (company: string) => void;
  has: (company: string) => boolean;
  toggle: (company: string) => void;
  clear: () => void;
  isFull: boolean;
}

export function useWatchlist(): UseWatchlist {
  const [watchlist, setWatchlist] = useState<string[]>([]);

  // Hydrate after mount (avoids SSR/client mismatch).
  useEffect(() => {
    setWatchlist(readStored());
  }, []);

  // Persist on every change.
  useEffect(() => {
    writeStored(watchlist);
  }, [watchlist]);

  const add = useCallback((company: string) => {
    const name = company.trim();
    if (!name) return;
    setWatchlist((prev) => {
      // Case-insensitive dedupe; preserve the user's original casing.
      if (prev.some((c) => c.toLowerCase() === name.toLowerCase())) return prev;
      if (prev.length >= MAX_WATCHLIST) return prev;
      return [...prev, name];
    });
  }, []);

  const remove = useCallback((company: string) => {
    setWatchlist((prev) => prev.filter((c) => c.toLowerCase() !== company.toLowerCase()));
  }, []);

  const has = useCallback(
    (company: string) => watchlist.some((c) => c.toLowerCase() === company.toLowerCase()),
    [watchlist],
  );

  const toggle = useCallback((company: string) => {
    const name = company.trim();
    if (!name) return;
    setWatchlist((prev) => {
      if (prev.some((c) => c.toLowerCase() === name.toLowerCase())) {
        return prev.filter((c) => c.toLowerCase() !== name.toLowerCase());
      }
      if (prev.length >= MAX_WATCHLIST) return prev;
      return [...prev, name];
    });
  }, []);

  const clear = useCallback(() => setWatchlist([]), []);

  return {
    watchlist,
    add,
    remove,
    has,
    toggle,
    clear,
    isFull: watchlist.length >= MAX_WATCHLIST,
  };
}
