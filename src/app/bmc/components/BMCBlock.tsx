"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { BMCBlock as BMCBlockData } from "@/lib/api/bmc";
import styles from "./BMCBlock.module.css";

interface BMCBlockProps {
  block: BMCBlockData;
  /** Called when a citation marker is clicked, with the marker text e.g. "[2]". */
  onCiteClick?: (block: BMCBlockData, marker: string) => void;
  className?: string;
}

/** Render bullet text with `[n]` / `[1, 2]` markers as clickable superscripts. */
function renderBullet(
  text: string,
  onMarker: (marker: string) => void,
): React.ReactNode[] {
  const parts = text.split(/(\[[\d,\s]+\])/g);
  return parts.map((part, i) => {
    if (/^\[[\d,\s]+\]$/.test(part)) {
      return (
        <button
          key={i}
          type="button"
          className={styles.cite}
          onClick={() => onMarker(part)}
          title={`View source ${part}`}
        >
          {part}
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function confidenceClass(c: number): string {
  if (c >= 0.75) return styles.confPos;
  if (c >= 0.4) return styles.confWarn;
  return styles.confNeg;
}

export default function BMCBlock({ block, onCiteClick, className }: BMCBlockProps) {
  const isEmpty = block.status !== "ok" || block.summary_bullets.length === 0;

  return (
    <div className={cn(styles.block, className)}>
      <div className={styles.header}>
        <h3 className={styles.title}>{block.title}</h3>
        {block.status === "ok" && (
          <span className={cn(styles.confidence, confidenceClass(block.confidence))}>
            {Math.round(block.confidence * 100)}%
          </span>
        )}
      </div>

      <div className={styles.body}>
        {isEmpty ? (
          <p className={styles.empty}>
            No filing evidence found — not enough disclosure to ground this block.
          </p>
        ) : (
          <ul className={styles.bullets}>
            {block.summary_bullets.map((bullet, i) => (
              <li key={i} className={styles.bullet}>
                <span className={styles.bulletDot} />
                <span className={styles.bulletText}>
                  {renderBullet(bullet, (m) => onCiteClick?.(block, m))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {block.key_insights && block.key_insights.length > 0 && (
        <div className={styles.tags}>
          {block.key_insights.map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
