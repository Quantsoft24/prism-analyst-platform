"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import Dropdown, { type DropdownOption } from "@/components/Dropdown";
import {
  pct,
  useBacktest,
  useFactors,
  useIndexSeries,
  useSubmitBacktest,
  useUniverses,
  type Attribution,
  type BacktestMetrics,
  type Contributor,
  type CustomFactorSpec,
  type FactorTilt,
  type RebalanceSnap,
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

// ── Client-side analytics (so a switched benchmark / relative view recompute
//    without a re-run) ──────────────────────────────────────────────────────
function drawdownOf(series: number[]): number[] {
  let peak = -Infinity;
  return series.map((v) => {
    peak = Math.max(peak, v);
    return peak > 0 ? v / peak - 1 : 0;
  });
}

/** Portfolio vs benchmark, both rebased to 1 at the start (out/under-perf). */
function relativeOf(nav: number[], bench: number[]): number[] {
  const n0 = nav[0] || 1;
  const b0 = bench[0] || 1;
  return nav.map((v, i) => (v / n0) / ((bench[i] || b0) / b0));
}

function clientMetrics(nav: number[]): BacktestMetrics {
  const n = nav.length;
  const total = n > 1 ? nav[n - 1] / nav[0] - 1 : 0;
  const years = Math.max(n / 252, 1e-9);
  const cagr = n > 1 ? (nav[n - 1] / nav[0]) ** (1 / years) - 1 : 0;
  const rets: number[] = [];
  for (let i = 1; i < n; i++) if (nav[i - 1] > 0) rets.push(nav[i] / nav[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length || 1);
  const annVol = Math.sqrt(variance) * Math.sqrt(252);
  const dd = drawdownOf(nav);
  return {
    total_return: total,
    cagr,
    ann_vol: annVol,
    sharpe: annVol > 0 ? cagr / annVol : 0,
    max_drawdown: Math.min(0, ...dd),
    best_day: Math.max(0, ...rets),
    worst_day: Math.min(0, ...rets),
    n_days: n,
  };
}

/** Re-base a fetched index NAV series onto the result's date axis, normalised
 *  to 1 at the first date (forward-filling any calendar gaps). */
function alignBenchmark(resultDates: string[], seriesDates: string[], seriesNav: number[]): number[] {
  const m = new Map<string, number>();
  for (let i = 0; i < seriesDates.length; i++) m.set(seriesDates[i], seriesNav[i]);
  const out: number[] = [];
  let last = NaN;
  for (const d of resultDates) {
    const v = m.get(d);
    if (v !== undefined && Number.isFinite(v)) last = v;
    out.push(last);
  }
  // back-fill leading NaNs with the first finite value, then normalise to 1.
  const firstFinite = out.find((v) => Number.isFinite(v)) ?? 1;
  for (let i = 0; i < out.length; i++) if (!Number.isFinite(out[i])) out[i] = firstFinite;
  const base = out[0] || 1;
  return out.map((v) => v / base);
}

type NavMode = "absolute" | "relative";

export default function DetailedBacktestView({
  cfg,
  existingJobId,
  onBack,
}: {
  cfg?: BuilderConfig;        // a new run (submitted on mount)…
  existingJobId?: string;     // …or resume an existing job by id
  onBack: () => void;
}) {
  const submit = useSubmitBacktest();
  const [jobId, setJobId] = React.useState<string | null>(existingJobId ?? null);
  const [tab, setTab] = React.useState<"nav" | "holdings" | "drawdown" | "attribution">("nav");
  const [range] = React.useState({ start: isoYearsAgo(7), end: new Date().toISOString().slice(0, 10) });

  // New run → submit once on mount. Resume → just poll the given id.
  React.useEffect(() => {
    if (existingJobId || !cfg) return;
    submit.mutate(toBacktestRequest(cfg, range.start, range.end), {
      onSuccess: (job) => setJobId(job.id),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const job = useBacktest(jobId);
  const data = job.data;
  const status = data?.status;
  const result = data?.result ?? null;
  const spec = data?.spec as { start?: string; end?: string; index_id?: number; benchmark_index_id?: number | null } | undefined;
  const shownRange = { start: spec?.start ?? range.start, end: spec?.end ?? range.end };
  const defaultBenchId = spec?.benchmark_index_id ?? spec?.index_id ?? null;

  return (
    <div className={styles.wrap}>
      <div className={styles.topbar}>
        <button className={styles.back} onClick={onBack}>← Back to builder</button>
        <span className={styles.crumb}>Detailed backtest · {shownRange.start} → {shownRange.end}</span>
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
            {([["nav", "NAV & metrics"], ["holdings", "Holdings by date"], ["drawdown", "Drawdown"], ["attribution", "Attribution"]] as const).map(
              ([id, label]) => (
                <button key={id} className={cn(styles.tab, tab === id && styles.tabActive)} onClick={() => setTab(id)}>
                  {label}
                </button>
              ),
            )}
          </div>

          {tab === "nav" && (
            <NavTab
              dates={result.dates}
              nav={result.nav}
              benchNav={result.benchmark_nav}
              defaultBenchId={defaultBenchId}
              portMetrics={result.metrics}
            />
          )}
          {tab === "holdings" && <HoldingsTab rebalances={result.rebalances} />}
          {tab === "drawdown" && (
            <DrawdownTab dates={result.dates} nav={result.nav} bench={result.benchmark_nav} absDrawdown={result.drawdown} />
          )}
          {tab === "attribution" && (result.attribution ? <AttributionTab a={result.attribution} /> : <SectorTab rebalances={result.rebalances} />)}

          {result.notes.length > 0 && (
            <ul className={styles.notes}>{result.notes.map((n, i) => (<li key={i}>{n}</li>))}</ul>
          )}
        </>
      )}
    </div>
  );
}

// ── NAV tab: benchmark selector + absolute/relative toggle ───────────────────
function NavTab({
  dates,
  nav,
  benchNav,
  defaultBenchId,
  portMetrics,
}: {
  dates: string[];
  nav: number[];
  benchNav: number[];
  defaultBenchId: number | null;
  portMetrics: BacktestMetrics;
}) {
  const universes = useUniverses();
  const [benchId, setBenchId] = React.useState<number | null>(defaultBenchId);
  const [mode, setMode] = React.useState<NavMode>("absolute");

  const isDefault = benchId === defaultBenchId;
  const series = useIndexSeries(benchId, dates[0] ?? "", dates[dates.length - 1] ?? "", !isDefault && benchId != null);

  const activeBench = React.useMemo(() => {
    if (isDefault) return benchNav;
    if (series.data) return alignBenchmark(dates, series.data.dates, series.data.nav);
    return benchNav; // until the switched series loads
  }, [isDefault, benchNav, series.data, dates]);

  const benchName =
    universes.data?.find((u) => u.index_id === benchId)?.index_name ?? "Benchmark";
  const benchMetrics = React.useMemo(() => clientMetrics(activeBench), [activeBench]);

  const benchOptions: DropdownOption<string>[] =
    universes.data?.map((u) => ({ value: String(u.index_id), label: u.index_name ?? `Index ${u.index_id}` })) ?? [];

  return (
    <>
      <div className={styles.chartToolbar}>
        <div className={styles.toolbarGroup}>
          <span className={styles.toolbarLabel}>Benchmark</span>
          <Dropdown
            value={String(benchId ?? "")}
            options={benchOptions}
            onChange={(v) => setBenchId(Number(v))}
            ariaLabel="Benchmark index"
            minWidth={150}
          />
        </div>
        <div className={styles.segmented}>
          {(["absolute", "relative"] as const).map((m) => (
            <button key={m} className={cn(styles.segBtn, mode === m && styles.segActive)} onClick={() => setMode(m)}>
              {m === "absolute" ? "Absolute" : "Relative to benchmark"}
            </button>
          ))}
        </div>
      </div>

      {mode === "absolute" ? (
        <NavChart dates={dates} nav={nav} bench={activeBench} benchName={benchName} loading={series.isFetching && !isDefault} />
      ) : (
        <RelativeChart dates={dates} nav={nav} bench={activeBench} benchName={benchName} loading={series.isFetching && !isDefault} />
      )}

      <div className={styles.metricsGrid}>
        <MetricCard title="Portfolio" m={portMetrics} accent />
        <MetricCard title={benchName} m={benchMetrics} />
      </div>
    </>
  );
}

// ── Shared SVG chart scaffolding (gridlines + hover guide + tooltip) ─────────
const CW = 820, CH = 260, CP = 10;

function useHover(n: number) {
  const [idx, setIdx] = React.useState<number | null>(null);
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    setIdx(Math.round(frac * (n - 1)));
  };
  const clear = () => setIdx(null);
  return { idx, onMove, clear };
}

function GridLines() {
  return (
    <g className={styles.grid}>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={CP} x2={CW - CP} y1={CP + f * (CH - 2 * CP)} y2={CP + f * (CH - 2 * CP)} />
      ))}
    </g>
  );
}

