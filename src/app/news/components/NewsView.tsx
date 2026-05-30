"use client";

import * as React from "react";

import {
  timeAgoFrom,
  useNewsSources,
  useNewsStats,
  useNewsTrending,
  NEWS_REFRESH_MS,
  type NewsArticle,
  type NewsSourcesResponse,
  type SectorCode,
  type TrendingCompany,
} from "@/lib/api/news";
import { useWatchlist } from "@/hooks/useWatchlist";
import { cn } from "@/lib/utils";

import CompareModal from "./CompareModal";
import InvestigationDrawer from "./InvestigationDrawer";
import NewsFeed from "./NewsFeed";
import WatchlistPulse from "./WatchlistPulse";
import styles from "./news.module.css";

const HOURS_OPTIONS = [
  { label: "24h", value: 24 },
  { label: "48h", value: 48 },
  { label: "7d", value: 168 },
  { label: "10d", value: 240 },
];

interface NewsViewProps {
  /** Route a query into the chat page (Ask-PRISM-about-this-article). */
  onAsk?: (query: string) => void;
}

/**
 * News & Sentiment — PRISM's market-intelligence surface.
 *
 * Layout: status header → Today's Pulse → a two-column grid (watchlist + feed
 * on the left, a trending + sectors rail on the right). The Investigation
 * drawer is the agentic differentiator — "why is X moving?" runs a live agent
 * analysis inline. Auto-refreshes on the 5-min cadence via React Query.
 *
 * Styling: CSS Modules (news.module.css) + Lakshya design tokens — matches the
 * codebase convention (no inline styles, no utility classes). Mobile-first;
 * the rail drops below the feed under 1024px.
 */
