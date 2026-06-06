"use client";

import * as React from "react";
import { keepPreviousData } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import {
  FEED_PAGE_SIZE,
  formatRegDate,
  typeMeta,
  useRegFeed,
  useRegTypes,
  type RegDocSummary,
  type Severity,
} from "@/lib/api/regulatory";

import { Pager, SkeletonRows, EmptyState, TypeGlyph, toneClass, sevClass } from "./parts";
import styles from "./regulatory.module.css";

const SEVERITIES: Severity[] = ["High", "Medium", "Low"];

interface Props {
  initialType?: string;
  onOpenDoc: (id: number) => void;
}

export default function ContentLibrary({ initialType, onOpenDoc }: Props) {
  const [type, setType] = React.useState<string | undefined>(initialType);
  const [severity, setSeverity] = React.useState<Severity | undefined>(undefined);
  const [actionOnly, setActionOnly] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [page, setPage] = React.useState(1);

  // Keep the type in sync if the parent deep-links a new one.
  React.useEffect(() => setType(initialType), [initialType]);

  // Debounce the search box (400ms).
  React.useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Reset to page 1 whenever a filter changes.
  React.useEffect(() => setPage(1), [type, severity, actionOnly, search, dateFrom, dateTo]);

  const types = useRegTypes();
  const totalDocs = React.useMemo(
    () => (types.data ?? []).reduce((sum, t) => sum + t.count, 0),
    [types.data],
  );

  const feed = useRegFeed(
    {
      page,
      limit: FEED_PAGE_SIZE,
      type,
      severity,
      action_required: actionOnly || undefined,
      search: search || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    },
    { placeholderData: keepPreviousData },
  );

  const data = feed.data;
  const groups = React.useMemo(() => groupByMonth(data?.items ?? []), [data]);

  // Show the skeleton (not stale data) while the *filters* change. `feed` uses
  // keepPreviousData so the list stays put during refetch — great for page
  // changes (flicker-free) but it makes a filter change look frozen for a beat.
  // This gates a loader on any filter/search change; page changes still
  // keep-previous.
  const scopeKey = `${type ?? ""}|${severity ?? ""}|${actionOnly}|${search}|${dateFrom}|${dateTo}`;
  const [scopeLoading, setScopeLoading] = React.useState(false);
  const prevScope = React.useRef(scopeKey);
  React.useEffect(() => {
    if (prevScope.current !== scopeKey) {
      prevScope.current = scopeKey;
      setScopeLoading(true);
    }
  }, [scopeKey]);
  React.useEffect(() => {
    if (scopeLoading && !feed.isFetching) setScopeLoading(false);
  }, [scopeLoading, feed.isFetching]);
  const showSkeleton = feed.isLoading || scopeLoading;

  // Open the native calendar picker when the date field (icon or text) is
  // clicked — makes the "calendar option" obvious, not just the tiny indicator.
  const openPicker = (e: React.MouseEvent<HTMLSpanElement>) => {
    const input = e.currentTarget.querySelector("input");
    try {
      input?.showPicker?.();
    } catch {
      /* showPicker unsupported / blocked — the native indicator still works. */
    }
  };

  return (
    <>
      <div className={styles.notice}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          The full SEBI corpus — circulars, regulations &amp; amendments, master
          circulars, board outcomes, enforcement orders and more — indexed and
          full-text searchable. Filters combine.
        </span>
      </div>

      {/* Type filter pills */}
      <div className={styles.toolbar}>
        <div className={styles.filterPills}>
          <button
            className={cn(styles.filterPill, !type && styles.filterPillActive)}
            onClick={() => setType(undefined)}
          >
            All
            {totalDocs > 0 && <span className={styles.pillCount}>{totalDocs.toLocaleString()}</span>}
          </button>
          {(types.data ?? []).map((t) => (
            <button
              key={t.type}
              className={cn(styles.filterPill, type === t.type && styles.filterPillActive)}
              onClick={() => setType(t.type)}
            >
              {typeMeta(t.type).label}
              <span className={styles.pillCount}>{t.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
        <div className={styles.toolbarSpacer} />
        <div className={styles.searchBox}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Search circulars, regulations, orders…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
      </div>

      {/* Severity (single-select) + an independent "Action required" toggle */}
      <div className={styles.toolbar}>
        <span className={styles.filterLabel}>Severity</span>
        <div className={styles.filterPills}>
          <button
            className={cn(styles.filterPill, !severity && styles.filterPillActive)}
            onClick={() => setSeverity(undefined)}
          >
            Any
          </button>
          {SEVERITIES.map((sv) => (
            <button
              key={sv}
              className={cn(styles.filterPill, severity === sv && styles.filterPillActive)}
              onClick={() => setSeverity((prev) => (prev === sv ? undefined : sv))}
            >
              {sv}
            </button>
          ))}
        </div>

        <span className={styles.vDivider} />

        {/* Independent toggle — a different filter dimension, so it reads as a
            checkbox rather than another severity option. */}
        <button
          className={cn(styles.toggleChip, actionOnly && styles.toggleChipOn)}
          onClick={() => setActionOnly((v) => !v)}
          aria-pressed={actionOnly}
        >
          <span className={styles.toggleCheck}>{actionOnly ? "✓" : ""}</span>
          Action required
        </button>

        <span className={styles.toolbarSpacer}>
          {showSkeleton ? (
            <span className={cn(styles.resultCount, styles.resultCountLoading)}>
              <span className={styles.spinner} />
              Filtering…
            </span>
          ) : data ? (
            <span className={styles.resultCount}>
              {data.total.toLocaleString()} result{data.total === 1 ? "" : "s"}
              {feed.isFetching ? " · loading page…" : ""}
            </span>
          ) : null}
        </span>
      </div>

      {/* Date range — clicking the field opens the native calendar picker */}
      <div className={styles.toolbar}>
        <span className={styles.filterLabel}>Date range</span>
        <div className={styles.dateRange}>
          <span className={styles.dateField} onClick={openPicker}>
            <svg className={styles.dateIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <input
              type="date"
              className={styles.dateInput}
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From date"
            />
          </span>
          <span className={styles.dateDash}>–</span>
          <span className={styles.dateField} onClick={openPicker}>
            <svg className={styles.dateIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <input
              type="date"
              className={styles.dateInput}
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To date"
            />
          </span>
          {(dateFrom || dateTo) && (
            <button
              className={styles.clearDate}
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {showSkeleton ? (
        <SkeletonRows n={8} />
      ) : feed.isError ? (
        <div className={styles.errorBox}>
          Couldn&apos;t load the content library. It auto-retries shortly.
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          title="No matching documents"
          text="Try clearing a filter or widening your search."
        />
      ) : (
        groups.map((g) => (
          <div key={g.key} className={styles.listCard}>
            <div className={styles.listHead}>
              <div className={styles.listHeadTitle}>{g.label}</div>
              <div className={styles.listHeadMeta}>{g.items.length} documents</div>
            </div>
            {g.items.map((d) => (
              <button
                type="button"
                key={d.id}
                className={styles.libRow}
                onClick={() => onOpenDoc(d.id)}
              >
                <span className={cn(styles.docIcon, toneClass(typeMeta(d.type).tone))}>
                  <TypeGlyph type={d.type} />
                </span>
                <span className={styles.docMain}>
                  <span className={styles.docTitle}>{d.title}</span>
                  <span className={styles.docMeta}>
                    <span className={cn(styles.docTag, toneClass(typeMeta(d.type).tone))}>
                      {typeMeta(d.type).short}
                    </span>
                    {d.ai_tags.severity && (
                      <span className={cn(styles.sev, sevClass(d.ai_tags.severity))}>
                        {d.ai_tags.severity}
                      </span>
                    )}
                    {d.sebi_department && (
                      <>
                        <span className={styles.dotSep} />
                        <span>{d.sebi_department}</span>
                      </>
                    )}
                  </span>
                </span>
                <span className={styles.libDate}>{formatRegDate(d.date)}</span>
              </button>
            ))}
          </div>
        ))
      )}

      {!showSkeleton && data && data.total_pages > 1 && (
        <Pager
          page={page}
          totalPages={data.total_pages}
          disabled={feed.isFetching}
          onGo={setPage}
        />
      )}
    </>
  );
}

interface MonthGroup {
  key: string;
  label: string;
  items: RegDocSummary[];
}

function groupByMonth(items: RegDocSummary[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const d of items) {
    const date = d.date ? new Date(d.date) : null;
    const key = date && !Number.isNaN(date.getTime())
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
      : "undated";
    const label =
      key === "undated"
        ? "Undated"
        : date!.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    if (!map.has(key)) map.set(key, { key, label, items: [] });
    map.get(key)!.items.push(d);
  }
  return [...map.values()];
}
