"use client";

import * as React from "react";

import type { Security } from "@/lib/api/stocks";
import { cn } from "@/lib/utils";

import styles from "./stocks.module.css";

/** Chips for the securities the user opened most recently (localStorage). */
export default function RecentlyViewed({
  recent,
  onSelect,
}: {
  recent: Security[];
  onSelect: (s: Security) => void;
}) {
  if (recent.length === 0) return null;
  return (
    <section className={styles.sideCard}>
      <h3 className={styles.ovTitle}>Recently viewed</h3>
      <div className={styles.chipRow}>
        {recent.map((s) => (
          <button key={s.security_id} className={styles.secChip} onClick={() => onSelect(s)}>
            <span className={cn(styles.exchBadge, s.exchange === "BSE" ? styles.exchBse : styles.exchNse)}>
              {s.exchange}
            </span>
            <span className={styles.secChipName}>{s.symbol ?? s.security_name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
