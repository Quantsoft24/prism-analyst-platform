"use client";

import * as React from "react";

import {
  FREQUENCIES,
  OPERATORS,
  fmtFactor,
  pct,
  useCreateStrategy,
  useCustomFactors,
  useFactors,
  useScreenMutation,
  useUniverses,
  type CustomFactorSpec,
  type FilterSpec,
  type Frequency,
  type Operator,
  type ScreenResponse,
  type WeightScheme,
} from "@/lib/api/portfolio";
import { cn } from "@/lib/utils";

import styles from "./portfolio.module.css";

export interface BuilderConfig {
  index_id: number;
  filters: FilterSpec[];
  weighting: { scheme: WeightScheme; max_weight: number | null; score_factor_id: string | null };
  basis: "consolidated" | "standalone";
  frequency: Frequency;
  builtOn: "today" | number; // month 1–12 (last trading day of month)
  custom_factors: CustomFactorSpec[];
}

export const DEFAULT_CONFIG: BuilderConfig = {
  index_id: 3, // Nifty 100
  filters: [],
  weighting: { scheme: "equal", max_weight: null, score_factor_id: null },
  basis: "consolidated",
  frequency: "quarterly",
  builtOn: "today",
  custom_factors: [],
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FREQ_MONTHS: Record<Frequency, number> = { "15d": 0, monthly: 1, quarterly: 3, semiannual: 6, annual: 12 };

const SCHEMES: { value: WeightScheme; label: string }[] = [
  { value: "equal", label: "Equal" },
  { value: "market_cap", label: "Market-cap" },
  { value: "factor_score", label: "Factor score" },
  { value: "inverse_vol", label: "Inverse-vol" },
];

/** Project the next N real-ish rebalance dates from today (client-side preview). */
function projectRebalances(freq: Frequency, builtOn: "today" | number, n = 8): string[] {
  const out: string[] = [];
  const today = new Date();
  if (freq === "15d") {
    const d = new Date(today);
    for (let i = 0; i < n; i++) {
      d.setDate(d.getDate() + 15);
      out.push(d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }));
    }
    return out;
  }
  const step = FREQ_MONTHS[freq];
  const startMonth = builtOn === "today" ? today.getMonth() : (builtOn as number) - 1;
  let year = today.getFullYear();
  let month = startMonth;
  // advance to the first future month-end
  while (out.length < n) {
    const endOfMonth = new Date(year, month + 1, 0);
    if (endOfMonth > today) {
      out.push(endOfMonth.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" }));
    }
    month += step;
    while (month > 11) { month -= 12; year += 1; }
  }
  return out;
}