export default function NewsView({ onAsk }: NewsViewProps) {
  const [hours, setHours] = React.useState(24);
  const [sector, setSector] = React.useState<SectorCode | undefined>(undefined);
  const [companyFilter, setCompanyFilter] = React.useState<string | undefined>(undefined);
  const [investigate, setInvestigate] = React.useState<string | null>(null);
  const [addInput, setAddInput] = React.useState("");
  const [compareOpen, setCompareOpen] = React.useState(false);

  const watchlist = useWatchlist();
  const trending = useNewsTrending(hours, 12);
  const stats = useNewsStats();
  const sources = useNewsSources(hours);

  const handleAskArticle = React.useCallback(
    (article: NewsArticle) => {
      const co = article.companies?.[0];
      const q = co
        ? `What's the significance of this news for ${co}? "${article.title}" (${article.source})`
        : `Give me context on this headline: "${article.title}" (${article.source})`;
      onAsk?.(q);
    },
    [onAsk],
  );

  const handleAddWatch = React.useCallback(() => {
    const name = addInput.trim();
    if (!name) return;
    watchlist.add(name);
    setAddInput("");
  }, [addInput, watchlist]);

  const live = !trending.isError && !stats.isError;
  const sourceCount =
    typeof stats.data?.sources_active === "number"
      ? stats.data.sources_active
      : typeof stats.data?.feeds === "number"
        ? stats.data.feeds
        : undefined;

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div>
          <div className={styles.liveRow}>
            <span className={cn(styles.liveDot, !live && styles.liveDotOff)} />
            <span className={styles.eyebrow}>
              {live ? "Live market intelligence" : "Connecting…"}
            </span>
          </div>
          <h1 className={styles.title}>News &amp; Sentiment</h1>
          <p className={styles.subtitle}>
            Live Indian-market headlines with AI sentiment
            {sourceCount ? ` · ${sourceCount.toLocaleString()} sources` : ""}
          </p>
          <LiveStatus updatedAt={trending.dataUpdatedAt} isFetching={trending.isFetching} />
        </div>

        <div className={styles.windowSelector}>
          {HOURS_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setHours(o.value)}
              className={cn(styles.windowBtn, hours === o.value && styles.windowBtnActive)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Today's Pulse ── */}
      <PulseStrip
        trending={trending.data?.trending ?? []}
        loading={trending.isLoading}
        isError={trending.isError}
      />

      {/* ── Main grid ── */}
      <div className={styles.grid}>
        {/* Left: watchlist + feed */}
        <div className={styles.colMain}>
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Your watchlist</h2>
              <div className={styles.addRow}>
                {watchlist.watchlist.length >= 2 && (
                  <button className={styles.compareBtn} onClick={() => setCompareOpen(true)}>
                    Compare
                  </button>
                )}
                <input
                  value={addInput}
                  onChange={(e) => setAddInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddWatch()}
                  placeholder="Add a company…"
                  className={styles.addInput}
                />
                <button
                  onClick={handleAddWatch}
                  disabled={!addInput.trim() || watchlist.isFull}
                  className={styles.trackBtn}
                >
                  Track
                </button>
              </div>
            </div>
            <WatchlistPulse
              watchlist={watchlist.watchlist}
              hours={hours}
              onRemove={watchlist.remove}
              onInvestigate={setInvestigate}
              onAdd={watchlist.add}
            />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>
                {companyFilter ? `News · ${companyFilter}` : sector ? `${sector} news` : "Latest headlines"}
              </h2>
              {(companyFilter || sector) && (
                <button
                  className={styles.clearBtn}
                  onClick={() => {
                    setSector(undefined);
                    setCompanyFilter(undefined);
                  }}
                >
                  Clear filter ✕
                </button>
              )}
            </div>
            <NewsFeed
              company={companyFilter}
              sector={sector}
              hours={hours}
              onAsk={handleAskArticle}
              onInvestigate={setInvestigate}
            />
          </section>
        </div>

        {/* Right rail: trending + sectors */}
        <aside className={styles.colRail}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Trending now</h2>
            <TrendingRail
              trending={trending.data?.trending ?? []}
              loading={trending.isLoading}
              isError={trending.isError}
              activeCompany={companyFilter}
              isWatched={watchlist.has}
              onSelectCompany={(c) => {
                setCompanyFilter((prev) => (prev === c ? undefined : c));
                setSector(undefined);
              }}
              onWatch={watchlist.toggle}
            />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Sectors</h2>
            <SectorList
              trending={trending.data?.trending ?? []}
              activeSector={sector}
              onSelect={(s) => {
                setSector((prev) => (prev === s ? undefined : s));
                setCompanyFilter(undefined);
              }}
            />
          </section>

          <SourcesStrip
            sources={sources.data}
            lastFetch={typeof stats.data?.last_fetch === "string" ? stats.data.last_fetch : undefined}
            loading={sources.isLoading}
          />
        </aside>
      </div>

      <InvestigationDrawer company={investigate} onClose={() => setInvestigate(null)} />
      <CompareModal
        companies={compareOpen ? watchlist.watchlist : []}
        hours={hours}
        onClose={() => setCompareOpen(false)}
      />
    </div>
  );
}

/* ── Live refresh status — ticks every second off React Query's updatedAt ── */

function LiveStatus({ updatedAt, isFetching }: { updatedAt: number; isFetching: boolean }) {
  // Re-render every second so "updated Xs ago / next in Ys" stays live.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!updatedAt) return null;
  const sinceMs = Date.now() - updatedAt;
  const stale = sinceMs > NEWS_REFRESH_MS * 1.5;
  const nextInSec = Math.max(0, Math.ceil((NEWS_REFRESH_MS - sinceMs) / 1000));
  const nextLabel =
    nextInSec >= 60 ? `${Math.ceil(nextInSec / 60)}m` : `${nextInSec}s`;

  return (
    <div className={cn(styles.liveStatus, stale && styles.stale)}>
      {isFetching
        ? "Refreshing…"
        : `Updated ${timeAgoFrom(updatedAt) || "just now"} · next refresh in ${nextLabel}`}
    </div>
  );
}

/* ── Source-reliability strip ───────────────────────────────────────────── */

