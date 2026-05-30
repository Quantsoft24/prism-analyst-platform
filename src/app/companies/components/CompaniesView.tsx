"use client";

import * as React from "react";

import { ApiError } from "@/lib/api/client";
import { useCompanies, type ListCompaniesParams } from "@/lib/api/companies";
import type { CompanyRead } from "@/lib/api/types";

import styles from "./CompaniesView.module.css";

const PAGE_SIZE = 30;

interface CompaniesViewProps {
  /** Triggered when the user picks a company — host routes to chat research. */
  onSelect?: (ticker: string) => void;
}

/**
 * Companies coverage browser — PRISM's ~4,773-company India universe.
 *
 * Search by ticker / name / alias (server-side fuzzy), filter by sector, and
 * "Load more" to page through the whole universe (the previous version showed
 * only the first 25 with no way to reach the rest). Sector options accumulate
 * from real data so they always match what the API filters on. CSS Modules +
 * Lakshya tokens, matching the codebase convention.
 */
export default function CompaniesView({ onSelect }: CompaniesViewProps) {
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [sector, setSector] = React.useState<string | undefined>(undefined);
  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const [sectorOptions, setSectorOptions] = React.useState<string[]>([]);

  // Debounce search; reset paging whenever the query or sector changes.
  React.useEffect(() => {
    const h = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(h);
  }, [search]);
  React.useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [debouncedSearch, sector]);

  const params: ListCompaniesParams = {
    search: debouncedSearch || undefined,
    sector,
    limit,
    offset: 0,
  };
  const { data, isLoading, isError, error, refetch, isFetching } = useCompanies(params);

  const items = data?.items ?? [];
  const total = data?.page.total ?? 0;
  const hasMore = items.length < total;

  // Accumulate sector options from UNFILTERED results so the dropdown stays
  // complete even after a sector is selected (which would otherwise shrink the
  // visible set). Grows as the user loads more pages.
  React.useEffect(() => {
    if (sector || !data) return;
    setSectorOptions((prev) => {
      const seen = new Set(prev);
      for (const c of data.items) {
        const s = c.industry || c.sector;
        if (s) seen.add(s);
      }
      const next = [...seen].sort((a, b) => a.localeCompare(b));
      return next.length === prev.length ? prev : next;
    });
  }, [data, sector]);

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.title}>Coverage universe</h1>
        <p className={styles.subtitle}>
          PRISM&apos;s India coverage. Search by ticker, name, or alias (e.g.
          &quot;Tata&quot; finds TCS), or filter by sector. Click any company to
          start research. NSE-listed for now.
        </p>
      </header>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticker, name, or alias…"
            aria-label="Search companies"
          />
        </div>
        <select
          className={styles.sectorSelect}
          value={sector ?? ""}
          onChange={(e) => setSector(e.target.value || undefined)}
          aria-label="Filter by sector"
        >
          <option value="">All sectors</option>
          {/* Keep a selected sector visible even if not yet in the accumulated list */}
          {sector && !sectorOptions.includes(sector) && <option value={sector}>{sector}</option>}
          {sectorOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {data && (
          <span className={styles.count}>
            {total.toLocaleString()} {sector || debouncedSearch ? "matches" : "companies"}
            {isFetching && !isLoading ? " · refreshing…" : ""}
          </span>
        )}
      </div>

      {/* States */}
      {isLoading && (
        <div className={styles.grid}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      )}

      {isError && (
        <div className={styles.errorBox}>
          <div className={styles.stateTitle}>Couldn&apos;t load companies</div>
          <div className={styles.stateText}>{errorMessage(error)}</div>
          <button className={styles.retryBtn} onClick={() => refetch()}>Retry</button>
        </div>
      )}

      {data && items.length === 0 && !isLoading && (
        <div className={styles.empty}>
          <div className={styles.stateTitle}>No companies match</div>
          <div className={styles.stateText}>
            {debouncedSearch || sector
              ? "Try a different search term or clear the sector filter."
              : "The coverage catalog appears empty — check the backend connection."}
          </div>
        </div>
      )}

      {/* Results */}
      {items.length > 0 && (
        <>
          <div className={styles.grid}>
            {items.map((c) => (
              <CompanyCard key={c.id} company={c} onSelect={onSelect} />
            ))}
          </div>

          <div className={styles.loadMoreRow}>
            {hasMore ? (
              <button
                className={styles.loadMore}
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
                disabled={isFetching}
              >
                {isFetching ? "Loading…" : `Load more (${items.length.toLocaleString()} of ${total.toLocaleString()})`}
              </button>
            ) : (
              <span className={styles.endNote}>
                Showing all {total.toLocaleString()} {sector || debouncedSearch ? "matches" : "companies"}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CompanyCard({ company: c, onSelect }: { company: CompanyRead; onSelect?: (t: string) => void }) {
  // Dedupe: sector and industry are identical for most rows — show ONE tag,
  // preferring the more specific `industry`.
  const tag = c.industry || c.sector;
  return (
    <button type="button" className={styles.card} onClick={() => onSelect?.(c.ticker)}>
      <div className={styles.cardTop}>
        <div>
          <div className={styles.cardName}>{c.name}</div>
          <div className={styles.ticker}>
            <span className={styles.tickerExch}>{c.exchange}:</span> {c.ticker}
          </div>
        </div>
        <span className={styles.researchHint}>
          Research
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
          </svg>
        </span>
      </div>
      <div className={styles.cardMeta}>
        {tag && <span className={styles.sectorTag}>{tag}</span>}
        {c.isin && <span className={styles.isin}>{c.isin}</span>}
      </div>
    </button>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return `${error.status}: ${error.message}`;
  if (error instanceof Error) return error.message;
  return "Unknown error — the backend may be unreachable.";
}
