"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  daysUntil,
  formatRegDate,
  typeMeta,
  useRegDeadlines,
  useRegRecent,
  useRegStats,
} from "@/lib/api/regulatory";

import { DocRow, EmptyState, SkeletonRows } from "./parts";
import styles from "./regulatory.module.css";

interface Props {
  onOpenDoc: (id: number) => void;
  onGoLibrary: (type?: string) => void;
  onGoCalendar: () => void;
  onGoDigest: () => void;
}

export default function RegDashboard({
  onOpenDoc,
  onGoLibrary,
  onGoCalendar,
  onGoDigest,
}: Props) {
  const stats = useRegStats();
  const recent = useRegRecent(8);
  const deadlines = useRegDeadlines(6);

  const s = stats.data;
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroEyebrow}>{today}</div>
        <h1 className={styles.heroTitle}>
          SEBI Regulatory Intelligence —{" "}
          <span className={styles.heroEm}>
            {s ? s.this_week.toLocaleString() : "—"} new
          </span>{" "}
          updates in the last 7 days.
        </h1>
        <p className={styles.heroText}>
          Circulars, regulations, enforcement orders and board outcomes from the
          full SEBI corpus — AI-tagged by intent, severity and compliance impact,
          with upcoming deadlines surfaced automatically.
        </p>
        <div className={styles.heroActions}>
          <button className={styles.quickPrompt} onClick={() => onGoDigest()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            </svg>
            Read weekly digest
          </button>
          <button className={styles.quickPrompt} onClick={() => onGoCalendar()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
            </svg>
            Upcoming deadlines
          </button>
          <button className={styles.quickPrompt} onClick={() => onGoLibrary("ORDER")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
            Enforcement orders
          </button>
        </div>
      </section>

      {/* Stat cards */}
      {stats.isLoading ? (
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      ) : s ? (
        <div className={styles.statGrid}>
          <StatCard
            label="New This Week"
            value={s.this_week}
            delta={`${s.today} today`}
            deltaClass={styles.deltaNeutral}
            context="Across all document types"
          />
          <StatCard
            label="Open Deadlines"
            value={s.open_deadlines}
            delta="upcoming"
            deltaClass={styles.deltaWarn}
            context="From AI-extracted dates"
          />
          <StatCard
            label="Action Required"
            value={s.action_required.toLocaleString()}
            delta="flagged"
            deltaClass={styles.deltaNeutral}
            context="Documents needing a response"
          />
          <StatCard
            label="High-Severity (7d)"
            value={s.high_severity_week}
            delta="high"
            deltaClass={styles.deltaNeg}
            context="Recent high-impact items"
          />
        </div>
      ) : null}

      {/* Latest + Action center */}
      <div className={styles.grid2}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>Latest from SEBI</span>
            <button className={styles.cardLink} onClick={() => onGoLibrary()}>
              View library →
            </button>
          </div>
          {recent.isLoading ? (
            <SkeletonRows n={6} />
          ) : recent.isError ? (
            <div className={styles.errorBox}>Couldn&apos;t load recent documents.</div>
          ) : recent.data && recent.data.length > 0 ? (
            <div className={styles.docList}>
              {recent.data.map((d) => (
                <DocRow key={d.id} doc={d} onOpen={onOpenDoc} />
              ))}
            </div>
          ) : (
            <EmptyState title="No documents" text="The corpus appears empty." />
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>Action Center</span>
            <button className={styles.cardLink} onClick={() => onGoCalendar()}>
              Calendar →
            </button>
          </div>
          {deadlines.isLoading ? (
            <SkeletonRows n={5} />
          ) : deadlines.data && deadlines.data.items.length > 0 ? (
            <div className={styles.docList}>
              {deadlines.data.items.map((d) => {
                const days = daysUntil(d.deadline);
                const urgent = !Number.isNaN(days) && days <= 5;
                const meta = typeMeta(d.type);
                return (
                  <button
                    type="button"
                    key={`${d.id}-${d.deadline}`}
                    className={styles.actionRow}
                    onClick={() => onOpenDoc(d.id)}
                  >
                    <span className={cn(styles.actionIcon, urgent ? styles.sevHi : styles.sevMed)}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </span>
                    <span className={styles.actionBody}>
                      <span className={styles.actionTitle}>{d.title}</span>
                      <span className={styles.actionMeta}>
                        <span>{meta.short}</span>
                        <span className={styles.dotSep} />
                        <span>due {formatRegDate(d.deadline)}</span>
                      </span>
                    </span>
                    <span className={cn(styles.countdown, urgent && styles.countdownUrgent)}>
                      {Number.isNaN(days) ? "—" : days <= 0 ? "due" : `${days}d`}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyState title="No upcoming deadlines" text="Nothing due in the tracked window." />
          )}
        </section>
      </div>

      {/* Browse by type */}
      {s && s.type_counts.length > 0 && (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>Browse by type</span>
          </div>
          <div className={styles.filterPills}>
            {s.type_counts.map((t) => (
              <button
                key={t.type}
                className={styles.filterPill}
                onClick={() => onGoLibrary(t.type)}
              >
                {typeMeta(t.type).label}
                <span className={styles.pillCount}>{t.count.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function StatCard({
  label,
  value,
  delta,
  deltaClass,
  context,
}: {
  label: string;
  value: number | string;
  delta: string;
  deltaClass: string;
  context: string;
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <span className={cn(styles.statDelta, deltaClass)}>{delta}</span>
      <div className={styles.statContext}>{context}</div>
    </div>
  );
}
