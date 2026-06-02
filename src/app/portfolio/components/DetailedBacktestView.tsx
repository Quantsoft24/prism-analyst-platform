"use client";

import * as React from "react";

import {
  pct,
  useBacktest,
  useSubmitBacktest,
  type BacktestMetrics,
  type CustomFactorSpec,
} from "@/lib/api/portfolio";
import { cn } from "@/lib/utils";

import type { BuilderConfig } from "./BuilderView";
import styles from "./backtest.module.css";

function isoYearsAgo(y: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - y);
  return d.toISOString().slice(0, 10);
}

/** Build a backtest request from the builder config. */
function toBacktestRequest(cfg: BuilderConfig, start: string, end: string) {
  return {
    index_id: cfg.index_id,
    start,
    end,
    frequency: cfg.frequency,
    filters: cfg.filters,
    weighting: {
      scheme: cfg.weighting.scheme,
      score_factor_id: cfg.weighting.score_factor_id,
      max_weight: cfg.weighting.max_weight,
    },
    basis: cfg.basis,
    custom_factors: cfg.custom_factors as CustomFactorSpec[],
    name: null,
  };
}

export default function DetailedBacktestView({
  cfg,
  onBack,
}: {
  cfg: BuilderConfig;
  onBack: () => void;
}) {
  const submit = useSubmitBacktest();
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"nav" | "holdings" | "drawdown" | "sectors">("nav");
  const [range] = React.useState({ start: isoYearsAgo(7), end: new Date().toISOString().slice(0, 10) });

  // Submit once on mount.
  React.useEffect(() => {
    submit.mutate(toBacktestRequest(cfg, range.start, range.end), {
      onSuccess: (job) => setJobId(job.id),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const job = useBacktest(jobId);
  const data = job.data;
  const status = data?.status;
  const result = data?.result ?? null;

  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <button className={styles.back} onClick={onBack}>← Back to builder</button>
        <span className={styles.crumb}>Detailed backtest · {range.start} → {range.end}</span>
      </div>

      {(submit.isPending || status === "queued" || status === "running") && (
        <div className={styles.progressCard}>
          <div className={styles.progressHead}>
            <span className={styles.spinner} />
            <span>{data?.stage ?? "Submitting…"}</span>
            <span className={styles.progressPct}>{Math.round((data?.progress ?? 0) * 100)}%</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${Math.round((data?.progress ?? 0) * 100)}%` }} />
          </div>
          <p className={styles.progressNote}>
            Running point-in-time over history — rebuilding the universe, factors and weights at each rebalance. This runs on a worker; you can leave and come back.
          </p>
        </div>
      )}

      {(submit.isError || status === "failed") && (
        <div className={styles.errorBox}>
          Backtest failed: {data?.error ?? (submit.error as Error)?.message ?? "unknown error"}
        </div>
      )}

      {status === "succeeded" && result && (
        <>
          <div className={styles.tabs}>
            {([["nav", "NAV & metrics"], ["holdings", "Holdings by date"], ["drawdown", "Drawdown"], ["sectors", "Sector exposure"]] as const).map(
              ([id, label]) => (
                <button key={id} className={cn(styles.tab, tab === id && styles.tabActive)} onClick={() => setTab(id)}>
                  {label}
                </button>
              ),
            )}
          </div>

          {tab === "nav" && (
            <>
              <NavChart dates={result.dates} nav={result.nav} bench={result.benchmark_nav} />
              <div className={styles.metricsGrid}>
                <MetricCard title="Portfolio" m={result.metrics} accent />
                <MetricCard title="Benchmark" m={result.benchmark_metrics} />
              </div>
              <RebalancesPreview rebalances={result.rebalances} />
            </>
          )}
          {tab === "holdings" && <HoldingsTab rebalances={result.rebalances} />}
          {tab === "drawdown" && <DrawdownChart dates={result.dates} drawdown={result.drawdown} maxDd={result.metrics.max_drawdown} />}
          {tab === "sectors" && <SectorTab rebalances={result.rebalances} />}

          {result.notes.length > 0 && (
            <ul className={styles.notes}>{result.notes.map((n, i) => (<li key={i}>{n}</li>))}</ul>
          )}
        </>
      )}
    </div>
  );
}

function NavChart({ dates, nav, bench }: { dates: string[]; nav: number[]; bench: number[] }) {
  const W = 760, H = 240, P = 8;
  const all = [...nav, ...bench].filter((v) => Number.isFinite(v));
  if (all.length < 2) return null;
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const n = nav.length;
  const x = (i: number) => P + (i / (n - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / span) * (H - 2 * P);
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = (arr: number[]) => arr[arr.length - 1];
  const total = (arr: number[]) => (last(arr) / arr[0] - 1);
  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHead}>
        <span className={styles.chartTitle}>Growth of ₹1</span>
        <div className={styles.legend}>
          <span className={styles.legPort}>● Portfolio {pct(total(nav))}</span>
          <span className={styles.legBench}>● Benchmark {pct(total(bench))}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg} preserveAspectRatio="none">
        <path d={path(bench)} className={styles.lineBench} />
        <path d={path(nav)} className={styles.linePort} />
      </svg>
      <div className={styles.chartAxis}>
        <span>{dates[0]}</span>
        <span>{dates[dates.length - 1]}</span>
      </div>
    </div>
  );
}

function MetricCard({ title, m, accent }: { title: string; m: BacktestMetrics; accent?: boolean }) {
  return (
    <div className={cn(styles.metricCard, accent && styles.metricCardAccent)}>
      <div className={styles.metricTitle}>{title}</div>
      <div className={styles.metricRows}>
        <Metric label="Total" v={pct(m.total_return)} />
        <Metric label="CAGR" v={pct(m.cagr)} />
        <Metric label="Volatility" v={pct(m.ann_vol)} />
        <Metric label="Sharpe" v={m.sharpe.toFixed(2)} />
        <Metric label="Max DD" v={pct(m.max_drawdown)} neg />
      </div>
    </div>
  );
}

function Metric({ label, v, neg }: { label: string; v: string; neg?: boolean }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={cn(styles.metricVal, neg && styles.metricNeg)}>{v}</span>
    </div>
  );
}

function HoldingsTab({ rebalances }: { rebalances: import("@/lib/api/portfolio").RebalanceSnap[] }) {
  const [idx, setIdx] = React.useState(rebalances.length - 1);
  const r = rebalances[Math.min(idx, rebalances.length - 1)];
  if (!r) return null;
  const maxW = Math.max(...r.holdings.map((h) => h.weight), 0.0001);
  return (
    <div className={styles.holdCard}>
      <div className={styles.holdHead}>
        <span className={styles.holdTitle}>Holdings on the rebalance date</span>
        <select className={styles.holdSel} value={idx} onChange={(e) => setIdx(Number(e.target.value))}>
          {rebalances.map((rb, i) => (<option key={rb.date} value={i}>{rb.date} · {rb.n_holdings} names</option>))}
        </select>
      </div>
      <div className={styles.holdSub}>
        {r.n_holdings} names · turnover {pct(r.turnover, 0)} ·{" "}
        <span className={styles.newTag}>NEW</span> = entered this rebalance vs. prior
      </div>
      <div className={styles.holdList}>
        {r.holdings.map((h) => (
          <div key={h.security_id} className={styles.holdRow}>
            <span className={styles.holdSym}>
              {h.symbol ?? h.security_id}
              {h.is_new && <span className={styles.newTag}>NEW</span>}
            </span>
            <span className={styles.holdSec}>{h.sector ?? "—"}</span>
            <span className={styles.holdBar}>
              <span className={styles.holdBarFill} style={{ width: `${(h.weight / maxW) * 100}%` }} />
            </span>
            <span className={styles.holdW}>{pct(h.weight, 2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawdownChart({ dates, drawdown, maxDd }: { dates: string[]; drawdown: number[]; maxDd: number }) {
  const W = 760, H = 220, P = 8;
  if (drawdown.length < 2) return null;
  const min = Math.min(...drawdown, 0); // most negative
  const n = drawdown.length;
  const x = (i: number) => P + (i / (n - 1)) * (W - 2 * P);
  const y = (v: number) => P + (v / (min || -1)) * (H - 2 * P); // v in [min,0] → [H,P] inverted: 0 at top
  const area = `M${x(0)},${P} ` + drawdown.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ") + ` L${x(n - 1)},${P} Z`;
  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHead}>
        <span className={styles.chartTitle}>Underwater (drawdown) curve</span>
        <span className={styles.legBench}>Max drawdown {pct(maxDd)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.chartSvg} preserveAspectRatio="none">
        <path d={area} className={styles.ddArea} />
      </svg>
      <div className={styles.chartAxis}><span>{dates[0]}</span><span>{dates[dates.length - 1]}</span></div>
    </div>
  );
}

function SectorTab({ rebalances }: { rebalances: import("@/lib/api/portfolio").RebalanceSnap[] }) {
  const latest = rebalances[rebalances.length - 1];
  const bySector = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const h of latest?.holdings ?? []) {
      const s = h.sector ?? "Unclassified";
      m.set(s, (m.get(s) ?? 0) + h.weight);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [latest]);
  if (!latest) return null;
  const max = Math.max(...bySector.map(([, w]) => w), 0.0001);
  return (
    <div className={styles.holdCard}>
      <div className={styles.holdHead}>
        <span className={styles.holdTitle}>Sector exposure</span>
        <span className={styles.holdSel}>at {latest.date}</span>
      </div>
      <div className={styles.sectorList}>
        {bySector.map(([s, w]) => (
          <div key={s} className={styles.sectorRow}>
            <span className={styles.sectorName}>{s}</span>
            <span className={styles.sectorBar}><span className={styles.sectorBarFill} style={{ width: `${(w / max) * 100}%` }} /></span>
            <span className={styles.sectorW}>{pct(w, 1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RebalancesPreview({ rebalances }: { rebalances: { date: string; n_holdings: number; turnover: number }[] }) {
  if (!rebalances.length) return null;
  return (
    <div className={styles.rebalCard}>
      <div className={styles.rebalHead}>Rebalances <span className={styles.rebalSub}>· {rebalances.length} cycles</span></div>
      <div className={styles.rebalRow}>
        {rebalances.map((r) => (
          <span key={r.date} className={styles.rebalChip} title={`${r.n_holdings} holdings · turnover ${pct(r.turnover, 0)}`}>
            {r.date} · {r.n_holdings}
          </span>
        ))}
      </div>
    </div>
  );
}
