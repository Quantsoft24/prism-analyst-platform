"use client";

import { ArrowRight, GitCompareArrows, Loader2, Minus, Plus, RefreshCw } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { useBMCDiff, type BMCBlockDiff } from "@/lib/api/bmc";
import styles from "./BMCDiffView.module.css";

interface Props {
  ticker: string;
  companyName: string;
}

const BLOCK_TITLES: Record<string, string> = {
  customer_segments: "Customer Segments",
  value_propositions: "Value Propositions",
  channels: "Channels",
  customer_relationships: "Customer Relationships",
  revenue_streams: "Revenue Streams",
  key_resources: "Key Resources",
  key_activities: "Key Activities",
  key_partnerships: "Key Partnerships",
  cost_structure: "Cost Structure",
};

function DiffList({ items, kind }: { items?: string[]; kind: "added" | "removed" | "changed" }) {
  if (!items || items.length === 0) return null;
  const Icon = kind === "added" ? Plus : kind === "removed" ? Minus : RefreshCw;
  return (
    <ul className={cn(styles.diffList, styles[kind])}>
      {items.map((it, i) => (
        <li key={i} className={styles.diffItem}>
          <Icon size={11} className={styles.diffIcon} /> <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

function blockChanged(d: BMCBlockDiff): boolean {
  return Boolean(d.added?.length || d.removed?.length || d.changed?.length || d.narrative);
}

/** Temporal diff between two fiscal periods — surfaces how the business model
 *  evolved (new segments, dropped partnerships, shifted cost drivers). */
export default function BMCDiffView({ ticker, companyName }: Props) {
  const [periodA, setPeriodA] = React.useState("");
  const [periodB, setPeriodB] = React.useState("");
  const diff = useBMCDiff(ticker);

  const run = () => {
    const a = periodA.trim();
    const b = periodB.trim();
    if (!a || !b || a === b) return;
    diff.mutate({ periodA: a, periodB: b });
  };

  const result = diff.data;

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <GitCompareArrows size={15} className={styles.icon} />
        <span className={styles.label}>Compare {companyName}&apos;s business model across two fiscal years</span>
        <div className={styles.periodRow}>
          <input
            className={styles.periodInput}
            value={periodA}
            onChange={(e) => setPeriodA(e.target.value)}
            placeholder="FY A (e.g. 2024)"
            aria-label="Period A"
          />
          <ArrowRight size={14} className={styles.arrow} />
          <input
            className={styles.periodInput}
            value={periodB}
            onChange={(e) => setPeriodB(e.target.value)}
            placeholder="FY B (e.g. 2026)"
            aria-label="Period B"
          />
          <button
            className={styles.runBtn}
            onClick={run}
            disabled={diff.isPending || !periodA.trim() || !periodB.trim() || periodA.trim() === periodB.trim()}
          >
            {diff.isPending ? <><Loader2 size={14} className={styles.spin} /> Comparing…</> : "Compare"}
          </button>
        </div>
      </div>

      {diff.isPending && (
        <p className={styles.hint}>
          Building/diffing both canvases — this can take up to ~2 minutes on a cold pair.
        </p>
      )}
      {diff.isError && (
        <p className={styles.errorText}>Diff failed: {(diff.error as Error)?.message ?? "unknown error"}</p>
      )}

      {result && (
        <>
          {result.narrative && (
            <div className={styles.narrative}>
              <div className={styles.narrativeLabel}>How the business model changed</div>
              <p>{result.narrative}</p>
            </div>
          )}
          <div className={styles.blocks}>
            {result.block_diffs.map((d) => {
              const changed = blockChanged(d);
              return (
                <div key={d.block_id} className={cn(styles.block, !changed && styles.blockSame)}>
                  <div className={styles.blockTitle}>{d.title ?? BLOCK_TITLES[d.block_id] ?? d.block_id}</div>
                  {changed ? (
                    <>
                      <DiffList items={d.added} kind="added" />
                      <DiffList items={d.changed} kind="changed" />
                      <DiffList items={d.removed} kind="removed" />
                      {d.narrative && <p className={styles.blockNarrative}>{d.narrative}</p>}
                    </>
                  ) : (
                    <p className={styles.noChange}>No material change</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
