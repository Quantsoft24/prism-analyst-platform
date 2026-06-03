"use client";

import * as React from "react";

import Dropdown, { type DropdownOption } from "@/components/Dropdown";
import TrashIcon from "@/components/TrashIcon";
import { useDialog } from "@/components/Dialog";
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
  index_id: 3,
  filters: [],
  weighting: { scheme: "equal", max_weight: null, score_factor_id: null },
  basis: "consolidated",
  frequency: "quarterly",
  builtOn: "today",
  custom_factors: [],
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FREQ_MONTHS: Record<Exclude<Frequency, "15d">, number> = {
  monthly: 1, quarterly: 3, semiannual: 6, annual: 12,
};
const ADD_CUSTOM = "__add_custom__";

const SCHEMES: { value: WeightScheme; label: string }[] = [
  { value: "equal", label: "Equal" },
  { value: "market_cap", label: "Market-cap" },
  { value: "factor_score", label: "Factor score" },
  { value: "inverse_vol", label: "Inverse-vol" },
];

/** Roll a calendar date back to the previous weekday (≈ last trading day). */
function toWeekday(d: Date): Date {
  const x = new Date(d);
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() - 1);
  return x;
}

/** Project the next N rebalance dates from the cadence, on each period's last
 *  (≈ trading) day. The gap between consecutive dates always equals the chosen
 *  frequency. "Today" = built now, so the first rebalance is one full period
 *  out (not the tail of the current month); a chosen month anchors the cycle to
 *  that month (e.g. quarterly + March → Mar/Jun/Sep/Dec). */
function projectRebalances(freq: Frequency, builtOn: "today" | number, n = 8): string[] {
  const today = new Date();
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" });
  const out: string[] = [];
  if (freq === "15d") {
    const d = new Date(today);
    for (let i = 0; i < n; i++) {
      d.setDate(d.getDate() + 15);
      out.push(fmt(toWeekday(d)));
    }
    return out;
  }
  const step = FREQ_MONTHS[freq];
  const monthEnd = (yy: number, mm: number) => toWeekday(new Date(yy, mm + 1, 0));
  let y = today.getFullYear();
  let m = today.getMonth();
  if (builtOn === "today") {
    // Built now → first rebalance is one whole period later, then every `step`.
    m += step;
  } else {
    // Anchored to a chosen month → advance to the next month on the cadence grid.
    const anchor = (builtOn as number) - 1;
    let guard = 0;
    while ((((m - anchor) % step) + step) % step !== 0 && guard++ < 24) m += 1;
  }
  let guard = 0;
  while (out.length < n && guard++ < 480) {
    while (m > 11) { m -= 12; y += 1; }
    const end = monthEnd(y, m);
    if (end > today) out.push(fmt(end)); // skip a grid date already in the past
    m += step;
  }
  return out;
}

