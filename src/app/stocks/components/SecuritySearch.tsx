"use client";

import * as React from "react";

import { searchSecurities, useSecurities, type Security } from "@/lib/api/stocks";
import { cn } from "@/lib/utils";

import styles from "./stocks.module.css";

interface SecuritySearchProps {
  onSelect: (security: Security) => void;
  selectedId?: number | null;
}

/**
 * Instant company search. Fetches the full security list once (cached) and
 * filters it in-memory, so suggestions appear with zero per-keystroke latency.
 * Dual-listed names surface as two chips (one per exchange). Chip layout
 * mirrors the global SearchModal's result rows.
 */
export default function SecuritySearch({ onSelect, selectedId }: SecuritySearchProps) {
  const { data, isLoading, isError } = useSecurities();
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const boxRef = React.useRef<HTMLDivElement>(null);

  const results = React.useMemo(
    () => searchSecurities(data ?? [], query, 8),
    [data, query],
  );

  React.useEffect(() => setActiveIndex(0), [query]);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = React.useCallback(
    (s: Security) => {
      onSelect(s);
      setQuery("");
      setOpen(false);
    },
    [onSelect],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      choose(results[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className={styles.searchBox} ref={boxRef}>
      <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        className={styles.searchInput}
        placeholder={isLoading ? "Loading securities…" : "Search NSE/BSE companies…"}
        value={query}
        disabled={isLoading || isError}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {isError && <span className={styles.searchError}>Search unavailable</span>}

      {open && query.trim() && (
        <div className={styles.suggestions}>
          {results.length === 0 ? (
            <div className={styles.suggestionEmpty}>No matches for “{query}”</div>
          ) : (
            results.map((s, i) => (
              <button
                key={s.security_id}
                className={cn(
                  styles.suggestion,
                  i === activeIndex && styles.suggestionActive,
                  s.security_id === selectedId && styles.suggestionSelected,
                )}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => choose(s)}
              >
                <span className={cn(styles.exchBadge, s.exchange === "BSE" ? styles.exchBse : styles.exchNse)}>
                  {s.exchange}
                </span>
                <span className={styles.suggestionMain}>
                  <span className={styles.suggestionName}>{s.security_name}</span>
                  <span className={styles.suggestionMeta}>
                    {s.symbol}
                    {s.isin ? ` · ${s.isin}` : ""}
                    {s.sector ? ` · ${s.sector}` : ""}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