function NavChart({
  dates, nav, bench, benchName, loading,
}: { dates: string[]; nav: number[]; bench: number[]; benchName: string; loading: boolean }) {
  const all = [...nav, ...bench].filter((v) => Number.isFinite(v));
  const hover = useHover(nav.length);
  if (all.length < 2) return null;
  const min = Math.min(...all), max = Math.max(...all);
  const span = max - min || 1;
  const n = nav.length;
  const x = (i: number) => CP + (i / (n - 1)) * (CW - 2 * CP);
  const y = (v: number) => CH - CP - ((v - min) / span) * (CH - 2 * CP);
  const path = (arr: number[]) => arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPath = `${path(nav)} L${x(n - 1).toFixed(1)},${CH - CP} L${x(0).toFixed(1)},${CH - CP} Z`;
  const total = (arr: number[]) => (arr[arr.length - 1] / arr[0] - 1);
  const hi = hover.idx;

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHead}>
        <span className={styles.chartTitle}>Growth of ₹1{loading ? " · loading benchmark…" : ""}</span>
        <div className={styles.legend}>
          <span className={styles.legPort}>● Portfolio {pct(total(nav))}</span>
          <span className={styles.legBench}>● {benchName} {pct(total(bench))}</span>
        </div>
      </div>
      <div className={styles.chartBody} onMouseMove={hover.onMove} onMouseLeave={hover.clear}>
        <svg viewBox={`0 0 ${CW} ${CH}`} className={styles.chartSvg} preserveAspectRatio="none">
          <defs>
            <linearGradient id="navfill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" className={styles.navGradTop} />
              <stop offset="100%" className={styles.navGradBot} />
            </linearGradient>
          </defs>
          <GridLines />
          <path d={areaPath} fill="url(#navfill)" stroke="none" />
          <path d={path(bench)} className={styles.lineBench} />
          <path d={path(nav)} className={styles.linePort} />
          {hi != null && <line className={styles.hoverGuide} x1={x(hi)} x2={x(hi)} y1={CP} y2={CH - CP} />}
        </svg>
        {hi != null && (
          <Tooltip
            frac={hi / (n - 1)}
            date={dates[hi]}
            rows={[
              { label: "Portfolio", val: pct(nav[hi] / nav[0] - 1), cls: styles.tipPort },
              { label: benchName, val: pct(bench[hi] / bench[0] - 1), cls: styles.tipBench },
            ]}
          />
        )}
      </div>
      <div className={styles.chartAxis}><span>{dates[0]}</span><span>{dates[dates.length - 1]}</span></div>
    </div>
  );
}