export default function BuilderView({
  initialConfig,
  onOpenBacktest,
}: {
  initialConfig?: BuilderConfig;
  onOpenBacktest: (cfg: BuilderConfig) => void;
}) {
  const universes = useUniverses();
  const factors = useFactors();
  const customFactors = useCustomFactors();
  const screen = useScreenMutation();
  const saveStrategy = useCreateStrategy();

  const [cfg, setCfg] = React.useState<BuilderConfig>(initialConfig ?? DEFAULT_CONFIG);
  const [result, setResult] = React.useState<ScreenResponse | null>(null);
  const built = result !== null;

  // Any config edit invalidates the build.
  const update = React.useCallback((patch: Partial<BuilderConfig>) => {
    setCfg((c) => ({ ...c, ...patch }));
    setResult(null);
  }, []);

  const handleSave = () => {
    const name = window.prompt("Save this strategy as:");
    if (!name?.trim()) return;
    saveStrategy.mutate({ name: name.trim(), config: cfg as unknown as Record<string, unknown> });
  };

  // Factor option list: base factors + saved custom factors.
  const factorOptions = React.useMemo(() => {
    const base = (factors.data ?? []).map((f) => ({
      id: f.id, name: f.name, category: f.category, unit: f.unit, decimals: f.decimals,
      source: f.source_tables.join(", "), op: f.default_operator,
    }));
    const custom = (customFactors.data ?? []).map((c) => ({
      id: c.id, name: c.name, category: "custom" as const, unit: "", decimals: 2,
      source: "custom", op: ">=" as Operator,
    }));
    return [...base, ...custom];
  }, [factors.data, customFactors.data]);

  const factorById = React.useMemo(
    () => new Map(factorOptions.map((f) => [f.id, f])),
    [factorOptions],
  );

  const usedCustom: CustomFactorSpec[] = React.useMemo(() => {
    const ids = new Set(cfg.filters.map((f) => f.factor_id));
    if (cfg.weighting.score_factor_id) ids.add(cfg.weighting.score_factor_id);
    return (customFactors.data ?? []).filter((c) => ids.has(c.id));
  }, [cfg.filters, cfg.weighting.score_factor_id, customFactors.data]);

  // ── Filter editing ──
  const addFilter = () => {
    const first = factorOptions[0];
    if (!first) return;
    update({ filters: [...cfg.filters, { factor_id: first.id, op: first.op, value: null }] });
  };
  const setFilter = (i: number, patch: Partial<FilterSpec>) => {
    const next = cfg.filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f));
    update({ filters: next });
  };
  const removeFilter = (i: number) => update({ filters: cfg.filters.filter((_, idx) => idx !== i) });

  // ── Build ──
  const handleBuild = () => {
    const displayFactors = Array.from(new Set(cfg.filters.map((f) => f.factor_id)));
    screen.mutate(
      {
        index_id: cfg.index_id,
        filters: cfg.filters,
        weighting: {
          scheme: cfg.weighting.scheme,
          score_factor_id: cfg.weighting.score_factor_id,
          max_weight: cfg.weighting.max_weight,
        },
        basis: cfg.basis,
        display_factors: displayFactors,
        custom_factors: usedCustom,
      },
      { onSuccess: setResult },
    );
  };

  const uniName = universes.data?.find((u) => u.index_id === cfg.index_id)?.index_name ?? "—";
  const rebalances = React.useMemo(
    () => projectRebalances(cfg.frequency, cfg.builtOn),
    [cfg.frequency, cfg.builtOn],
  );

  return (
    <div className={styles.blocks}>
      {/* 1. Universe */}
      <Block num={1} title="Universe" sub="Starting index — point-in-time constituents are used at every rebalance">
        <div className={styles.uniRow}>
          {universes.isLoading && <span className={styles.spinner} />}
          {universes.data?.map((u) => (
            <button
              key={u.index_id}
              className={cn(styles.uniChip, cfg.index_id === u.index_id && styles.uniChipActive)}
              onClick={() => update({ index_id: u.index_id })}
            >
              {u.index_name}
            </button>
          ))}
        </div>
      </Block>

      {/* 2. Filtering */}
      <Block num={2} title="Filtering" sub="Stack factor filters — applied as sequential AND. Each shows its source table.">
        {cfg.filters.length === 0 && (
          <div className={styles.emptyFilters}>No filters yet — the whole universe passes. Add one below.</div>
        )}
        <div className={styles.filterList}>
          {cfg.filters.map((f, i) => {
            const meta = factorById.get(f.factor_id);
            const needsTwo = f.op === "between";
            const needsK = f.op === "top_k" || f.op === "bottom_k";
            return (
              <div key={i} className={styles.filterRow}>
                <span className={styles.filterIdx}>{i + 1}</span>
                {i > 0 && <span className={styles.andTag}>and</span>}
                <select
                  className={styles.sel}
                  value={f.factor_id}
                  onChange={(e) => {
                    const m = factorById.get(e.target.value);
                    setFilter(i, { factor_id: e.target.value, op: m?.op ?? f.op });
                  }}
                >
                  {factorOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <select className={styles.sel} value={f.op} onChange={(e) => setFilter(i, { op: e.target.value as Operator })}>
                  {OPERATORS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {needsK ? (
                  <input
                    className={styles.num} type="number" min={1} placeholder="K"
                    value={f.k ?? ""} onChange={(e) => setFilter(i, { k: e.target.value ? Number(e.target.value) : null })}
                  />
                ) : (
                  <input
                    className={styles.num} type="number" placeholder="value"
                    value={f.value ?? ""} onChange={(e) => setFilter(i, { value: e.target.value ? Number(e.target.value) : null })}
                  />
                )}
                {needsTwo && (
                  <input
                    className={styles.num} type="number" placeholder="and"
                    value={f.value2 ?? ""} onChange={(e) => setFilter(i, { value2: e.target.value ? Number(e.target.value) : null })}
                  />
                )}
                {meta?.unit && <span className={styles.secTag}>{meta.unit}</span>}
                <span className={styles.srcTag}>{meta?.source}</span>
                <button className={styles.iconBtn} title="Remove" onClick={() => removeFilter(i)}>✕</button>
              </div>
            );
          })}
        </div>
        <button className={styles.addFilter} onClick={addFilter}>+ Add filter</button>
      </Block>

      {/* 3. Construction rules */}
      <Block num={3} title="Construction Rules" sub="Rebalancing cadence + when the book is built">
        <div className={styles.rulesGrid}>
          <Field label="Rebalancing frequency">
            <div className={styles.pillRow}>
              {FREQUENCIES.map((o) => (
                <button key={o.value} className={cn(styles.pill, cfg.frequency === o.value && styles.pillActive)} onClick={() => update({ frequency: o.value })}>
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Built on">
            <div className={styles.pillRow}>
              <button className={cn(styles.pill, cfg.builtOn === "today" && styles.pillActive)} onClick={() => update({ builtOn: "today" })}>Today</button>
              {MONTHS.map((m, idx) => (
                <button key={m} className={cn(styles.pill, cfg.builtOn === idx + 1 && styles.pillActive)} onClick={() => update({ builtOn: idx + 1 })}>
                  {m}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Weighting">
            <div className={styles.pillRow}>
              {SCHEMES.map((o) => (
                <button key={o.value} className={cn(styles.pill, cfg.weighting.scheme === o.value && styles.pillActive)}
                  onClick={() => update({ weighting: { ...cfg.weighting, scheme: o.value } })}>
                  {o.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Fundamentals basis">
            <div className={styles.pillRow}>
              {(["consolidated", "standalone"] as const).map((b) => (
                <button key={b} className={cn(styles.pill, cfg.basis === b && styles.pillActive)} onClick={() => update({ basis: b })}>
                  {b[0].toUpperCase() + b.slice(1)}
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className={styles.timeline}>
          <div className={styles.tlHead}>
            Your rebalancing timeline{" "}
            <span className={styles.tlSub}>
              · next {rebalances.length} ·{" "}
              {cfg.builtOn === "today" ? "rolling from today" : `last trading day of ${MONTHS[(cfg.builtOn as number) - 1]} cycle`}
            </span>
          </div>
          <div className={styles.tlDots}>
            {rebalances.map((d, i) => (<span key={i} className={styles.tlDot}>{d}</span>))}
          </div>
        </div>
      </Block>

      {/* 4. Suggested portfolio */}
      <Block num={4} title="Suggested Portfolio" sub="Build to preview the book at the latest rebalance">
        <div className={styles.cta}>
          <button className={styles.buildBtn} onClick={handleBuild} disabled={screen.isPending}>
            {screen.isPending ? <span className={styles.spinner} /> : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>
            )}
            Build portfolio
          </button>
          <span className={styles.ctaMeta}>
            Universe <b>{uniName}</b> · <b>{cfg.filters.length}</b> filter{cfg.filters.length === 1 ? "" : "s"} · <b>{FREQUENCIES.find((f) => f.value === cfg.frequency)?.label}</b> rebalance
          </span>
          <button className={styles.ghostBtn} disabled={!built} onClick={() => onOpenBacktest(cfg)}>
            Open detailed backtest →
          </button>
          <button className={styles.ghostBtn} onClick={handleSave} disabled={saveStrategy.isPending}>
            {saveStrategy.isSuccess ? "Saved ✓" : "Save strategy"}
          </button>
        </div>

        {screen.isError && <div className={cn(styles.errorBox, styles.buildError)}>Couldn&apos;t build: {(screen.error as Error)?.message}</div>}

        {result && (
          <div className={styles.resultWrap}>
            <div className={styles.funnel}>
              {result.funnel.map((s, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className={styles.funnelArrow}>→</span>}
                  <span className={styles.funnelStep}>{s.label.split(":")[0]} <b>{s.remaining}</b></span>
                </React.Fragment>
              ))}
            </div>
            {result.coverage.length > 0 && (
              <div className={styles.coverage}>
                {result.coverage.map((c) => (
                  <span key={c.factor_id}>{factorById.get(c.factor_id)?.name ?? c.factor_id}: computable {c.computable}/{c.total}</span>
                ))}
              </div>
            )}
            <HoldingsTable result={result} factorById={factorById} />
            {result.notes.length > 0 && (
              <ul className={styles.notes}>{result.notes.map((n, i) => (<li key={i}>{n}</li>))}</ul>
            )}
          </div>
        )}
      </Block>
    </div>
  );
}

function HoldingsTable({
  result,
  factorById,
}: {
  result: ScreenResponse;
  factorById: Map<string, { name: string; unit: string; decimals: number }>;
}) {
  const factorCols = result.holdings.length
    ? Object.keys(result.holdings[0].factors)
    : [];
  const maxW = Math.max(...result.holdings.map((h) => h.weight), 0.0001);
  if (result.holdings.length === 0) {
    return <div className={styles.empty}>No names passed the filters. Loosen a threshold and rebuild.</div>;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th>
            <th>Symbol</th>
            <th>Sector</th>
            <th className={styles.numCol}>Weight</th>
            {factorCols.map((fid) => (
              <th key={fid} className={styles.numCol}>{factorById.get(fid)?.name ?? fid}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.holdings.map((h, i) => (
            <tr key={h.security_id}>
              <td>{i + 1}</td>
              <td className={styles.symCell}>{h.symbol ?? h.name ?? h.security_id}</td>
              <td><span className={styles.secTag}>{h.sector ?? "—"}</span></td>
              <td className={cn(styles.numCol)}>
                <div className={styles.wbar}>
                  <span className={styles.wbarFill} style={{ width: `${(h.weight / maxW) * 100}%` }} />
                  <span className={styles.wbarVal}>{pct(h.weight, 2)}</span>
                </div>
              </td>
              {factorCols.map((fid) => (
                <td key={fid} className={styles.numCol}>{fmtFactor(h.factors[fid], factorById.get(fid))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Block({ num, title, sub, children }: { num: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className={styles.block}>
      <div className={styles.blockHead}>
        <div>
          <span className={styles.blockTitle}><span className={styles.blockNum}>{num}</span>{title}</span>
        </div>
        <span className={styles.blockSub}>{sub}</span>
      </div>
      <div className={styles.blockBody}>{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </div>
  );
}
