"use client";

import * as React from "react";

import { useCompanySummary, verdictLabel, type SentimentBreakdown } from "@/lib/api/news";
import { cn } from "@/lib/utils";

import styles from "./news.module.css";

interface WatchlistPulseProps {
  watchlist: string[];
  hours: number;
  onRemove: (company: string) => void;
}

/**
 * Watchlist Pulse — one compact card per watched company showing its live news
 * verdict + breakdown bar. Each card owns its own summary query (React Query
 * hooks can't loop), so adding a name fires one request and cards refresh
 * independently on the 5-min cadence. CSS Modules.
 */
export default function WatchlistPulse({
  watchlist,
  hours,
  onRemove,
}: WatchlistPulseProps) {
  // Parent only renders this when the watchlist is non-empty (it's the
  // per-company sentiment dashboard above the feed). Empty-state + company
  // selection now live in the chips bar in NewsView.
  if (watchlist.length === 0) return null;

  return (
    <div className={styles.watchGrid}>
      {watchlist.map((company) => (
        <WatchlistCard
          key={company}
          company={company}
          hours={hours}
          onRemove={() => onRemove(company)}
        />
      ))}
    </div>
  );
}

function verdictClass(trend?: string): string {
  if (trend === "bullish") return styles.tPos;
  if (trend === "bearish") return styles.tNeg;
  return styles.tNeu;
}

function WatchlistCard({
  company,
  hours,
  onRemove,
}: {
  company: string;
  hours: number;
  onRemove: () => void;
}) {
  const { data, isLoading, isError } = useCompanySummary(company, hours);

  return (
    <div className={styles.watchCard}>
      <button className={styles.watchRemove} onClick={onRemove} aria-label={`Remove ${company}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className={styles.watchName}>{company}</div>

      {isLoading && <div className={styles.watchNote}>Scoring latest news…</div>}

      {isError && (
        <div className={styles.watchNote}>Sentiment unavailable — refreshes automatically.</div>
      )}

      {data && !isLoading && (
        data.total_articles === 0 ? (
          <div className={styles.watchNote}>No news in the last {hours}h.</div>
        ) : (
          <>
            <div className={cn(styles.verdict, verdictClass(data.trend))}>
              {verdictLabel(data.trend)}
            </div>
            <BreakdownBar breakdown={data.sentiment_breakdown} />
            <div className={styles.watchMeta}>
              <span>{data.total_articles} articles · {hours}h</span>
              {data.provider === "heuristic" && (
                <span className={styles.heuristic} title="OpenAI was rate-limited; lower-confidence read">
                  heuristic
                </span>
              )}
            </div>
          </>
        )
      )}
    </div>
  );
}

function BreakdownBar({ breakdown }: { breakdown: SentimentBreakdown }) {
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
      <div className={styles.barLegend}>
        <span className={styles.legendItem}><i className={cn(styles.legendDot, styles.bgPos)} />{pos}</span>
        <span className={styles.legendItem}><i className={cn(styles.legendDot, styles.bgNeu)} />{neu}</span>
        <span className={styles.legendItem}><i className={cn(styles.legendDot, styles.bgNeg)} />{neg}</span>
      </div>
    </div>
  );
}