export default function BuilderView({
  initialConfig,
  onOpenBacktest,
  onAddCustomFactor,
}: {
  initialConfig?: BuilderConfig;
  onOpenBacktest: (cfg: BuilderConfig) => void;
  onAddCustomFactor: () => void;
}) {
  const dialog = useDialog();
  const universes = useUniverses();
  const factors = useFactors();
  const customFactors = useCustomFactors();
  const screen = useScreenMutation();
  const saveStrategy = useCreateStrategy();

  const [cfg, setCfg] = React.useState<BuilderConfig>(initialConfig ?? DEFAULT_CONFIG);
  const [result, setResult] = React.useState<ScreenResponse | null>(null);
  const [dragIdx, setDragIdx] = React.useState<number | null>(null);
  const [overIdx, setOverIdx] = React.useState<number | null>(null);
  const built = result !== null;

  const update = React.useCallback((patch: Partial<BuilderConfig>) => {
    setCfg((c) => ({ ...c, ...patch }));
    setResult(null);
  }, []);

  const handleSave = async () => {
    const name = await dialog.prompt({ title: "Save strategy", label: "Strategy name", placeholder: "e.g. Quality-Value Q rebalance", confirmLabel: "Save" });
    if (name) saveStrategy.mutate({ name, config: cfg as unknown as Record<string, unknown> });
  };

  // Factor option list: base factors (grouped) + saved custom factors + "create".
  const factorOptions: DropdownOption<string>[] = React.useMemo(() => {
    const base = (factors.data ?? []).map((f) => ({
      value: f.id, label: f.name, group: f.category, desc: f.unit || undefined,
    }));
    const custom = (customFactors.data ?? []).map((c) => ({
      value: c.id, label: c.name, group: "custom", desc: "custom",
    }));
    return [...base, ...custom, { value: ADD_CUSTOM, label: "＋ Create custom factor…", group: "custom" }];
  }, [factors.data, customFactors.data]);

  const factorMeta = React.useMemo(() => {
    const m = new Map<string, { name: string; unit: string; decimals: number; source: string; op: Operator }>();
    for (const f of factors.data ?? []) m.set(f.id, { name: f.name, unit: f.unit, decimals: f.decimals, source: f.source_tables.join(", "), op: f.default_operator });
    for (const c of customFactors.data ?? []) m.set(c.id, { name: c.name, unit: "", decimals: 2, source: "custom", op: ">=" });
    return m;
  }, [factors.data, customFactors.data]);

  const usedCustom: CustomFactorSpec[] = React.useMemo(() => {
    const ids = new Set(cfg.filters.map((f) => f.factor_id));
    if (cfg.weighting.score_factor_id) ids.add(cfg.weighting.score_factor_id);
    return (customFactors.data ?? []).filter((c) => ids.has(c.id));
  }, [cfg.filters, cfg.weighting.score_factor_id, customFactors.data]);

  // ── Filter editing ──
  const newFilter = (): FilterSpec | null => {
    const first = factors.data?.[0];
    return first ? { factor_id: first.id, op: first.default_operator, value: null } : null;
  };
  const insertAt = (i: number) => {
    const f = newFilter();
    if (!f) return;
    const next = [...cfg.filters];
    next.splice(i, 0, f);
    update({ filters: next });
  };
  const setFilter = (i: number, patch: Partial<FilterSpec>) => {
    update({ filters: cfg.filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) });
  };
  const removeFilter = async (i: number) => {
    const ok = await dialog.confirm({
      title: "Remove filter?",
      message: `Remove the “${factorMeta.get(cfg.filters[i].factor_id)?.name ?? cfg.filters[i].factor_id}” filter from the stack?`,
      confirmLabel: "Remove", danger: true,
    });
    if (ok) update({ filters: cfg.filters.filter((_, idx) => idx !== i) });
  };
  const onFactorChange = (i: number, v: string) => {
    if (v === ADD_CUSTOM) { onAddCustomFactor(); return; }
    setFilter(i, { factor_id: v, op: factorMeta.get(v)?.op ?? cfg.filters[i].op });
  };

  // ── Drag-and-drop reorder ──
  const moveFilter = (from: number, to: number) => {
    if (from === to) return;
    const next = [...cfg.filters];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    update({ filters: next });
  };

  // ── Build ──
  const handleBuild = () => {
    const displayFactors = Array.from(new Set(cfg.filters.map((f) => f.factor_id)));
    screen.mutate(
      {
        index_id: cfg.index_id, filters: cfg.filters,
        weighting: { scheme: cfg.weighting.scheme, score_factor_id: cfg.weighting.score_factor_id, max_weight: cfg.weighting.max_weight },
        basis: cfg.basis, display_factors: displayFactors, custom_factors: usedCustom,
      },
      { onSuccess: setResult },
    );
  };

  const uniName = universes.data?.find((u) => u.index_id === cfg.index_id)?.index_name ?? "—";
  const rebalances = React.useMemo(() => projectRebalances(cfg.frequency, cfg.builtOn), [cfg.frequency, cfg.builtOn]);
  const opOptions: DropdownOption<Operator>[] = OPERATORS.map((o) => ({ value: o.value, label: o.label }));

  return (
    <div className={styles.blocks}>
      {/* 1. Universe */}
      <Block num={1} title="Universe" sub="Starting index — point-in-time constituents are used at every rebalance">
        <div className={styles.uniRow}>
          {universes.isLoading && <span className={styles.spinner} />}
          {universes.data?.map((u) => (
            <button key={u.index_id} className={cn(styles.uniChip, cfg.index_id === u.index_id && styles.uniChipActive)} onClick={() => update({ index_id: u.index_id })}>
              {u.index_name}
            </button>
          ))}
        </div>
      </Block>

      {/* 2. Filtering */}
      <Block num={2} title="Filtering" sub="Stack factor filters (sequential AND) — drag to reorder, insert anywhere">
        {cfg.filters.length === 0 && (
          <div className={styles.emptyFilters}>No filters yet — the whole universe passes. Add one below.</div>
        )}
        <div className={styles.filterList}>
          {cfg.filters.map((f, i) => {
            const meta = factorMeta.get(f.factor_id);
            const needsTwo = f.op === "between";
            const needsK = f.op === "top_k" || f.op === "bottom_k";
            return (
              <div key={i}>
                <InsertZone show={i === 0} onClick={() => insertAt(0)} active={overIdx === i && dragIdx !== null} />
                <div
                  className={cn(styles.filterRow, dragIdx === i && styles.filterRowDragging)}
                  draggable
                  onDragStart={() => setDragIdx(i)}
                  onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                  onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
                  onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) moveFilter(dragIdx, i); setDragIdx(null); setOverIdx(null); }}
                >
                  <span className={styles.dragHandle} title="Drag to reorder">⠿</span>
                  <span className={styles.filterIdx}>{i + 1}</span>
                  {i > 0 && <span className={styles.andTag}>and</span>}
                  <Dropdown value={f.factor_id} options={factorOptions} onChange={(v) => onFactorChange(i, v)} minWidth={170} ariaLabel="Factor" />
                  <Dropdown value={f.op} options={opOptions} onChange={(v) => setFilter(i, { op: v })} minWidth={96} ariaLabel="Operator" />
                  {needsK ? (
                    <input className={styles.num} type="number" min={1} placeholder="K" value={f.k ?? ""} onChange={(e) => setFilter(i, { k: e.target.value ? Number(e.target.value) : null })} />
                  ) : (
                    <input className={styles.num} type="number" placeholder="value" value={f.value ?? ""} onChange={(e) => setFilter(i, { value: e.target.value ? Number(e.target.value) : null })} />
                  )}
                  {needsTwo && (
                    <input className={styles.num} type="number" placeholder="and" value={f.value2 ?? ""} onChange={(e) => setFilter(i, { value2: e.target.value ? Number(e.target.value) : null })} />
                  )}
                  {meta?.unit && <span className={styles.secTag}>{meta.unit}</span>}
                  <span className={styles.srcTag}>{meta?.source}</span>
                  <button className={styles.iconBtn} title="Insert filter above" onClick={() => insertAt(i)}>＋</button>
                  <button className={cn(styles.iconBtn, styles.iconBtnDel)} title="Remove filter" aria-label="Remove filter" onClick={() => removeFilter(i)}><TrashIcon size={14} /></button>
                </div>
                <InsertZone show onClick={() => insertAt(i + 1)} active={false} />
              </div>
            );
          })}
        </div>
        <div className={styles.filterActions}>
          <button className={styles.addFilter} onClick={() => insertAt(cfg.filters.length)}>+ Add filter</button>
          <button className={styles.addCustomLink} onClick={onAddCustomFactor}>＋ Create a custom factor →</button>
        </div>
      </Block>

      {/* 3. Construction rules */}
      <Block num={3} title="Construction Rules" sub="Rebalancing cadence + when the book is built">
        <div className={styles.rulesGrid}>
          <Field label="Rebalancing frequency">
            <div className={styles.pillRow}>
              {FREQUENCIES.map((o) => (
                <button key={o.value} className={cn(styles.pill, cfg.frequency === o.value && styles.pillActive)} onClick={() => update({ frequency: o.value })}>{o.label}</button>
              ))}
            </div>
          </Field>
          <Field label="Built on" hint="“Today” = build now; a month = the last trading day of that month, then re-screen each cycle.">
            <div className={styles.pillRow}>
              <button className={cn(styles.pill, cfg.builtOn === "today" && styles.pillActive)} onClick={() => update({ builtOn: "today" })}>Today</button>
              {MONTHS.map((m, idx) => (
                <button key={m} className={cn(styles.pill, cfg.builtOn === idx + 1 && styles.pillActive)} onClick={() => update({ builtOn: idx + 1 })}>{m}</button>
              ))}
            </div>
          </Field>
          <Field label="Weighting">
            <div className={styles.pillRow}>
              {SCHEMES.map((o) => (
                <button key={o.value} className={cn(styles.pill, cfg.weighting.scheme === o.value && styles.pillActive)} onClick={() => update({ weighting: { ...cfg.weighting, scheme: o.value } })}>{o.label}</button>
              ))}
            </div>
          </Field>
          <Field label="Fundamentals basis">
            <div className={styles.pillRow}>
              {(["consolidated", "standalone"] as const).map((b) => (
                <button key={b} className={cn(styles.pill, cfg.basis === b && styles.pillActive)} onClick={() => update({ basis: b })}>{b[0].toUpperCase() + b.slice(1)}</button>
              ))}
            </div>
          </Field>
        </div>
        <div className={styles.timeline}>
          <div className={styles.tlHead}>
            Your rebalancing timeline{" "}
            <span className={styles.tlSub}>
              · next {rebalances.length} ·{" "}
              {cfg.frequency === "15d"
                ? "rolling every 15 days from today"
                : `${FREQUENCIES.find((f) => f.value === cfg.frequency)?.label.toLowerCase()}, ${cfg.builtOn === "today" ? "first rebalance one period from today" : `anchored to ${MONTHS[(cfg.builtOn as number) - 1]}`} · each on the period's last trading day`}
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
          <button className={styles.ghostBtn} disabled={!built} onClick={() => onOpenBacktest(cfg)}>Open detailed backtest →</button>
          <button className={styles.ghostBtn} onClick={handleSave} disabled={saveStrategy.isPending}>{saveStrategy.isSuccess ? "Saved ✓" : "Save strategy"}</button>
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
                {result.coverage.map((c) => (<span key={c.factor_id}>{factorMeta.get(c.factor_id)?.name ?? c.factor_id}: computable {c.computable}/{c.total}</span>))}
              </div>
            )}
            <HoldingsTable result={result} factorMeta={factorMeta} />
            {result.notes.length > 0 && (<ul className={styles.notes}>{result.notes.map((n, i) => (<li key={i}>{n}</li>))}</ul>)}
          </div>
        )}
      </Block>
    </div>
  );
}

