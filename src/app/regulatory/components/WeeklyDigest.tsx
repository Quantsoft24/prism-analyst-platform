"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { formatRegDate, useRegWeeklySummaries, type WeeklySummary } from "@/lib/api/regulatory";

import { SkeletonRows, EmptyState } from "./parts";
import styles from "./regulatory.module.css";

export default function WeeklyDigest() {
  const { data, isLoading, isError } = useRegWeeklySummaries(12);
  const items = React.useMemo(() => data?.items ?? [], [data]);
  const [selectedId, setSelectedId] = React.useState<number | null>(null);

  const selected = React.useMemo(
    () => items.find((w) => w.id === selectedId) ?? items[0],
    [items, selectedId],
  );

  if (isLoading) return <SkeletonRows n={6} />;
  if (isError)
    return <div className={styles.errorBox}>Couldn&apos;t load the weekly digests.</div>;
  if (items.length === 0)
    return (
      <EmptyState
        title="No digests yet"
        text="Weekly summaries are generated on a schedule — check back soon."
      />
    );

  return (
    <>
      <div className={styles.reportsGrid}>
        {items.slice(0, 6).map((w, i) => (
          <button
            key={w.id}
            className={cn(styles.reportTile, selected?.id === w.id && styles.reportTileActive)}
            onClick={() => setSelectedId(w.id)}
          >
            <span className={styles.reportTileCat}>{i === 0 ? "This week" : "Archive"}</span>
            <div className={styles.reportTileTitle}>{weekTitle(w)}</div>
            <div className={styles.reportTileFoot}>
              <span>{formatRegDate(w.week_end_date)}</span>
              <span className={styles.dotSep} />
              <span>{bulletCount(w.summary_text)} highlights</span>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        <div className={styles.reportCard}>
          <div className={styles.reportHeader}>
            <div className={styles.reportEyebrow}>
              PRISM Weekly Digest · {weekRange(selected)}
            </div>
            <div className={styles.reportTitle}>{weekTitle(selected)}</div>
            <div className={styles.reportMeta}>
              <span>{bulletCount(selected.summary_text)} highlights</span>
              <span className={styles.dotSep} />
              <span>Generated {formatRegDate(selected.generated_at)}</span>
            </div>
          </div>
          <div className={styles.reportBody}>
            <DigestBody text={selected.summary_text ?? ""} />
          </div>
        </div>
      )}
    </>
  );
}

/* ── Digest body: render "• bullet" lines with **bold** segments. ── */
function DigestBody({ text }: { text: string }) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const bullets = lines.filter((l) => l.startsWith("•") || l.startsWith("-") || l.startsWith("*"));
  const useBullets = bullets.length >= 2;

  if (useBullets) {
    return (
      <div>
        {bullets.map((l, i) => (
          <div key={i} className={styles.digestBullet}>
            <span className={styles.digestBulletDot} />
            <span className={styles.digestText}>{renderBold(l.replace(/^[•\-*]\s*/, ""))}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={styles.digestText}>
      {lines.map((l, i) => (
        <p key={i} style={{ marginBottom: 10 }}>
          {renderBold(l)}
        </p>
      ))}
    </div>
  );
}

/** Render **bold** markdown segments as <strong>. */
function renderBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

function weekRange(w: WeeklySummary): string {
  const a = formatRegDate(w.week_start_date);
  const b = formatRegDate(w.week_end_date);
  return a && b ? `${a} – ${b}` : a || b || "";
}

function weekTitle(w: WeeklySummary): string {
  if (w.week_start_date) {
    const d = new Date(w.week_start_date);
    if (!Number.isNaN(d.getTime())) {
      const week = isoWeek(d);
      return `Week ${week}, ${d.getFullYear()}`;
    }
  }
  return "Weekly Digest";
}

function bulletCount(text?: string | null): number {
  if (!text) return 0;
  return text.split("\n").filter((l) => /^\s*[•\-*]/.test(l)).length || 1;
}

function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
