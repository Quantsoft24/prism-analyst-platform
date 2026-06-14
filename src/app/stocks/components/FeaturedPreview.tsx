"use client";

import * as React from "react";

import {
  formatMetric,
  priceChange,
  sparklinePath,
  useSecurities,
  useStockPrices,
  type Security,
} from "@/lib/api/stocks";
import { cn } from "@/lib/utils";

import styles from "./stocks.module.css";

// Fallback featured name when the user has no history yet.
const DEFAULT_SYMBOL = "RELIANCE";

/**
 * A compact preview of the user's last-viewed security (or a default large-cap)
 * so the landing isn't all lists — name, latest price, day move, a 6-month
 * sparkline, and a one-click jump into the full dashboard. Uses a lightweight
 * inline sparkline (not the full chart) to keep the landing fast.
 */
export default function FeaturedPreview({
  recent,
  onSelect,
}: {
  recent: Security[];
  onSelect: (s: Security) => void;
}) {
  const { data: securities } = useSecurities();

  const featured: Security | null = React.useMemo(() => {
    if (recent[0]) return recent[0];
    const list = securities ?? [];
    const matches = list.filter((s) => (s.symbol ?? "").toUpperCase() === DEFAULT_SYMBOL);
    return matches.find((s) => s.exchange === "NSE") ?? matches[0] ?? null;
  }, [recent, securities]);

  const prices = useStockPrices(featured?.security_id ?? null, "6M");
  const points = prices.data?.points ?? [];
  const latest = prices.data?.latest ?? null;
  const change = priceChange(points);
  const header = prices.data?.security ?? featured;

  if (!featured || !header) return null;

  const closes = points
    .map((p) => p.close)
    .filter((c): c is number => c != null);
  const up = (change?.pct ?? 0) >= 0;
  const d = sparklinePath(closes, 600, 64);

  return (
    <section className={styles.featuredCard}>
      <div className={styles.featuredHead}>
        <div className={styles.featuredIdentity}>
          <div className={styles.featuredKicker}>
            {recent[0] ? "Pick up where you left off" : "Featured"}
          </div>
          <div className={styles.featuredNameRow}>
            <span className={styles.featuredName}>{header.security_name}</span>
            <span className={cn(styles.exchBadge, header.exchange === "BSE" ? styles.exchBse : styles.exchNse)}>
              {header.exchange}
            </span>
            <span className={styles.featuredSym}>{header.symbol}</span>
          </div>
        </div>
        <div className={styles.featuredQuote}>
          {latest?.close != null && (
            <span className={styles.featuredPrice}>{formatMetric(latest.close, "price")}</span>
          )}
          {change && (
            <span className={cn(styles.featuredChange, up ? styles.posText : styles.negText)}>
              {up ? "▲" : "▼"} {Math.abs(change.pct).toFixed(2)}% · 6M
            </span>
          )}
        </div>
      </div>

      {prices.isLoading ? (
        <div className={styles.featuredSkeleton} />
      ) : d ? (
        <svg
          className={styles.featuredSpark}
          viewBox="0 0 600 64"
          preserveAspectRatio="none"
          aria-hidden
        >
          <path d={d} fill="none" strokeWidth="2" className={up ? styles.sparkPos : styles.sparkNeg} />
        </svg>
      ) : (
        <div className={styles.featuredSparkLoading}>No recent prices.</div>
      )}

      <button className={styles.viewFull} onClick={() => onSelect(featured)}>
        View full dashboard →
      </button>
    </section>
  );
}
