"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { BMCBlock as BMCBlockData, BMCEvidence } from "@/lib/api/bmc";
import styles from "./BMCBlock.module.css";

interface BMCBlockProps {
  block: BMCBlockData;
  /** Open the source PDF for a cited fact (deep-links to the page). */
  onOpenPdf?: (ev: BMCEvidence) => void;
  /** Open the per-block evidence + drill-down chat panel. */
  onDrillDown?: (block: BMCBlockData) => void;
  className?: string;
}

/**
 * Render bullet text, turning each `[N]` citation marker into a clickable
 * superscript that opens the cited source PDF at its page (reusing the same
 * FilingPdfViewer the chat uses). The service emits unique `[N]` markers per
 * block, so we resolve each to its evidence row by marker string.
 */
function renderBullet(
  text: string,
  evidenceByMarker: Map<string, BMCEvidence>,
  onOpenPdf?: (ev: BMCEvidence) => void,
): React.ReactNode[] {
  const parts = text.split(/(\[[\d,\s]+\])/g);
  return parts.map((part, i) => {
    if (!/^\[[\d,\s]+\]$/.test(part)) return <span key={i}>{part}</span>;
    // A marker may be combined ("[1, 2]"); render each number as its own chip.
    const nums = part.replace(/[[\]\s]/g, "").split(",").filter(Boolean);
    return (
      <sup key={i} className={styles.citeGroup}>
        {nums.map((n, j) => {
          const ev = evidenceByMarker.get(`[${n}]`);
          const clickable = !!ev?.pdf_url && !!onOpenPdf;
          return (
            <button
              key={j}
              type="button"
              className={cn(styles.cite, clickable && styles.citeLink)}
              onClick={clickable ? () => onOpenPdf!(ev!) : undefined}
              disabled={!clickable}
              title={
                ev
                  ? `${ev.page != null ? `p.${ev.page}` : "source"} — ${ev.excerpt.slice(0, 90)}${ev.excerpt.length > 90 ? "…" : ""}`
                  : `Source [${n}]`
              }
            >
              {n}
            </button>
          );
        })}
      </sup>
    );
  });
}

function confidenceClass(c: number): string {
  if (c >= 0.75) return styles.confPos;
  if (c >= 0.4) return styles.confWarn;
  return styles.confNeg;
}

export default function BMCBlock({ block, onOpenPdf, onDrillDown, className }: BMCBlockProps) {
  const isEmpty = block.status !== "ok" || block.summary_bullets.length === 0;
  const evidenceByMarker = React.useMemo(() => {
    const m = new Map<string, BMCEvidence>();
    for (const ev of block.evidence) m.set(ev.marker, ev);
    return m;
  }, [block.evidence]);

  return (
    <section className={cn(styles.block, className)} aria-label={block.title}>
      <header className={styles.header}>
        <h3 className={styles.title}>{block.title}</h3>
        {block.status === "ok" ? (
          <span
            className={cn(styles.confidence, confidenceClass(block.confidence))}
            title="Filing-evidence confidence for this block"
          >
            {Math.round(block.confidence * 100)}%
          </span>
        ) : (
          <span className={cn(styles.confidence, styles.confMissing)}>no evidence</span>
        )}
      </header>

      <div className={styles.body}>
        {isEmpty ? (
          <p className={styles.empty}>
            Not enough disclosure in the filings to ground this block.
          </p>
        ) : (
          <ul className={styles.bullets}>
            {block.summary_bullets.map((bullet, i) => (
              <li key={i} className={styles.bullet}>
                <span className={styles.bulletDot} aria-hidden />
                <span className={styles.bulletText}>
                  {renderBullet(bullet, evidenceByMarker, onOpenPdf)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {block.key_insights && block.key_insights.length > 0 && (
          <div className={styles.insights}>
            <div className={styles.insightsLabel}>Key takeaways</div>
            <ul className={styles.insightsList}>
              {block.key_insights.map((tip, i) => (
                <li key={i} className={styles.insight}>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {block.evidence.length > 0 && (
        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.drillBtn}
            onClick={() => onDrillDown?.(block)}
          >
            {block.evidence.length} source{block.evidence.length === 1 ? "" : "s"} · ask
          </button>
        </footer>
      )}
    </section>
  );
}
