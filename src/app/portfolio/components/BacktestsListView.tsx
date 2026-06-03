"use client";

import * as React from "react";

import { useDialog } from "@/components/Dialog";
import TrashIcon from "@/components/TrashIcon";
import { useBacktests, useDeleteBacktest, type BacktestStatus } from "@/lib/api/portfolio";
import { cn } from "@/lib/utils";

import styles from "./saved.module.css";

const UNIVERSE_NAMES: Record<number, string> = {
  1: "Nifty 50", 2: "Nifty Next 50", 3: "Nifty 100", 4: "Nifty 200", 5: "Nifty 500",
};

const STATUS_CLASS: Record<BacktestStatus, string> = {
  queued: styles.stQueued,
  running: styles.stRunning,
  succeeded: styles.stOk,
  failed: styles.stFail,
  cancelled: styles.stFail,
};

function ago(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

/** Running + recent backtests — the way back to an in-progress run after you
 *  navigate away. Auto-refreshes so live progress is visible here too. */
export default function BacktestsListView({ onOpen }: { onOpen: (jobId: string) => void }) {
  const dialog = useDialog();
  const jobs = useBacktests();
  const del = useDeleteBacktest();
  const items = jobs.data ?? [];
  const anyActive = items.some((j) => j.status === "queued" || j.status === "running");

  // Refetch while anything is active so this list shows live progress.
  React.useEffect(() => {
    if (!anyActive) return;
    const id = setInterval(() => jobs.refetch(), 2000);
    return () => clearInterval(id);
  }, [anyActive, jobs]);

  if (jobs.isLoading) return <div className={styles.empty}>Loading backtests…</div>;
  if (jobs.isError) return <div className={styles.error}>Couldn&apos;t load backtests.</div>;
  if (items.length === 0) {
    return <div className={styles.empty}>No backtests yet. Build a portfolio, then <b>Open detailed backtest</b> — runs show up here so you can step away and come back.</div>;
  }

  return (
    <div className={styles.list}>
      {items.map((j) => {
        const spec = j.spec as { index_id?: number; frequency?: string; start?: string; end?: string };
        const uni = UNIVERSE_NAMES[spec.index_id ?? 0] ?? `Index ${spec.index_id}`;
        const active = j.status === "queued" || j.status === "running";
        return (
          <div key={j.id} className={styles.row}>
            <div className={styles.rowMain}>
              <div className={styles.rowName}>
                {j.name ?? `${uni} backtest`}
                <span className={cn(styles.statusBadge, STATUS_CLASS[j.status])}>
                  {j.status}{active ? ` · ${Math.round(j.progress * 100)}%` : ""}
                </span>
              </div>
              <div className={styles.rowMeta}>
                {uni} · {spec.frequency ?? "—"} · {spec.start} → {spec.end} · {ago(j.created_at)}
                {j.status === "running" && j.stage ? ` · ${j.stage}` : ""}
                {j.status === "failed" && j.error ? ` · ${j.error}` : ""}
              </div>
            </div>
            <div className={styles.rowActions}>
              <button className={styles.openBtn} onClick={() => onOpen(j.id)}>
                {active ? "View progress →" : "Open →"}
              </button>
              <button
                className={styles.delBtn}
                title="Delete backtest"
                aria-label="Delete backtest"
                disabled={del.isPending}
                onClick={async () => {
                  const ok = await dialog.confirm({
                    title: "Delete backtest?",
                    message: `Delete “${j.name ?? `${uni} backtest`}”? This removes the run and its results.`,
                    confirmLabel: "Delete", danger: true,
                  });
                  if (ok) del.mutate(j.id);
                }}
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
