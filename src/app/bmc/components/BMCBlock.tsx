"use client";

import * as React from "react";
import { MessageCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BMCBlock as BMCBlockData, BMCEvidence } from "@/lib/api/bmc";
import styles from "./BMCBlock.module.css";

interface BMCBlockProps {
  block: BMCBlockData;
  /** Company name — used as the citation popover's title (matches chat). */
  companyName?: string;
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
  companyName?: string,
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
            <span key={j} className={styles.citeWrap} tabIndex={0}>
              <button
                type="button"
                className={cn(styles.cite, clickable && styles.citeLink)}
                onClick={clickable ? () => onOpenPdf!(ev!) : undefined}
                disabled={!clickable}
                aria-label={ev?.page != null ? `Source, page ${ev.page}` : `Source ${n}`}
              >
                {n}
              </button>
              {ev && (
                <span role="tooltip" className={styles.citePopover}>
                  <span className={styles.citePopoverLabel}>
                    {companyName ?? "Filing"}{ev.page != null ? ` — p.${ev.page}` : ""}
                  </span>
                  <span className={styles.citePopoverMeta}>
                    <span className={styles.citePopoverKind}>filing</span>
                    {ev.page != null && <span>· p.{ev.page}</span>}
                  </span>
                  {clickable && (
                    <button
                      type="button"
                      className={styles.citePopoverLink}
                      onClick={() => onOpenPdf!(ev)}
                    >
                      Open PDF{ev.page != null ? ` at p.${ev.page}` : ""} ↗
                    </button>
                  )}
                </span>
              )}
            </span>
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

export default function BMCBlock({ block, companyName, onOpenPdf, onDrillDown, className }: BMCBlockProps) {
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
        {/* Only flag confidence when it's notable — well-grounded blocks stay
            clean (showing the same high % on all nine reads as noise). */}
        {block.status !== "ok" ? (
          <span className={cn(styles.confidence, styles.confMissing)}>no evidence</span>
        ) : block.confidence < 0.75 ? (
          <span
            className={cn(styles.confidence, confidenceClass(block.confidence))}
            title="Filing-evidence confidence for this block — lower means thinner disclosure"
          >
            {Math.round(block.confidence * 100)}% confidence
          </span>
        ) : null}
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
                  {renderBullet(bullet, evidenceByMarker, onOpenPdf, companyName)}
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
            title="Open the sources and ask a follow-up about this block"
          >
            <MessageCircle size={12} /> Ask about this block
            <span className={styles.drillCount}>· {block.evidence.length} source{block.evidence.length === 1 ? "" : "s"}</span>
          </button>
        </footer>
      )}
    </section>
  );
}
