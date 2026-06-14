"use client";

import * as React from "react";
import { ArrowRight, Layers, Sparkles, TrendingUp, Clock, Plus } from "lucide-react";

import SecuritySearch from "@/app/stocks/components/SecuritySearch";
import { useBMCAllCanvases, type BMCLibraryEntry } from "@/lib/api/bmc";
import { useTopCompanies } from "@/lib/api/stocks";
import styles from "./BMCHome.module.css";

const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

interface BMCHomeProps {
  /** Pick any NSE/BSE company from the hero search → open it in canvas view. */
  onPickCompany: (s: { symbol: string | null; security_id: number; security_name: string | null }) => void;
  /** Open an already-saved canvas (Continue cards). */
  onOpen: (ticker: string, name?: string | null) => void;
  /** Start building a suggested company (symbol + security_id). */
  onBuild: (symbol: string, securityId: number, name: string | null) => void;
}

/** The /bmc Home — an analyst dashboard (NOT the full gallery, which lives in
 *  Library). Distills: build a canvas (hero), coverage at-a-glance, continue
 *  recent work, and data-driven suggestions of what to build next. */
export default function BMCHome({ onPickCompany, onOpen, onBuild }: BMCHomeProps) {
  const lib = useBMCAllCanvases();
  const entries = React.useMemo(() => lib.data ?? [], [lib.data]);

  const stats = React.useMemo(() => {
    const sectors = new Set(entries.map((e) => e.sector).filter(Boolean));
    const confs = entries
      .map((e) => e.latest_overall_confidence)
      .filter((c): c is number => c != null);
    const avg = confs.length ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 100) : null;
    return { count: entries.length, sectors: sectors.size, avgConf: avg };
  }, [entries]);

  const recent = entries.slice(0, 3);
  const isEmpty = !lib.isLoading && entries.length === 0;

  return (
    <div className={styles.home}>
      {/* ── Hero: the primary action ── */}
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>Business Model Canvas</h1>
        <p className={styles.heroSub}>
          Build a filing-grounded, 9-block map of how any NSE/BSE company creates, delivers, and
          captures value — every fact citing its source page.
        </p>
        <div className={styles.heroSearch}>
          <SecuritySearch onSelect={onPickCompany} />
        </div>
      </section>

      {/* ── First-run: inform → inspire → activate ── */}
      {isEmpty && (
        <section className={styles.firstRun}>
          <p className={styles.firstRunTitle}>Build your first canvas.</p>
          <p className={styles.firstRunHint}>
            Search a company above and PRISM reads its filings to map all nine building blocks in
            ~30s. From there you can drill into any block, compare two periods, and export to PDF.
          </p>
        </section>
      )}

      {/* ── Coverage at-a-glance (only once there's something to show) ── */}
      {!isEmpty && (
        <section className={styles.stats}>
          <Stat icon={<Layers size={16} />} value={stats.count} label={`canvas${stats.count === 1 ? "" : "es"}`} />
          <Stat icon={<TrendingUp size={16} />} value={stats.sectors} label={`sector${stats.sectors === 1 ? "" : "s"} covered`} />
          <Stat icon={<Sparkles size={16} />} value={stats.avgConf != null ? `${stats.avgConf}%` : "—"} label="avg confidence" />
        </section>
      )}

      {/* ── Continue (recent work) ── */}
      {recent.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}><Clock size={15} /> Continue</h2>
          </div>
          <div className={styles.recentGrid}>
            {recent.map((e) => (
              <RecentCard key={e.ticker} entry={e} onOpen={() => onOpen(e.ticker, e.company_name)} />
            ))}
          </div>
        </section>
      )}

      {/* ── Suggested to build (data-driven: largest companies not yet canvassed) ── */}
      <SuggestedSection canvassed={entries} onBuild={onBuild} />
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statIcon}>{icon}</span>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function RecentCard({ entry, onOpen }: { entry: BMCLibraryEntry; onOpen: () => void }) {
  return (
    <button type="button" className={styles.recentCard} onClick={onOpen} title={`Open ${entry.company_name}`}>
      <div className={styles.recentName}>{entry.company_name}</div>
      <div className={styles.recentMeta}>
        {[entry.sector, `v${entry.latest_version}`].filter(Boolean).join(" · ")}
        {entry.latest_overall_confidence != null
          ? ` · ${Math.round(entry.latest_overall_confidence * 100)}%`
          : ""}
      </div>
      <span className={styles.recentOpen}>Open <ArrowRight size={13} /></span>
    </button>
  );
}

/** Suggested companies to build, sourced from the largest Nifty-200 names not
 *  already in the library. Hides entirely if the source is unavailable. */
function SuggestedSection({
  canvassed,
  onBuild,
}: {
  canvassed: BMCLibraryEntry[];
  onBuild: (symbol: string, securityId: number, name: string | null) => void;
}) {
  const top = useTopCompanies(12);
  const have = React.useMemo(
    () => new Set(canvassed.map((e) => (e.ticker || "").toUpperCase())),
    [canvassed],
  );
  const suggestions = React.useMemo(
    () =>
      (top.data ?? [])
        .filter((c) => c.symbol && !have.has(c.symbol.toUpperCase()))
        .slice(0, 6),
    [top.data, have],
  );

  if (top.isError || (!top.isLoading && suggestions.length === 0)) return null;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}><Sparkles size={15} /> Suggested to build</h2>
        <span className={styles.sectionNote}>Largest companies you haven&apos;t mapped yet</span>
      </div>
      {top.isLoading ? (
        <div className={styles.suggestGrid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.suggestSkeleton} />
          ))}
        </div>
      ) : (
        <div className={styles.suggestGrid}>
          {suggestions.map((c) => (
            <button
              key={c.security_id}
              type="button"
              className={styles.suggestCard}
              onClick={() => onBuild(c.symbol as string, c.security_id, c.security_name)}
              title={`Build ${c.security_name}'s canvas`}
            >
              <span className={styles.suggestTicker}>{c.symbol}</span>
              <span className={styles.suggestName}>{c.security_name}</span>
              {c.sector && <span className={styles.suggestSector}>{c.sector}</span>}
              <span className={styles.suggestBuild}><Plus size={12} /> Build canvas</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
