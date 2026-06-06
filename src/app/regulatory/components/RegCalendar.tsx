"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  daysUntil,
  typeMeta,
  useRegCalendar,
  useRegDeadlines,
  type CalendarEvent,
} from "@/lib/api/regulatory";

import { SkeletonRows, EmptyState } from "./parts";
import styles from "./regulatory.module.css";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  onOpenDoc: (id: number) => void;
}

export default function RegCalendar({ onOpenDoc }: Props) {
  const now = new Date();
  const [ym, setYm] = React.useState<{ y: number; m: number }>({
    y: now.getFullYear(),
    m: now.getMonth(),
  });

  // Grid events for the visible month (deadlines + board meetings, past or
  // future) — refetched as the user navigates months.
  const monthStr = String(ym.m + 1).padStart(2, "0");
  const lastDay = new Date(ym.y, ym.m + 1, 0).getDate();
  const monthStart = `${ym.y}-${monthStr}-01`;
  const monthEnd = `${ym.y}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
  const cal = useRegCalendar(monthStart, monthEnd);
  const events = React.useMemo(() => cal.data?.events ?? [], [cal.data]);

  // Upcoming deadlines power the "Next 30 days" rail + the empty-month jump.
  const deadlines = useRegDeadlines(150);
  const upcoming = React.useMemo(() => deadlines.data?.items ?? [], [deadlines.data]);

  const byDate = React.useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [events]);

  const cells = React.useMemo(() => buildMonth(ym.y, ym.m), [ym]);
  const monthLabel = new Date(ym.y, ym.m, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
  const todayKey = fmtKey(now.getFullYear(), now.getMonth(), now.getDate());

  const next30 = React.useMemo(
    () =>
      upcoming
        .filter((d) => {
          const n = daysUntil(d.deadline);
          return !Number.isNaN(n) && n >= 0 && n <= 30;
        })
        .slice(0, 12),
    [upcoming],
  );

  // Jump to the next upcoming-deadline month when the visible one is empty.
  const monthPrefix = `${ym.y}-${monthStr}`;
  const nextDeadline = React.useMemo(
    () => upcoming.find((d) => d.deadline.slice(0, 7) > monthPrefix) ?? null,
    [upcoming, monthPrefix],
  );
  const jumpTo = (deadline: string) => {
    const [y, m] = deadline.split("-");
    setYm({ y: Number(y), m: Number(m) - 1 });
  };
  const monthLabelOf = (d: string) => {
    const [y, m] = d.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
  };

  return (
    <div className={styles.calLayout}>
      <div className={styles.calWrap}>
        <div className={styles.calTop}>
          <div className={styles.calMonthWrap}>
            <span className={styles.calMonth}>{monthLabel}</span>
            <span className={styles.calMonthCount}>
              {cal.isFetching ? (
                <>
                  <span className={styles.spinner} /> loading…
                </>
              ) : (
                `${events.length} event${events.length === 1 ? "" : "s"} this month`
              )}
            </span>
          </div>
          <div className={styles.calNav}>
            <button className={styles.calNavBtn} onClick={() => shift(-1, setYm)} aria-label="Previous month">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button
              className={styles.calNavBtn}
              onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}
              aria-label="Today"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /></svg>
            </button>
            <button className={styles.calNavBtn} onClick={() => shift(1, setYm)} aria-label="Next month">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>

        <div className={cn(styles.calGrid, cal.isLoading && styles.calGridLoading)}>
          {DOW.map((d) => (
            <div key={d} className={styles.calDow}>{d}</div>
          ))}
          {cells.map((c, i) => {
            const key = c ? fmtKey(ym.y, ym.m, c) : `pad-${i}`;
            const dayEvents = c ? byDate.get(key) ?? [] : [];
            return (
              <div
                key={key}
                className={cn(
                  styles.calCell,
                  !c && styles.calCellMuted,
                  c && key === todayKey && styles.calCellToday,
                )}
              >
                {c && <div className={styles.calNum}>{c}</div>}
                {dayEvents.slice(0, 3).map((e, j) => (
                  <button
                    key={`${e.id}-${e.kind}-${j}`}
                    className={cn(
                      styles.calEvent,
                      e.kind === "board" ? styles.calEventBoard : styles.calEventDeadline,
                    )}
                    title={`${e.kind === "board" ? "Board meeting" : "Deadline"}: ${e.title}`}
                    onClick={() => onOpenDoc(e.id)}
                  >
                    {e.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span className={styles.calMore}>+{dayEvents.length - 3} more</span>
                )}
              </div>
            );
          })}
        </div>

        <div className={styles.calLegend}>
          <span className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: "var(--neg)" }} />
            Compliance deadline
          </span>
          <span className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: "var(--info)" }} />
            Board meeting
          </span>
        </div>

        {!cal.isFetching && events.length === 0 && nextDeadline && (
          <div className={styles.calHint}>
            No events in {monthLabel}.
            <button className={styles.calJump} onClick={() => jumpTo(nextDeadline.deadline)}>
              Jump to {monthLabelOf(nextDeadline.deadline)} →
            </button>
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>Next 30 Days</span>
        </div>
        {deadlines.isLoading ? (
          <SkeletonRows n={5} />
        ) : next30.length > 0 ? (
          <div className={styles.docList}>
            {next30.map((d) => {
              const days = daysUntil(d.deadline);
              const urgent = days <= 5;
              const dt = new Date(d.deadline + "T00:00:00");
              const meta = typeMeta(d.type);
              return (
                <button
                  type="button"
                  key={`${d.id}-${d.deadline}`}
                  className={styles.deadlineItem}
                  onClick={() => onOpenDoc(d.id)}
                >
                  <span className={cn(styles.deadlineDate, urgent && styles.deadlineDateUrgent)}>
                    <span className="d">{dt.getDate()}</span>
                    <span className="m">{dt.toLocaleDateString("en-IN", { month: "short" })}</span>
                  </span>
                  <span className={styles.deadlineInfo}>
                    <span className={styles.deadlineTitle}>{d.title}</span>
                    <span className={styles.deadlineSub}>
                      {meta.label}
                      {d.severity ? ` · ${d.severity}` : ""}
                    </span>
                  </span>
                  <span className={cn(styles.countdown, urgent && styles.countdownUrgent)}>
                    {days <= 0 ? "due" : `${days}d`}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No deadlines" text="Nothing due in the next 30 days." />
        )}
      </div>
    </div>
  );
}

/* ── helpers ── */
function shift(delta: number, setYm: React.Dispatch<React.SetStateAction<{ y: number; m: number }>>) {
  setYm((prev) => {
    const d = new Date(prev.y, prev.m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
}

function fmtKey(y: number, m: number, day: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Returns an array of cells: leading nulls (pad), then 1..daysInMonth. */
function buildMonth(y: number, m: number): (number | null)[] {
  const firstDow = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
