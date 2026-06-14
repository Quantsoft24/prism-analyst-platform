"use client";

import * as React from "react";

import { useSecurities, type Security } from "@/lib/api/stocks";
import { cn } from "@/lib/utils";

import styles from "./stocks.module.css";

// Curated large-cap NSE symbols offered as one-click quick picks.
const POPULAR_SYMBOLS = [
  "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
  "SBIN", "ITC", "BHARTIARTL", "LT", "HINDUNILVR",
];

/**
 * Popular-stock quick picks. Resolves the curated NSE symbols against the
 * cached security list (preferring the NSE listing) so a click opens the right
 * `security_id`. Renders nothing until the security list has loaded.
 */
export default function PopularStocks({ onSelect }: { onSelect: (s: Security) => void }) {
  const { data } = useSecurities();

  const picks = React.useMemo(() => {
    const list = data ?? [];
    const out: Security[] = [];
    for (const sym of POPULAR_SYMBOLS) {
      const matches = list.filter((s) => (s.symbol ?? "").toUpperCase() === sym);
      const chosen = matches.find((s) => s.exchange === "NSE") ?? matches[0];
      if (chosen) out.push(chosen);
    }
    return out;
  }, [data]);

  if (picks.length === 0) return null;

  return (
    <section className={styles.sideCard}>
      <h3 className={styles.ovTitle}>Popular</h3>
      <div className={styles.chipRow}>
        {picks.map((s) => (
          <button key={s.security_id} className={styles.secChip} onClick={() => onSelect(s)}>
            <span className={cn(styles.exchBadge, s.exchange === "BSE" ? styles.exchBse : styles.exchNse)}>
              {s.exchange}
            </span>
            <span className={styles.secChipName}>{s.symbol ?? s.security_name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
