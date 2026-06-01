"use client";

import * as React from "react";

import { formatMetric, type PricePoint } from "@/lib/api/stocks";

import styles from "./stocks.module.css";

/** Bottom strip: the latest bar's values for every metric. */
export default function LatestStrip({ latest }: { latest: PricePoint | null }) {
  if (!latest) return null;

  const items: { label: string; value: string }[] = [
    { label: "Open", value: formatMetric(latest.open, "price") },
    { label: "High", value: formatMetric(latest.high, "price") },
    { label: "Low", value: formatMetric(latest.low, "price") },
    { label: "Close", value: formatMetric(latest.close, "price") },
    { label: "Volume", value: formatMetric(latest.trade_volume, "volume") },
    { label: "Trade Value", value: formatMetric(latest.trade_value, "value") },
    { label: "Market Cap", value: formatMetric(latest.market_cap, "cap") },
  ];

  return (
    <div className={styles.latest}>
      <div className={styles.latestHead}>
        <span className={styles.latestLabel}>Latest</span>
        <span className={styles.latestDate}>{latest.time}</span>
      </div>
      <div className={styles.latestGrid}>
        {items.map((it) => (
          <div key={it.label} className={styles.latestCell}>
            <span className={styles.latestCellLabel}>{it.label}</span>
            <span className={styles.latestCellValue}>{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
