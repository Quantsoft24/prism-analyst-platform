"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import BuilderView, { type BuilderConfig } from "./BuilderView";
import DetailedBacktestView from "./DetailedBacktestView";
import FactorBuilderView from "./FactorBuilderView";
import SavedResultsView from "./SavedResultsView";
import styles from "./portfolio.module.css";

type Sub = "builder" | "factor" | "saved";

const SUBS: [Sub, string][] = [
  ["builder", "Portfolio Builder"],
  ["factor", "Factor Builder"],
  ["saved", "Saved Results"],
];

/**
 * Systematic Portfolio Builder — the parent surface. Portfolio Builder is the
 * primary screen; Factor Builder and Saved Results are nested sub-sections
 * (there is no standalone backtest nav — you reach a backtest by building one).
 */
export default function PortfolioView() {
  const [sub, setSub] = React.useState<Sub>("builder");
  const [initialCfg, setInitialCfg] = React.useState<BuilderConfig | undefined>(undefined);
  const [builderKey, setBuilderKey] = React.useState(0);
  const [backtestCfg, setBacktestCfg] = React.useState<BuilderConfig | null>(null);

  const loadStrategy = React.useCallback((cfg: BuilderConfig) => {
    setInitialCfg(cfg);
    setBuilderKey((k) => k + 1);
    setBacktestCfg(null);
    setSub("builder");
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Systematic <em>Portfolio Builder</em>
        </h1>
        <p className={styles.subtitle}>
          Define a universe, stack factor filters, set institutional rebalancing rules, and preview the
          book — every field maps to a live, point-in-time-correct table in your equities database.
        </p>
        {!backtestCfg && (
          <nav className={styles.subnav}>
            {SUBS.map(([id, label]) => (
              <button
                key={id}
                className={cn(styles.subnavBtn, sub === id && styles.subnavActive)}
                onClick={() => setSub(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {backtestCfg ? (
        <DetailedBacktestView cfg={backtestCfg} onBack={() => setBacktestCfg(null)} />
      ) : sub === "builder" ? (
        <BuilderView key={builderKey} initialConfig={initialCfg} onOpenBacktest={setBacktestCfg} />
      ) : sub === "factor" ? (
        <FactorBuilderView />
      ) : (
        <SavedResultsView onLoad={loadStrategy} />
      )}
    </div>
  );
}
