"use client";

import * as React from "react";

import { useDeleteStrategy, useStrategies } from "@/lib/api/portfolio";

import type { BuilderConfig } from "./BuilderView";
import styles from "./saved.module.css";

const UNIVERSE_NAMES: Record<number, string> = {
  1: "Nifty 50", 2: "Nifty Next 50", 3: "Nifty 100", 4: "Nifty 200", 5: "Nifty 500",
};

export default function SavedResultsView({ onLoad }: { onLoad: (cfg: BuilderConfig) => void }) {
  const strategies = useStrategies();
  const del = useDeleteStrategy();

  if (strategies.isLoading) return <div className={styles.empty}>Loading saved strategies…</div>;
  if (strategies.isError) return <div className={styles.error}>Couldn&apos;t load saved strategies.</div>;
  const items = strategies.data ?? [];
  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        No saved strategies yet. Build one and hit <b>Save strategy</b> — it&apos;ll appear here, fully reproducible and one-click editable.
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {items.map((s) => {
        const c = s.config as unknown as BuilderConfig;
        const uni = UNIVERSE_NAMES[c.index_id] ?? `Index ${c.index_id}`;
        const nFilters = Array.isArray(c.filters) ? c.filters.length : 0;
        return (
          <div key={s.id} className={styles.row}>
            <div className={styles.rowMain}>
              <div className={styles.rowName}>{s.name}</div>
              <div className={styles.rowMeta}>
                {uni} · {nFilters} filter{nFilters === 1 ? "" : "s"} · {c.frequency ?? "—"} rebalance · {c.weighting?.scheme ?? "—"} weighted
              </div>
            </div>
            <div className={styles.rowActions}>
              <button className={styles.openBtn} onClick={() => onLoad(c)}>Open / Edit →</button>
              <button
                className={styles.delBtn}
                title="Delete"
                disabled={del.isPending}
                onClick={() => {
                  if (window.confirm(`Delete "${s.name}"?`)) del.mutate(s.id);
                }}
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
