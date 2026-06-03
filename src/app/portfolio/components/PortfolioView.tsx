"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import BacktestsListView from "./BacktestsListView";
import BuilderView, { type BuilderConfig } from "./BuilderView";
import DetailedBacktestView from "./DetailedBacktestView";
import FactorBuilderView from "./FactorBuilderView";
import SavedResultsView from "./SavedResultsView";
import styles from "./portfolio.module.css";

type Sub = "builder" | "factor" | "saved" | "backtests";

const SUBS: [Sub, string][] = [
  ["builder", "Portfolio Builder"],
  ["factor", "Factor Builder"],
  ["saved", "Saved Results"],
  ["backtests", "Backtests"],
];

type OpenBacktest = { cfg?: BuilderConfig; jobId?: string };

/**
 * Systematic Portfolio Builder — the parent surface. Portfolio Builder is the
 * primary screen; Factor Builder, Saved Results, and Backtests are nested
 * sub-sections. A backtest is reached by building one (or reopened from the
 * Backtests list, so an in-progress run is always recoverable).
 */
export default function PortfolioView() {
  const [sub, setSub] = React.useState<Sub>("builder");
  const [initialCfg, setInitialCfg] = React.useState<BuilderConfig | undefined>(undefined);
  const [builderKey, setBuilderKey] = React.useState(0);
  const [backtest, setBacktest] = React.useState<OpenBacktest | null>(null);

  const loadStrategy = React.useCallback((cfg: BuilderConfig) => {
    setInitialCfg(cfg);
    setBuilderKey((k) => k + 1);
    setBacktest(null);
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
        {!backtest && (
          <nav className={styles.subnav}>
            {SUBS.map(([id, label]) => (
              <button key={id} className={cn(styles.subnavBtn, sub === id && styles.subnavActive)} onClick={() => setSub(id)}>
                {label}
              </button>
            ))}
          </nav>
        )}
      </header>

      {/* Builder stays mounted (hidden, not unmounted) so a built portfolio —
          the suggested-holdings table — survives navigating to other sub-views
          or opening a backtest and coming back. */}
      <div hidden={!!backtest || sub !== "builder"}>
        <BuilderView
          key={builderKey}
          initialConfig={initialCfg}
          onOpenBacktest={(cfg) => setBacktest({ cfg })}
          onAddCustomFactor={() => setSub("factor")}
        />
      </div>

      {backtest ? (
        <DetailedBacktestView cfg={backtest.cfg} existingJobId={backtest.jobId} onBack={() => setBacktest(null)} />
      ) : sub === "factor" ? (
        <FactorBuilderView />
      ) : sub === "saved" ? (
        <SavedResultsView onLoad={loadStrategy} />
      ) : sub === "backtests" ? (
        <BacktestsListView onOpen={(jobId) => setBacktest({ jobId })} />
      ) : null}
    </div>
  );
}
