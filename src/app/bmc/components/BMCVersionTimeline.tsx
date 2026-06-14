"use client";

import { History } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { useBMCLibrary } from "@/lib/api/bmc";
import styles from "./BMCVersionTimeline.module.css";

interface Props {
  ticker: string | null;
  activeVersion: number | null;
  latestVersion: number | null;
  onSelect: (version: number) => void;
}

/** Immutable version history — each regenerate creates a new version. Lets the
 *  analyst step back to a prior canvas. Hidden when only one version exists. */
export default function BMCVersionTimeline({ ticker, activeVersion, latestVersion, onSelect }: Props) {
  const { data: versions } = useBMCLibrary(ticker);
  // Defensive: only render with a real array of ≥2 versions.
  if (!Array.isArray(versions) || versions.length <= 1) return null;

  // Newest first.
  const ordered = [...versions].sort((a, b) => b.version - a.version);

  return (
    <div className={styles.wrap}>
      <span className={styles.label}><History size={12} /> Versions</span>
      <div className={styles.row}>
        {ordered.map((v) => (
          <button
            key={v.version}
            type="button"
            className={cn(styles.chip, v.version === activeVersion && styles.chipActive)}
            onClick={() => onSelect(v.version)}
            title={`${v.status}${v.overall_confidence != null ? ` · ${Math.round(v.overall_confidence * 100)}%` : ""}`}
          >
            <span className={styles.chipV}>v{v.version}</span>
            {v.version === latestVersion && <span className={styles.latest}>latest</span>}
            {v.fiscal_period && <span className={styles.chipMeta}>{v.fiscal_period}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