function RelativeChart({
  dates, nav, bench, benchName, loading,
}: { dates: string[]; nav: number[]; bench: number[]; benchName: string; loading: boolean }) {
  const rel = React.useMemo(() => relativeOf(nav, bench), [nav, bench]);
  const hover = useHover(rel.length);
  const finite = rel.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return null;
  const min = Math.min(...finite, 1), max = Math.max(...finite, 1);
  const span = max - min || 1;
  const n = rel.length;
  const x = (i: number) => CP + (i / (n - 1)) * (CW - 2 * CP);
  const y = (v: number) => CH - CP - ((v - min) / span) * (CH - 2 * CP);
  const line = rel.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const baseY = y(1);
  const hi = hover.idx;
  const outperf = rel[n - 1] - 1;

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHead}>
        <span className={styles.chartTitle}>Relative performance vs {benchName}{loading ? " · loading…" : ""}</span>
        <div className={styles.legend}>
          <span className={cn(styles.legPort, outperf < 0 && styles.legNeg)}>
            {outperf >= 0 ? "Outperformed " : "Underperformed "}{pct(Math.abs(outperf))}
          </span>
        </div>
      </div>
      <div className={styles.chartBody} onMouseMove={hover.onMove} onMouseLeave={hover.clear}>
        <svg viewBox={`0 0 ${CW} ${CH}`} className={styles.chartSvg} preserveAspectRatio="none">
          <GridLines />
          <line className={styles.baseLine} x1={CP} x2={CW - CP} y1={baseY} y2={baseY} />
          <path d={line} className={styles.linePort} />
          {hi != null && <line className={styles.hoverGuide} x1={x(hi)} x2={x(hi)} y1={CP} y2={CH - CP} />}
        </svg>
        {hi != null && (
          <Tooltip
            frac={hi / (n - 1)}
            date={dates[hi]}
            rows={[{ label: "Relative", val: pct(rel[hi] - 1), cls: styles.tipPort }]}
          />
        )}
      </div>
      <div className={styles.chartAxis}><span>{dates[0]}</span><span>{dates[dates.length - 1]}</span></div>
    </div>
  );
}

