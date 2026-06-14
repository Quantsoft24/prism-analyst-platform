"use client";

import * as React from "react";
import { Search, LayoutGrid, ArrowRight, Library as LibraryIcon } from "lucide-react";

import { useBMCAllCanvases, type BMCLibraryEntry } from "@/lib/api/bmc";
import styles from "./BMCLibrary.module.css";

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

interface BMCLibraryProps {
  /** Open a canvas in the Home tab. */
  onOpen: (ticker: string, name?: string | null) => void;
}

function confidenceLabel(c: number | null): string {
  if (c == null) return "—";
  return `${Math.round(c * 100)}%`;
}

/** A meaningful short identifier for the card chip. */
function shortId(e: BMCLibraryEntry): string {
  if (e.isin) return e.isin;
  if (e.security_id_nse) return `NSE ${e.security_id_nse}`;
  if (e.security_id_bse) return `BSE ${e.security_id_bse}`;
  return e.ticker;
}

/** Firm-wide gallery of every saved Business Model Canvas. Search by company /
 *  ticker / sector; click a card to open it in the Home tab. Data comes from
 *  `useBMCAllCanvases` (mocked until the firm-wide endpoint ships). */
type SortKey = "recent" | "confidence" | "name";

export default function BMCLibrary({ onOpen }: BMCLibraryProps) {
  const { data, isLoading, isError } = useBMCAllCanvases();
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortKey>("recent");
  const [sector, setSector] = React.useState<string | null>(null);

  const entries = React.useMemo(() => data ?? [], [data]);

  // Distinct sectors present, for the filter chips.
  const sectors = React.useMemo(() => {
    const s = new Set<string>();
    entries.forEach((e) => e.sector && s.add(e.sector));
    return Array.from(s).sort();
  }, [entries]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = entries;
    if (sector) rows = rows.filter((e) => e.sector === sector);
    if (q) {
      rows = rows.filter(
        (e) =>
          e.company_name.toLowerCase().includes(q) ||
          e.ticker.toLowerCase().includes(q) ||
          (e.sector ?? "").toLowerCase().includes(q) ||
          (e.industry ?? "").toLowerCase().includes(q) ||
          (e.isin ?? "").toLowerCase().includes(q),
      );
    }
    const sorted = [...rows];
    if (sort === "name") {
      sorted.sort((a, b) => a.company_name.localeCompare(b.company_name));
    } else if (sort === "confidence") {
      sorted.sort((a, b) => (b.latest_overall_confidence ?? 0) - (a.latest_overall_confidence ?? 0));
    } else {
      // recent — last_generated_at DESC (server already does this, but re-sort
      // defensively so the toggle is authoritative after filtering).
      sorted.sort((a, b) => (a.last_generated_at < b.last_generated_at ? 1 : -1));
    }
    return sorted;
  }, [entries, query, sector, sort]);

  return (
    <div className={styles.library}>
      <div className={styles.head}>
        <div className={styles.headLeft}>
          <LibraryIcon size={18} className={styles.headIcon} />
          <div>
            <h2 className={styles.headTitle}>Canvas Library</h2>
            <p className={styles.headSub}>
              {isLoading
                ? "Loading saved canvases…"
                : `${entries.length} business model${entries.length === 1 ? "" : "s"} saved`}
            </p>
          </div>
        </div>
        <div className={styles.controls}>
          <div className={styles.searchBox}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search company, ticker, or sector…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search the canvas library"
            />
          </div>
          <select
            className={styles.sortSelect}
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort canvases"
          >
            <option value="recent">Recent</option>
            <option value="confidence">Confidence</option>
            <option value="name">A–Z</option>
          </select>
        </div>
      </div>

      {sectors.length > 1 && (
        <div className={styles.filterChips}>
          <button
            type="button"
            className={cn(styles.chip, !sector && styles.chipActive)}
            onClick={() => setSector(null)}
          >
            All
          </button>
          {sectors.map((s) => (
            <button
              key={s}
              type="button"
              className={cn(styles.chip, sector === s && styles.chipActive)}
              onClick={() => setSector(sector === s ? null : s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeletonCard} />
          ))}
        </div>
      )}

      {isError && (
        <p className={styles.errorText}>Couldn&apos;t load the library. Try again shortly.</p>
      )}

      {!isLoading && !isError && filtered.length === 0 && (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>
            {entries.length === 0 ? "No canvases yet." : `No matches for “${query}”.`}
          </p>
          <p className={styles.emptyHint}>
            {entries.length === 0
              ? "Generate one from the Home tab — pick a company and click Generate."
              : "Try a different company, ticker, or sector."}
          </p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className={styles.grid}>
          {filtered.map((e) => (
            <LibraryCard key={e.ticker} entry={e} onOpen={() => onOpen(e.ticker, e.company_name)} />
          ))}
        </div>
      )}
    </div>
  );
}

function LibraryCard({ entry, onOpen }: { entry: BMCLibraryEntry; onOpen: () => void }) {
  return (
    <button type="button" className={styles.card} onClick={onOpen} title={`Open ${entry.company_name}'s canvas`}>
      <div className={styles.cardTop}>
        <span className={styles.cardTicker}>{shortId(entry)}</span>
        <span
          className={cn(
            styles.statusBadge,
            entry.latest_status === "complete" ? styles.statusComplete : styles.statusPartial,
          )}
        >
          {entry.latest_status}
        </span>
      </div>
      <h3 className={styles.cardName}>{entry.company_name}</h3>
      {(entry.sector || entry.industry) && (
        <p className={styles.cardSector}>
          {[entry.sector, entry.industry].filter(Boolean).join(" · ")}
        </p>
      )}

      <div className={styles.cardMeta}>
        <span className={styles.metaItem}>
          <LayoutGrid size={12} /> v{entry.latest_version}
          {entry.version_count > 1 ? ` · ${entry.version_count} versions` : ""}
        </span>
        <span className={styles.metaItem}>conf {confidenceLabel(entry.latest_overall_confidence)}</span>
      </div>

      <div className={styles.cardFoot}>
        <span className={styles.cardDate}>Updated {entry.last_generated_at.slice(0, 10)}</span>
        <span className={styles.cardOpen}>
          Open <ArrowRight size={13} />
        </span>
      </div>
    </button>
  );
}