function InsertZone({ show, onClick, active }: { show: boolean; onClick: () => void; active: boolean }) {
  if (!show) return null;
  return (
    <div className={cn(styles.insertZone, active && styles.insertZoneActive)} onClick={onClick}>
      <span className={styles.insertLine} />
      <span className={styles.insertPlus}>+ insert</span>
      <span className={styles.insertLine} />
    </div>
  );
}

function HoldingsTable({
  result,
  factorMeta,
}: {
  result: ScreenResponse;
  factorMeta: Map<string, { name: string; unit: string; decimals: number }>;
}) {
  const factorCols = result.holdings.length ? Object.keys(result.holdings[0].factors) : [];
  const maxW = Math.max(...result.holdings.map((h) => h.weight), 0.0001);
  if (result.holdings.length === 0) {
    return <div className={styles.empty}>No names passed the filters. Loosen a threshold and rebuild.</div>;
  }
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>#</th><th>Symbol</th><th>Sector</th><th className={styles.numCol}>Weight</th>
            {factorCols.map((fid) => (<th key={fid} className={styles.numCol}>{factorMeta.get(fid)?.name ?? fid}</th>))}
          </tr>
        </thead>
        <tbody>
          {result.holdings.map((h, i) => (
            <tr key={h.security_id}>
              <td>{i + 1}</td>
              <td className={styles.symCell}>{h.symbol ?? h.name ?? h.security_id}</td>
              <td><span className={styles.secTag}>{h.sector ?? "—"}</span></td>
              <td className={styles.numCol}>
                <div className={styles.wbar}>
                  <span className={styles.wbarFill} style={{ width: `${(h.weight / maxW) * 100}%` }} />
                  <span className={styles.wbarVal}>{pct(h.weight, 2)}</span>
                </div>
              </td>
              {factorCols.map((fid) => (<td key={fid} className={styles.numCol}>{fmtFactor(h.factors[fid], factorMeta.get(fid))}</td>))}
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
        <div><span className={styles.blockTitle}><span className={styles.blockNum}>{num}</span>{title}</span></div>
        <span className={styles.blockSub}>{sub}</span>
      </div>
      <div className={styles.blockBody}>{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>
        {label}
        {hint && <span className={styles.fieldHint} title={hint}> ⓘ</span>}
      </span>
      {children}
    </div>
  );
}
