"use client";

import { useCallback, useEffect, useState } from "react";

import type { Security } from "@/lib/api/stocks";

/**
 * Recently-viewed securities on the Stock Dashboard, persisted to localStorage.
 *
 * Stores the lightweight `Security` shape (id + name + symbol + exchange +
 * sector) so the landing can render the chips without waiting on any query.
 * Most-recent first, capped at `MAX_RECENT`. Same SSR-safe + try/catch pattern
 * as `useWatchlist`; migrates to a per-user table when auth lands.
 */

const STORAGE_KEY = "prism.stocks.recent";
const MAX_RECENT = 8;

function readStored(): Security[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is Security => !!x && typeof x.security_id === "number")
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function writeStored(list: Security[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // private mode / quota — non-fatal; in-memory state still works.
  }
}

export interface UseRecentSecurities {
  recent: Security[];
  push: (security: Security) => void;
  clear: () => void;
}

export function useRecentSecurities(): UseRecentSecurities {
  const [recent, setRecent] = useState<Security[]>([]);

  // Hydrate after mount (avoids SSR/client mismatch).
  useEffect(() => {
    setRecent(readStored());
  }, []);

  useEffect(() => {
    writeStored(recent);
  }, [recent]);

  const push = useCallback((security: Security) => {
    if (!security || typeof security.security_id !== "number") return;
    setRecent((prev) => {
      const next = prev.filter((s) => s.security_id !== security.security_id);
      next.unshift({
        security_id: security.security_id,
        security_name: security.security_name,
        symbol: security.symbol,
        isin: security.isin ?? null,
        exchange: security.exchange,
        sector: security.sector,
      });
      return next.slice(0, MAX_RECENT);
    });
  }, []);

  const clear = useCallback(() => setRecent([]), []);

  return { recent, push, clear };
}
