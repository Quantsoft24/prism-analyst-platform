"use client";

import * as React from "react";

import {
  compareRows,
  useNewsCompare,
  verdictLabel,
  type CompareRow,
  type SentimentBreakdown,
} from "@/lib/api/news";
import { cn } from "@/lib/utils";

import styles from "./news.module.css";

interface CompareModalProps {
  /** Companies to compare; modal is open iff this is non-empty. */
  companies: string[];
  hours: number;
  onClose: () => void;
}

/**
 * Side-by-side news-sentiment comparison across the watchlist, ranked
 * best→worst by average score. Reuses the scrim/drawer + breakdown-bar visual
 * language from the rest of the news feature. Read-only; aborts on close.
 */
export default function CompareModal({ companies, hours, onClose }: CompareModalProps) {
  const open = companies.length > 0;
  const { data, isLoading, isError } = useNewsCompare(open ? companies : [], hours);
  const rows = React.useMemo(() => compareRows(data), [data]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden />
      <aside className={styles.drawer} role="dialog" aria-label="Compare watchlist sentiment">
        <header className={styles.drawerHeader}>
          <div className={styles.drawerTitleWrap}>
            <div className={styles.drawerEyebrow}>Watchlist compare</div>
            <h2 className={styles.drawerTitle}>News sentiment · last {hours}h</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close compare">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className={styles.drawerBody}>
          {isLoading && (
            <div className={styles.skeletonList}>
              {companies.slice(0, 6).map((_, i) => (
                <div key={i} className={styles.skeletonRow} />
              ))}
            </div>
          )}

          {isError && (
            <div className={styles.drawerError}>
              Couldn&apos;t load the comparison — the news service may be warming up. Try again in a moment.
            </div>
          )}

          {!isLoading && !isError && rows.length === 0 && (
            <div className={styles.empty}>
              <div className={styles.emptyText}>
                No comparable sentiment yet for these names in the last {hours}h.
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <div className={styles.compareList}>
              {rows.map((r, i) => (
                <CompareRowItem key={r.company} row={r} rank={i + 1} />
              ))}
            </div>
          )}
        </div>

        <footer className={styles.drawerFooter}>
          Ranked best → worst by average news sentiment. Not investment advice.
        </footer>
      </aside>
    </>
  );
}

function verdictClass(trend?: string): string {
  if (trend === "bullish") return styles.tPos;
  if (trend === "bearish") return styles.tNeg;
  return styles.tNeu;
}

function CompareRowItem({ row, rank }: { row: CompareRow; rank: number }) {
  const total = row.total_articles ?? 0;
  return (
    <div className={styles.compareRow}>
      <div className={styles.compareRowHead}>
        <span className={styles.compareRank}>{rank}</span>
        <span className={styles.compareName}>{row.company}</span>
        <span className={cn(styles.compareVerdict, verdictClass(row.trend))}>
          {verdictLabel(row.trend)}
        </span>
      </div>
      <CompareBar breakdown={row.sentiment_breakdown} />
      <div className={styles.compareMeta}>
        {typeof row.avg_score === "number" && <span>score {row.avg_score.toFixed(2)}</span>}
        {total > 0 && <span>· {total} articles</span>}
        {row.provider === "heuristic" && <span className={styles.heuristic}>· heuristic</span>}
      </div>
    </div>
  );
}

function CompareBar({ breakdown }: { breakdown?: SentimentBreakdown }) {
  const pos = breakdown?.positive ?? 0;
  const neg = breakdown?.negative ?? 0;
  const neu = breakdown?.neutral ?? 0;
  const total = pos + neg + neu || 1;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className={styles.bar}>
      <div className={styles.barTrack}>
        <div className={styles.barPos} style={{ width: pct(pos) }} />
        <div className={styles.barNeu} style={{ width: pct(neu) }} />
        <div className={styles.barNeg} style={{ width: pct(neg) }} />
      </div>
    </div>
  );
}
