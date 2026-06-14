"use client";

import * as React from "react";

import {
  formatMetric,
  useMovers,
  type MoverKind,
  type MoverRow,
  type Security,
} from "@/lib/api/stocks";
import { cn } from "@/lib/utils";

import styles from "./stocks.module.css";

const TABS: { kind: MoverKind; label: string }[] = [
  { kind: "gainers", label: "Gainers" },
  { kind: "losers", label: "Losers" },
  { kind: "most_active", label: "Most active" },
];

/** A movers row carries everything the dashboard needs to open the security. */
function moverToSecurity(m: MoverRow): Security {
  return {
    security_id: m.security_id,
    security_name: m.security_name,
    symbol: m.symbol,
    isin: null,
    exchange: m.exchange,
    sector: m.sector,
  };
}

/**
 * Top movers for the latest session over the Nifty 200 universe — Gainers /
 * Losers / Most-active tabs. A row click opens that security's full dashboard.
 */
export default function TopMovers({ onSelect }: { onSelect: (s: Security) => void }) {
  const [kind, setKind] = React.useState<MoverKind>("gainers");
  const { data, isLoading, isError } = useMovers(kind, 8);
  const movers = data?.movers ?? [];

  return (
    <section className={styles.moversCard}>
      <div className={styles.moversHead}>
        <h3 className={styles.ovTitle}>Top movers</h3>
        <span className={styles.moversUniverse}>{data?.universe ?? "Nifty 200"}</span>
      </div>

      <div className={styles.moversTabs}>
        {TABS.map((t) => (
          <button
            key={t.kind}
            className={cn(styles.moverTab, kind === t.kind && styles.moverTabActive)}
            onClick={() => setKind(t.kind)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isError ? (
        <div className={styles.moversNote}>Movers are unavailable right now.</div>
      ) : isLoading ? (
        <div className={styles.moversList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.moverSkeleton} />
          ))}
        </div>
      ) : movers.length === 0 ? (
        <div className={styles.moversNote}>No movers for the latest session.</div>
      ) : (
        <div className={styles.moversList}>
          {movers.map((m, i) => (
            <button
              key={m.security_id}
              className={styles.moverRow}
              onClick={() => onSelect(moverToSecurity(m))}
            >
              <span className={styles.moverRank}>{i + 1}</span>
              <span className={styles.moverMain}>
                <span className={styles.moverSym}>{m.symbol ?? m.security_name}</span>
                <span className={styles.moverName}>{m.security_name}</span>
              </span>
              <span className={styles.moverNums}>
                <span className={styles.moverClose}>
                  {m.close != null ? formatMetric(m.close, "price") : "—"}
                </span>
                {kind === "most_active" ? (
                  <span className={styles.moverValue}>
                    {m.trade_value != null ? formatMetric(m.trade_value, "value") : "—"}
                  </span>
                ) : (
                  m.change_pct != null && (
                    <span
                      className={cn(
                        styles.moverChange,
                        m.change_pct >= 0 ? styles.posText : styles.negText,
                      )}
                    >
                      {m.change_pct >= 0 ? "+" : ""}
                      {m.change_pct.toFixed(2)}%
                    </span>
                  )
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
