"use client";

import * as React from "react";

import {
  useCreateCustomFactor,
  useCustomFactors,
  useDeleteCustomFactor,
  useFactorPreviewMutation,
  useFactors,
  useUniverses,
} from "@/lib/api/portfolio";
import { cn } from "@/lib/utils";

import styles from "./factor.module.css";

const PREVIEW_ID = "__preview__";

export default function FactorBuilderView() {
  const factors = useFactors();
  const universes = useUniverses();
  const preview = useFactorPreviewMutation();
  const create = useCreateCustomFactor();
  const saved = useCustomFactors();
  const del = useDeleteCustomFactor();

  const [expression, setExpression] = React.useState("(roe + earnings_yield) / pb");
  const [name, setName] = React.useState("");
  const [direction, setDirection] = React.useState<"higher_better" | "lower_better">("higher_better");
  const [normalization, setNormalization] = React.useState<"none" | "zscore" | "rank">("rank");
  const [indexId, setIndexId] = React.useState(1);

  const insert = (id: string) => setExpression((e) => (e.trim() ? `${e} ${id}` : id));

  const runPreview = () => {
    preview.mutate({
      index_id: indexId, limit: 10,
      custom: { id: PREVIEW_ID, name: name || "Preview", expression, direction, normalization },
    });
  };

  const save = () => {
    if (!name.trim()) {
      window.alert("Give your factor a name first.");
      return;
    }
    create.mutate(
      { name: name.trim(), expression, direction, normalization },
      { onSuccess: () => setName("") },
    );
  };

  const byCategory = React.useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>();
    for (const f of factors.data ?? []) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category)!.push({ id: f.id, name: f.name });
    }
    return [...map.entries()];
  }, [factors.data]);

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>
        Compose a factor from database variables and watch it rank real names. Saved factors flow straight
        into the Filtering section. Use <code>+ − × /</code>, parentheses, and the factor ids below — e.g.{" "}
        <code>(roe + earnings_yield) / pb</code>.
      </p>

      <div className={styles.grid}>
        {/* Palette */}
        <div className={styles.palette}>
          <div className={styles.paletteHead}>Variables</div>
          {byCategory.map(([cat, fs]) => (
            <div key={cat} className={styles.paletteGroup}>
              <div className={styles.paletteCat}>{cat}</div>
              <div className={styles.paletteChips}>
                {fs.map((f) => (
                  <button key={f.id} className={styles.varChip} title={f.name} onClick={() => insert(f.id)}>
                    {f.id}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Composition */}
        <div className={styles.compose}>
          <textarea
            className={styles.expr}
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            spellCheck={false}
            rows={3}
          />
          <div className={styles.keypad}>
            {["(", ")", "+", "−", "×", "÷"].map((k) => {
              const sym = k === "−" ? "-" : k === "×" ? "*" : k === "÷" ? "/" : k;
              return (
                <button key={k} className={styles.key} onClick={() => setExpression((e) => `${e}${e && !e.endsWith(" ") ? " " : ""}${sym} `)}>
                  {k}
                </button>
              );
            })}
            <button className={styles.keyWide} onClick={() => setExpression("")}>clear</button>
          </div>

          <div className={styles.metaRow}>
            <input className={styles.input} placeholder="Factor name (e.g. Quality-Value)" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className={styles.metaRow}>
            <Seg label="Direction" value={direction} onChange={(v) => setDirection(v as typeof direction)}
              opts={[["higher_better", "Higher is better"], ["lower_better", "Lower is better"]]} />
            <Seg label="Normalize" value={normalization} onChange={(v) => setNormalization(v as typeof normalization)}
              opts={[["none", "Raw"], ["zscore", "Z-score"], ["rank", "Rank"]]} />
          </div>
          <div className={styles.metaRow}>
            <label className={styles.uniLabel}>Preview on</label>
            <select className={styles.input} value={indexId} onChange={(e) => setIndexId(Number(e.target.value))}>
              {(universes.data ?? []).map((u) => (<option key={u.index_id} value={u.index_id}>{u.index_name}</option>))}
            </select>
          </div>

          <div className={styles.actions}>
            <button className={styles.previewBtn} onClick={runPreview} disabled={preview.isPending}>
              {preview.isPending ? "Ranking…" : "Backtest-rank this factor"}
            </button>
            <button className={styles.saveBtn} onClick={save} disabled={create.isPending}>
              {create.isSuccess ? "Saved ✓" : "Save factor"}
            </button>
          </div>
          {(preview.isError || create.isError) && (
            <div className={styles.err}>{((preview.error || create.error) as Error)?.message}</div>
          )}

          {preview.data && (
            <div className={styles.previewBox}>
              <div className={styles.previewHead}>
                Ranked over {preview.data.total} names · computable {preview.data.computable}/{preview.data.total}
              </div>
              <div className={styles.cols}>
                <RankCol title="Top" rows={preview.data.top} />
                <RankCol title="Bottom" rows={preview.data.bottom} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Saved factors */}
      {(saved.data?.length ?? 0) > 0 && (
        <div className={styles.savedWrap}>
          <div className={styles.savedHead}>Saved factors</div>
          <div className={styles.savedList}>
            {saved.data!.map((c) => (
              <div key={c.id} className={styles.savedChip}>
                <span className={styles.savedName}>{c.name}</span>
                <code className={styles.savedExpr}>{c.expression}</code>
                <button className={styles.savedDel} title="Delete" onClick={() => del.mutate(c.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Seg({ label, value, onChange, opts }: {
  label: string; value: string; onChange: (v: string) => void; opts: [string, string][];
}) {
  return (
    <div className={styles.seg}>
      <span className={styles.segLabel}>{label}</span>
      <div className={styles.segBtns}>
        {opts.map(([v, l]) => (
          <button key={v} className={cn(styles.segBtn, value === v && styles.segBtnActive)} onClick={() => onChange(v)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

function RankCol({ title, rows }: { title: string; rows: { symbol: string | null; name: string | null; value: number | null }[] }) {
  return (
    <div className={styles.rankCol}>
      <div className={styles.rankTitle}>{title}</div>
      {rows.map((r, i) => (
        <div key={i} className={styles.rankRow}>
          <span className={styles.rankSym}>{r.symbol ?? r.name ?? "—"}</span>
          <span className={styles.rankVal}>{r.value === null ? "—" : r.value.toFixed(3)}</span>
        </div>
      ))}
    </div>
  );
}
