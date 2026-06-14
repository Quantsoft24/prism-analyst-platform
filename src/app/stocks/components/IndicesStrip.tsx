"use client";

import * as React from "react";

import { sparklinePath, useIndicesLatest, type IndexLatest } from "@/lib/api/stocks";
import { cn } from "@/lib/utils";

import styles from "./stocks.module.css";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/**
 * Horizontal strip of the 5 NSE index universes (Nifty 50 / Next 50 / 100 / 200
 * / 500) with their latest level, day move, and an inline sparkline. EOD data —
 * hidden entirely if the indices feed is unavailable (graceful, no error box).
 */
export default function IndicesStrip() {
  const { data, isLoading, isError } = useIndicesLatest();

  if (isError) return null;
  if (isLoading) {
    return (
      <div className={styles.indicesStrip}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={cn(styles.indexCard, styles.indexSkeleton)} />
        ))}
      </div>
    );
  }

  const indices = data ?? [];
  if (indices.length === 0) return null;

  return (
    <div className={styles.indicesStrip}>
      {indices.map((ix) => (
        <IndexCard key={ix.index_id} ix={ix} />
      ))}
    </div>
  );
}

function IndexCard({ ix }: { ix: IndexLatest }) {
  const up = (ix.change_pct ?? 0) >= 0;
  const d = sparklinePath(ix.spark ?? [], 88, 28);
  return (
    <div className={styles.indexCard}>
      <div className={styles.indexName}>{ix.index_name ?? `Index ${ix.index_id}`}</div>
      <div className={styles.indexLevelRow}>
        <span className={styles.indexLevel}>{ix.level != null ? inr.format(ix.level) : "—"}</span>
        {ix.change_pct != null && (
          <span className={cn(styles.indexChange, up ? styles.posText : styles.negText)}>
            {up ? "▲" : "▼"} {Math.abs(ix.change_pct).toFixed(2)}%
          </span>
        )}
      </div>
      {d ? (
        <svg className={styles.sparkline} viewBox="0 0 88 28" preserveAspectRatio="none" aria-hidden>
          <path
            d={d}
            fill="none"
            strokeWidth="1.5"
            className={up ? styles.sparkPos : styles.sparkNeg}
          />
        </svg>
      ) : (
        <div className={styles.sparkline} />
      )}
    </div>
  );
}