function SourcesStrip({
  sources,
  lastFetch,
  loading,
}: {
  sources?: NewsSourcesResponse;
  lastFetch?: string;
  loading: boolean;
}) {
  if (loading || !sources) return null;
  const list = sources.sources ?? [];
  if (list.length === 0 && !lastFetch) return null;

  const staleCount = list.filter((s) => s.stale === true).length;
  // Most recent "minutes since last article" across sources → freshness proxy.
  const mins = list
    .map((s) => s.minutes_since_last ?? s.last_article_minutes)
    .filter((m): m is number => typeof m === "number");
  const freshest = mins.length ? Math.min(...mins) : undefined;

  const parts: string[] = [];
  if (list.length) parts.push(`${list.length} sources`);
  if (typeof freshest === "number") {
    parts.push(`freshest ${freshest < 1 ? "<1m" : `${Math.round(freshest)}m`} ago`);
  } else if (lastFetch) {
    parts.push(`last fetch ${lastFetch.replace(" IST", "")}`);
  }
  if (staleCount > 0) parts.push(`${staleCount} stale`);

  if (parts.length === 0) return null;
  return <div className={styles.sourcesStrip}>{parts.join(" · ")}</div>;
}

/* ── Today's Pulse — data-derived briefing (no agent call) ──────────────── */