function Tooltip({
  frac, date, rows,
}: { frac: number; date: string; rows: { label: string; val: string; cls: string }[] }) {
  const clamped = Math.min(Math.max(frac, 0.08), 0.92); // keep inside the card
  return (
    <div className={styles.tooltip} style={{ left: `${clamped * 100}%` }}>
      <div className={styles.tipDate}>{date}</div>
      {rows.map((r) => (
        <div key={r.label} className={styles.tipRow}>
          <span className={cn(styles.tipDot, r.cls)} />
          <span className={styles.tipLabel}>{r.label}</span>
          <span className={styles.tipVal}>{r.val}</span>
        </div>
      ))}
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

function HoldingsTab({ rebalances }: { rebalances: RebalanceSnap[] }) {
  const router = useRouter();
  const [idx, setIdx] = React.useState(rebalances.length - 1);
  const r = rebalances[Math.min(idx, rebalances.length - 1)];
  const dateOptions: DropdownOption<string>[] = rebalances.map((rb, i) => ({
    value: String(i), label: `${rb.date} · ${rb.n_holdings} names`,
  }));
  if (!r) return null;
  const maxW = Math.max(...r.holdings.map((h) => h.weight), 0.0001);
  const openStock = (securityId: number) => router.push(`/stocks?security=${securityId}`);
  return (
    <div className={styles.holdCard}>
      <div className={styles.holdHead}>
        <span className={styles.holdTitle}>Holdings on the rebalance date</span>
        <Dropdown value={String(idx)} options={dateOptions} onChange={(v) => setIdx(Number(v))} ariaLabel="Rebalance date" minWidth={190} />
      </div>
      <div className={styles.holdSub}>
        {r.n_holdings} names · turnover {pct(r.turnover, 0)} ·{" "}
        <span className={styles.newTag}>NEW</span> = entered this rebalance vs. prior · click a symbol to open its Stock Dashboard
      </div>
      <div className={styles.holdList}>
        {r.holdings.map((h) => (
          <div key={h.security_id} className={styles.holdRow}>
            <button className={styles.holdSymLink} onClick={() => openStock(h.security_id)} title="Open in Stock Dashboard">
              {h.symbol ?? h.security_id}
              {h.is_new && <span className={styles.newTag}>NEW</span>}
            </button>
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

// ── Drawdown tab: absolute vs relative underwater ────────────────────────────
function DrawdownTab({
  dates, nav, bench, absDrawdown,
}: { dates: string[]; nav: number[]; bench: number[]; absDrawdown: number[] }) {
  const [mode, setMode] = React.useState<"absolute" | "relative">("absolute");
  const dd = React.useMemo(
    () => (mode === "absolute" ? absDrawdown : drawdownOf(relativeOf(nav, bench))),
    [mode, absDrawdown, nav, bench],
  );
  const maxDd = Math.min(0, ...dd);
  return (
    <>
      <div className={styles.chartToolbar}>
        <div className={styles.segmented}>
          {(["absolute", "relative"] as const).map((m) => (
            <button key={m} className={cn(styles.segBtn, mode === m && styles.segActive)} onClick={() => setMode(m)}>
              {m === "absolute" ? "Absolute" : "Relative to benchmark"}
            </button>
          ))}
        </div>
      </div>
      <DrawdownChart
        dates={dates}
        drawdown={dd}
        maxDd={maxDd}
        title={mode === "absolute" ? "Underwater (drawdown) curve" : "Relative drawdown vs benchmark"}
      />
    </>
  );
}

function DrawdownChart({ dates, drawdown, maxDd, title }: { dates: string[]; drawdown: number[]; maxDd: number; title: string }) {
  const hover = useHover(drawdown.length);
  if (drawdown.length < 2) return null;
  const min = Math.min(...drawdown, 0);
  const n = drawdown.length;
  const x = (i: number) => CP + (i / (n - 1)) * (CW - 2 * CP);
  const y = (v: number) => CP + (v / (min || -1)) * (CH - 2 * CP);
  const area = `M${x(0)},${CP} ` + drawdown.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ") + ` L${x(n - 1)},${CP} Z`;
  const hi = hover.idx;
  return (
    <div className={styles.chartCard}>
      <div className={styles.chartHead}>
        <span className={styles.chartTitle}>{title}</span>
        <span className={styles.legBench}>Max drawdown {pct(maxDd)}</span>
      </div>
      <div className={styles.chartBody} onMouseMove={hover.onMove} onMouseLeave={hover.clear}>
        <svg viewBox={`0 0 ${CW} ${CH}`} className={styles.chartSvg} preserveAspectRatio="none">
          <GridLines />
          <path d={area} className={styles.ddArea} />
          {hi != null && <line className={styles.hoverGuide} x1={x(hi)} x2={x(hi)} y1={CP} y2={CH - CP} />}
        </svg>
        {hi != null && (
          <Tooltip frac={hi / (n - 1)} date={dates[hi]} rows={[{ label: "Drawdown", val: pct(drawdown[hi]), cls: styles.tipNeg }]} />
        )}
      </div>
      <div className={styles.chartAxis}><span>{dates[0]}</span><span>{dates[dates.length - 1]}</span></div>
    </div>
  );
}

function SectorTab({ rebalances }: { rebalances: RebalanceSnap[] }) {
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

// ── Attribution: sector (abs + active), style lenses, factor tilts, contributors
function AttributionTab({ a }: { a: Attribution }) {
  const router = useRouter();
  const factors = useFactors();
  const factorName = React.useCallback(
    (id: string) => factors.data?.find((f) => f.id === id)?.name ?? id,
    [factors.data],
  );
  const maxSecAbs = Math.max(...a.sector_active.flatMap((s) => [s.portfolio, s.benchmark]), 0.0001);
  const styleTilts = a.style_tilts ?? [];
  const maxStyle = Math.max(...styleTilts.map((t) => Math.abs(t.exposure)), 1);
  const maxTilt = Math.max(...a.factor_tilts.map((t) => Math.abs(t.exposure)), 1);

  return (
    <div className={styles.attrWrap}>
      {/* Sector exposure: absolute portfolio vs benchmark + active */}
      <div className={styles.holdCard}>
        <div className={styles.holdTitle}>Sector exposure — absolute &amp; vs benchmark</div>
        <div className={styles.holdSub}>
          Portfolio vs benchmark (cap-weighted universe). Active = portfolio − benchmark, at {a.as_of}.
        </div>
        <div className={styles.secTable}>
          <div className={cn(styles.secTRow, styles.secTHead)}>
            <span>Sector</span><span className={styles.secTNum}>Portfolio</span>
            <span className={styles.secTNum}>Benchmark</span><span>Active</span>
          </div>
          {a.sector_active.map((s) => (
            <div key={s.sector} className={styles.secTRow}>
              <span className={styles.attrName}>{s.sector}</span>
              <span className={styles.secTNum}>
                <span className={styles.secMiniBar}><span className={styles.secMiniFill} style={{ width: `${(s.portfolio / maxSecAbs) * 100}%` }} /></span>
                {pct(s.portfolio, 1)}
              </span>
              <span className={styles.secTNum}>
                <span className={styles.secMiniBar}><span className={cn(styles.secMiniFill, styles.secMiniBench)} style={{ width: `${(s.benchmark / maxSecAbs) * 100}%` }} /></span>
                {pct(s.benchmark, 1)}
              </span>
              <span className={cn(styles.attrVal, s.active < 0 && styles.attrNeg)}>
                {s.active >= 0 ? "+" : ""}{(s.active * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Style exposure lenses */}
      {styleTilts.length > 0 && (
        <div className={styles.holdCard}>
          <div className={styles.holdTitle}>Style exposure</div>
          <div className={styles.holdSub}>Portfolio tilt to the classic equity styles (weighted-avg z-score vs the universe; ＋ = more of that style)</div>
          <div className={styles.attrList}>
            {styleTilts.map((t) => (
              <div key={t.factor_id} className={styles.attrRow}>
                <span className={styles.attrName}>{t.factor_id}</span>
                <DivergeBar value={t.exposure} max={maxStyle} />
                <span className={cn(styles.attrVal, t.exposure < 0 && styles.attrNeg)}>{t.exposure >= 0 ? "+" : ""}{t.exposure.toFixed(2)}σ</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strategy factor tilts */}
      {a.factor_tilts.length > 0 && (
        <div className={styles.holdCard}>
          <div className={styles.holdTitle}>Your factor tilts</div>
          <div className={styles.holdSub}>Exposure to the factors in your filters (weighted-avg z-score vs the universe)</div>
          <div className={styles.attrList}>
            {a.factor_tilts.map((t) => (
              <FactorTiltRow key={t.factor_id} t={t} name={factorName(t.factor_id)} max={maxTilt} />
            ))}
          </div>
        </div>
      )}

      <div className={styles.contribCols}>
        <ContribCol title="Top contributors" rows={a.top_contributors} onOpen={(id) => router.push(`/stocks?security=${id}`)} />
        <ContribCol title="Detractors" rows={a.bottom_contributors} onOpen={(id) => router.push(`/stocks?security=${id}`)} />
      </div>
    </div>
  );
}

function FactorTiltRow({ t, name, max }: { t: FactorTilt; name: string; max: number }) {
  return (
    <div className={styles.attrRow}>
      <span className={styles.attrName}>{name}</span>
      <DivergeBar value={t.exposure} max={max} />
      <span className={cn(styles.attrVal, t.exposure < 0 && styles.attrNeg)}>{t.exposure >= 0 ? "+" : ""}{t.exposure.toFixed(2)}σ</span>
    </div>
  );
}

function DivergeBar({ value, max }: { value: number; max: number }) {
  const frac = Math.min(Math.abs(value) / max, 1) * 50; // % of half-width
  return (
    <span className={styles.diverge}>
      <span className={styles.divergeMid} />
      <span
        className={cn(styles.divergeFill, value < 0 ? styles.divergeNeg : styles.divergePos)}
        style={value >= 0 ? { left: "50%", width: `${frac}%` } : { right: "50%", width: `${frac}%` }}
      />
    </span>
  );
}

function ContribCol({ title, rows, onOpen }: { title: string; rows: Contributor[]; onOpen: (id: number) => void }) {
  return (
    <div className={styles.holdCard}>
      <div className={styles.holdTitle}>{title}</div>
      <div className={styles.contribList}>
        {rows.map((c) => (
          <div key={c.security_id} className={styles.contribRow}>
            <button className={styles.contribSymLink} onClick={() => onOpen(c.security_id)} title="Open in Stock Dashboard">
              {c.symbol ?? c.security_id}
            </button>
            <span className={cn(styles.contribVal, c.contribution < 0 && styles.attrNeg)}>
              {c.contribution >= 0 ? "+" : ""}{(c.contribution * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
