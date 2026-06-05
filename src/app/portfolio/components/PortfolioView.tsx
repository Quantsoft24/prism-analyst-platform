"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

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
const SUB_IDS = new Set<string>(SUBS.map(([id]) => id));

type OpenBacktest = { cfg?: BuilderConfig; jobId?: string };

/** Build the `/portfolio?...` URL for a given tab + optionally an open backtest
 *  job, so the active sub-view survives a refresh / is shareable. */
function tabUrl(sub: Sub, jobId?: string | null): string {
  const qs = new URLSearchParams({ tab: sub });
  if (jobId) qs.set("job", jobId);
  return `/portfolio?${qs.toString()}`;
}

/**
 * Systematic Portfolio Builder — the parent surface. Portfolio Builder is the
 * primary screen; Factor Builder, Saved Results, and Backtests are nested
 * sub-sections. A backtest is reached by building one (or reopened from the
 * Backtests list, so an in-progress run is always recoverable).
 *
 * The active sub-tab — and an open existing backtest — are mirrored to the URL
 * (`?tab=…&job=…`) so a refresh restores the same view instead of snapping back
 * to Portfolio Builder. We read the URL client-side (not `useSearchParams`) to
 * keep the route statically prerenderable.
 */
export default function PortfolioView() {
  const router = useRouter();
  const [sub, setSub] = React.useState<Sub>("builder");
  const [initialCfg, setInitialCfg] = React.useState<BuilderConfig | undefined>(undefined);
  const [builderKey, setBuilderKey] = React.useState(0);
  const [backtest, setBacktest] = React.useState<OpenBacktest | null>(null);

  // Hydrate the view from the URL once on mount (refresh / shared link).
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab");
    if (t && SUB_IDS.has(t)) setSub(t as Sub);
    const job = p.get("job");
    if (job) setBacktest({ jobId: job });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goSub = React.useCallback((s: Sub) => {
    setSub(s);
    setBacktest(null);
    router.replace(tabUrl(s), { scroll: false });
  }, [router]);

  const openBacktest = React.useCallback((open: OpenBacktest) => {
    setBacktest(open);
    // Only an existing job has a stable, reopenable id to put in the URL.
    if (open.jobId) router.replace(tabUrl("backtests", open.jobId), { scroll: false });
  }, [router]);

  const closeBacktest = React.useCallback(() => {
    setBacktest(null);
    router.replace(tabUrl(sub), { scroll: false });
  }, [router, sub]);

  const loadStrategy = React.useCallback((cfg: BuilderConfig) => {
    setInitialCfg(cfg);
    setBuilderKey((k) => k + 1);
    setBacktest(null);
    setSub("builder");
    router.replace(tabUrl("builder"), { scroll: false });
  }, [router]);

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
              <button key={id} className={cn(styles.subnavBtn, sub === id && styles.subnavActive)} onClick={() => goSub(id)}>
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
          onOpenBacktest={(cfg) => openBacktest({ cfg })}
          onAddCustomFactor={() => goSub("factor")}
        />
      </div>

      {backtest ? (
        <DetailedBacktestView cfg={backtest.cfg} existingJobId={backtest.jobId} onBack={closeBacktest} />
      ) : sub === "factor" ? (
        <FactorBuilderView />
      ) : sub === "saved" ? (
        <SavedResultsView onLoad={loadStrategy} />
      ) : sub === "backtests" ? (
        <BacktestsListView onOpen={(jobId) => openBacktest({ jobId })} />
      ) : null}
    </div>
  );
}