function PulseStrip({
  trending,
  loading,
  isError,
}: {
  trending: TrendingCompany[];
  loading: boolean;
  isError: boolean;
}) {
  const insights = React.useMemo(() => buildPulseInsights(trending), [trending]);

  if (loading) {
    return (
      <div className={styles.pulseSection}>
        <div className={styles.skeletonGrid}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={cn(styles.skeleton, styles.skeletonPulse)} />
          ))}
        </div>
      </div>
    );
  }

  if (isError || insights.length === 0) {
    return (
      <div className={styles.pulseSection}>
        <div className={styles.empty}>
          <div className={styles.emptyText}>
            {isError
              ? "Couldn't reach the news service — it auto-retries every few minutes."
              : "No market activity in this window yet — try a wider time range."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className={styles.pulseSection}>
      <div className={styles.pulseHead}>
        <span className={styles.pulseHeadDot} />
        <span className={styles.pulseHeadLabel}>Today&apos;s Pulse</span>
      </div>
      <div className={styles.pulseGrid}>
        {insights.map((ins, i) => (
          <div key={i} className={styles.pulseCard}>
            <span className={cn(styles.pulseStripe, ins.stripe)} />
            <div className={styles.pulseKicker}>{ins.kicker}</div>
            <div className={styles.pulseBody}>{ins.body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface PulseInsight {
  kicker: string;
  body: string;
  stripe: string;
}

function buildPulseInsights(trending: TrendingCompany[]): PulseInsight[] {
  if (!trending.length) return [];
  const out: PulseInsight[] = [];

  const top = trending[0];
  out.push({
    kicker: "Most talked about",
    body: `${top.company} leads with ${top.mentions} mention${top.mentions === 1 ? "" : "s"} (${top.sentiment} tone).`,
    stripe: styles.stripeAccent,
  });

  const positives = trending.filter((t) => t.sentiment === "positive");
  if (positives.length) {
    const names = positives.slice(0, 3).map((t) => t.company).join(", ");
    out.push({
      kicker: "Bullish chatter",
      body: `Positive flow around ${names}${positives.length > 3 ? `, +${positives.length - 3} more` : ""}.`,
      stripe: styles.stripePos,
    });
  }

  const negatives = trending.filter((t) => t.sentiment === "negative");
  if (negatives.length) {
    const names = negatives.slice(0, 3).map((t) => t.company).join(", ");
    out.push({
      kicker: "Under pressure",
      body: `Negative coverage on ${names}${negatives.length > 3 ? `, +${negatives.length - 3} more` : ""}.`,
      stripe: styles.stripeNeg,
    });
  } else {
    const sectors = new Map<string, number>();
    for (const t of trending) if (t.sector) sectors.set(t.sector, (sectors.get(t.sector) ?? 0) + t.mentions);
    const topSector = [...sectors.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topSector) {
      out.push({
        kicker: "Sector in focus",
        body: `${titleCase(topSector[0])} dominates with ${topSector[1]} mentions across names.`,
        stripe: styles.stripeInfo,
      });
    }
  }

  return out.slice(0, 3);
}

/* ── Trending rail ──────────────────────────────────────────────────────── */

function sentimentTextClass(label?: string): string {
  if (label === "positive" || label === "bullish") return styles.tPos;
  if (label === "negative" || label === "bearish") return styles.tNeg;
  return styles.tNeu;
}

function TrendingRail({
  trending,
  loading,
  isError,
  activeCompany,
  isWatched,
  onSelectCompany,
  onWatch,
}: {
  trending: TrendingCompany[];
  loading: boolean;
  isError: boolean;
  activeCompany?: string;
  isWatched: (c: string) => boolean;
  onSelectCompany: (c: string) => void;
  onWatch: (c: string) => void;
}) {
  if (loading) {
    return (
      <div className={styles.railSkeleton}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.railSkeletonRow} />
        ))}
      </div>
    );
  }
  if (isError) return <div className={styles.empty}><div className={styles.emptyText}>Trending unavailable right now.</div></div>;
  if (!trending.length) return <div className={styles.empty}><div className={styles.emptyText}>No trending companies in this window.</div></div>;

  return (
    <div className={styles.railCard}>
      {trending.map((t, i) => (
        <div key={t.company} className={cn(styles.railRow, activeCompany === t.company && styles.railRowActive)}>
          <span className={styles.railRank}>{i + 1}</span>
          <button onClick={() => onSelectCompany(t.company)} className={styles.railBody}>
            <div className={styles.railName}>{t.company}</div>
            <div className={styles.railSub}>
              <span className={cn(styles.semibold, sentimentTextClass(t.sentiment))}>● {t.sentiment}</span>
              <span>· {t.mentions.toLocaleString()} mentions</span>
            </div>
          </button>
          <button
            onClick={() => onWatch(t.company)}
            title={isWatched(t.company) ? "Remove from watchlist" : "Add to watchlist"}
            className={cn(styles.starBtn, isWatched(t.company) && styles.starOn)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={isWatched(t.company) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
              <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7.4-6.3-4.6L5.7 21 8 14 2 9.4h7.6z" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Sectors ────────────────────────────────────────────────────────────── */

function SectorList({
  trending,
  activeSector,
  onSelect,
}: {
  trending: TrendingCompany[];
  activeSector?: SectorCode;
  onSelect: (s: SectorCode) => void;
}) {
  const bySector = React.useMemo(() => {
    const map = new Map<string, { mentions: number; pos: number; neg: number }>();
    for (const t of trending) {
      if (!t.sector) continue;
      const e = map.get(t.sector) ?? { mentions: 0, pos: 0, neg: 0 };
      e.mentions += t.mentions;
      e.pos += t.sentiment_breakdown?.positive ?? 0;
      e.neg += t.sentiment_breakdown?.negative ?? 0;
      map.set(t.sector, e);
    }
    return [...map.entries()].sort((a, b) => b[1].mentions - a[1].mentions);
  }, [trending]);

  if (bySector.length === 0) return <div className={styles.empty}><div className={styles.emptyText}>No sector activity in this window.</div></div>;

  return (
    <div className={styles.sectorChips}>
      {bySector.map(([s, e]) => {
        const dotClass = e.pos > e.neg ? styles.bgPos : e.neg > e.pos ? styles.bgNeg : styles.bgNeu;
        return (
          <button
            key={s}
            onClick={() => onSelect(s as SectorCode)}
            className={cn(styles.sectorChip, activeSector === s && styles.sectorChipActive)}
          >
            <span className={cn(styles.dot, dotClass)} />
            <span className={styles.sectorName}>{s}</span>
            <span className={styles.sectorCount}>{e.mentions.toLocaleString()}</span>
          </button>
        );
      })}
    </div>
  );
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}
