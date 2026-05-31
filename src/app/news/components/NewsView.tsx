"use client";

import * as React from "react";

import {
  timeAgoFrom,
  useNewsSources,
  useNewsTrending,
  NEWS_REFRESH_MS,
  type NewsArticle,
  type NewsSourcesResponse,
  type SectorCode,
  type TrendingCompany,
} from "@/lib/api/news";
import { useWatchlist } from "@/hooks/useWatchlist";
import { cn } from "@/lib/utils";

import NewsFeed from "./NewsFeed";
import WatchlistPulse from "./WatchlistPulse";
import styles from "./news.module.css";

const HOURS_OPTIONS = [
  { label: "24h", value: 24 },
  { label: "48h", value: 48 },
  { label: "7d", value: 168 },
  { label: "10d", value: 240 },
];

// Popular Indian names offered as one-click quick picks (inspired by the
// PRISM_ANALYST news page). A deep pool so the suggestions never run dry —
// the chips bar always surfaces the next untracked names from this list.
const QUICK_PICKS = [
  "Reliance Industries",
  "TCS",
  "HDFC Bank",
  "Infosys",
  "ICICI Bank",
  "SBI",
  "Adani Enterprises",
  "ITC",
  "Bharti Airtel",
  "Larsen & Toubro",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "Bajaj Finance",
  "Maruti Suzuki",
  "Tata Motors",
  "Sun Pharma",
  "HCLTech",
  "Wipro",
  "Asian Paints",
  "Titan",
  "NTPC",
  "Power Grid",
  "Hindustan Unilever",
  "JSW Steel",
];

// How many quick-pick suggestions to surface at once in the chips bar.
const QUICK_PICK_VISIBLE = 8;

interface NewsViewProps {
  /** Route a query into the chat page (Ask-PRISM-about-this-article). */
  onAsk?: (query: string) => void;
}

/**
 * News & Sentiment — PRISM's market-intelligence surface.
 *
 * Layout (feed-first): a sticky toolbar (track box + quick-add suggestions +
 * time window) → tracked-company chips → a two-column grid. The feed is primary
 * — all news by default, scoped to tracked companies' news when any are tracked;
 * the per-company sentiment dashboard shows above the feed only when tracking.
 * The right rail holds trending + sectors + sources. Auto-refreshes on the
 * 5-min cadence via React Query (and on window focus, so returning to the tab
 * shows fresh data).
 *
 * Styling: CSS Modules (news.module.css) + Lakshya design tokens — matches the
 * codebase convention (no inline styles, no utility classes). Mobile-first;
 * the rail drops below the feed under 1024px.
 */
export default function NewsView({ onAsk }: NewsViewProps) {
  const [hours, setHours] = React.useState(24);
  const [sector, setSector] = React.useState<SectorCode | undefined>(undefined);
  const [companyFilter, setCompanyFilter] = React.useState<string | undefined>(undefined);
  const [addInput, setAddInput] = React.useState("");
  // Sub-filter focus: a subset of tracked companies to scope the feed to
  // (server-side, so alias resolution handles "TCS" → "Tata Consultancy…").
  const [focus, setFocus] = React.useState<string[]>([]);

  // Measure two things and expose them as CSS vars on the page:
  //  --news-header-h  : the sticky toolbar's exact height, so elements that pin
  //                     below it (feed header, rail) sit flush at its bottom
  //                     edge — no gap (content peeking through), no overlap.
  //  --news-viewport-h: the scroll container's (.content) visible height, which
  //                     is shorter than the window (the global Topbar sits above
  //                     it). The rail is sized to THIS so it never overhangs the
  //                     fold — otherwise "Trending now" gets pushed out of view
  //                     when you reach the bottom of the feed.
  const pageRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLElement>(null);
  React.useLayoutEffect(() => {
    const page = pageRef.current;
    const header = headerRef.current;
    if (!page || !header) return;
    const scroller = page.parentElement; // AppShell's .content (scroll container)
    const apply = () => {
      page.style.setProperty("--news-header-h", `${header.offsetHeight}px`);
      if (scroller) page.style.setProperty("--news-viewport-h", `${scroller.clientHeight}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(header);
    if (scroller) ro.observe(scroller);
    return () => ro.disconnect();
  }, []);

  const watchlist = useWatchlist();
  const trending = useNewsTrending(hours, 12);
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

  // Keep the sub-filter focus in sync with the watchlist (drop any company that
  // was untracked).
  React.useEffect(() => {
    setFocus((prev) => prev.filter((c) => watchlist.watchlist.includes(c)));
  }, [watchlist.watchlist]);

  // Feed scope (reference behaviour): an explicit click on a trending company
  // or a sector wins; otherwise, if the watchlist has names the feed shows
  // THEIR combined news (or the focused subset); otherwise all news in window.
  const watchlistScoped = !companyFilter && !sector && watchlist.watchlist.length > 0;
  const focusActive = watchlistScoped && focus.length > 0;
  const feedCompany = companyFilter
    ?? (focusActive ? focus.join(",") : watchlistScoped ? watchlist.watchlist.join(",") : undefined);
  // Companies offered in the feed's sub-filter dropdown (only meaningful when
  // the feed is showing the multi-company watchlist).
  const feedSubFilter = watchlistScoped && watchlist.watchlist.length > 1 ? watchlist.watchlist : undefined;
  const feedTitle = companyFilter
    ? `News · ${companyFilter}`
    : sector
      ? `${sector} news`
      : watchlistScoped
        ? "Your watchlist news"
        : "Latest headlines";

  const live = !trending.isError && !sources.isError;

  // Quick-add suggestions (untracked names) — surfaced inline in the toolbar to
  // use the space between the track box and the time-window pills.
  const suggestions = QUICK_PICKS.filter((p) => !watchlist.watchlist.includes(p)).slice(
    0,
    QUICK_PICK_VISIBLE,
  );

  return (
    <div className={styles.page} ref={pageRef}>
      {/* ── Toolbar (sticky): track box · quick-add suggestions · time window ── */}
      <header className={styles.header} ref={headerRef}>
        <div className={styles.headerMain}>
          <div className={styles.addRow}>
            <input
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddWatch()}
              placeholder="Track a company…"
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

          {/* Quick-add suggestions fill the middle space */}
          {suggestions.length > 0 && (
            <div className={styles.suggestStrip}>
              {suggestions.map((c) => (
                <button key={c} className={styles.chip} onClick={() => watchlist.add(c)}>
                  + {c}
                </button>
              ))}
            </div>
          )}

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
        </div>

        <LiveStatus live={live} updatedAt={trending.dataUpdatedAt} isFetching={trending.isFetching} />
      </header>

      {/* ── Today's Pulse ── temporarily disabled (see PulseStrip below) ──
      <PulseStrip
        trending={trending.data?.trending ?? []}
        loading={trending.isLoading}
        isError={trending.isError}
      />
      */}

      {/* ── Tracked-company chips (only when tracking) — add box + suggestions live in the toolbar ── */}
      <ChipsBar
        watchlist={watchlist.watchlist}
        onRemove={watchlist.remove}
        onClear={watchlist.clear}
      />

      {/* ── Main grid ── */}
      <div className={styles.grid}>
        {/* Left: sentiment dashboard (only when tracking) + feed */}
        <div className={styles.colMain}>
          {/* Per-company sentiment dashboard — shown only when tracking. */}
          {watchlist.watchlist.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Tracked sentiment</h2>
              </div>
              <WatchlistPulse
                watchlist={watchlist.watchlist}
                hours={hours}
                onRemove={watchlist.remove}
              />
            </section>
          )}

          <NewsFeed
            title={feedTitle}
            company={feedCompany}
            sector={sector}
            hours={hours}
            subFilterOptions={feedSubFilter}
            subFilter={focus}
            onSubFilterChange={setFocus}
            onClearScope={
              companyFilter || sector
                ? () => {
                    setSector(undefined);
                    setCompanyFilter(undefined);
                  }
                : undefined
            }
            onAsk={handleAskArticle}
          />
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

          <SourcesStrip sources={sources.data} loading={sources.isLoading} />
        </aside>
      </div>
    </div>
  );
}

/* ── Live refresh status — ticks every second off React Query's updatedAt ── */

function LiveStatus({
  live,
  updatedAt,
  isFetching,
}: {
  live: boolean;
  updatedAt: number;
  isFetching: boolean;
}) {
  // Re-render every second so "updated Xs ago / next in Ys" stays live.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const sinceMs = updatedAt ? Date.now() - updatedAt : 0;
  const stale = !!updatedAt && sinceMs > NEWS_REFRESH_MS * 1.5;
  const nextInSec = Math.max(0, Math.ceil((NEWS_REFRESH_MS - sinceMs) / 1000));
  const nextLabel = nextInSec >= 60 ? `${Math.ceil(nextInSec / 60)}m` : `${nextInSec}s`;

  const label = !updatedAt
    ? live
      ? "Connecting…"
      : "Offline"
    : isFetching
      ? "Refreshing…"
      : `Updated ${timeAgoFrom(updatedAt) || "just now"} · next refresh in ${nextLabel}`;

  return (
    <div className={cn(styles.liveStatus, stale && styles.stale)}>
      <span className={cn(styles.liveStatusDot, (!live || stale) && styles.liveDotOff)} />
      {label}
    </div>
  );
}

/* ── Tracked-company chips (removable) — quick-add suggestions live in the
 *    toolbar; this only renders the names the user is currently tracking. ──── */

function ChipsBar({
  watchlist,
  onRemove,
  onClear,
}: {
  watchlist: string[];
  onRemove: (c: string) => void;
  onClear: () => void;
}) {
  if (watchlist.length === 0) return null;

  return (
    <section className={styles.chipsBar}>
      <div className={styles.chips}>
        <span className={styles.quickPickLabel}>Tracking:</span>
        {watchlist.map((c) => (
          <span key={c} className={cn(styles.chip, styles.chipActive)}>
            {c}
            <button
              className={styles.chipRemove}
              title={`Stop tracking ${c}`}
              onClick={() => onRemove(c)}
            >
              ✕
            </button>
          </span>
        ))}
        <button className={styles.clearChip} onClick={onClear}>
          Clear all
        </button>
      </div>
    </section>
  );
}

/* ── Source-reliability strip ───────────────────────────────────────────── */

function SourcesStrip({
  sources,
  loading,
}: {
  sources?: NewsSourcesResponse;
  loading: boolean;
}) {
  if (loading || !sources) return null;
  const list = sources.sources ?? [];
  if (list.length === 0) return null;

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
  }
  if (staleCount > 0) parts.push(`${staleCount} stale`);

  if (parts.length === 0) return null;
  return <div className={styles.sourcesStrip}>{parts.join(" · ")}</div>;
}

/* ── Today's Pulse — temporarily disabled ────────────────────────────────────
 * Commented out per product decision (2026-05-30). The data-derived briefing
 * (no agent call) is preserved here for an easy re-enable: uncomment this block
 * and the <PulseStrip /> usage in the page body above. `buildPulseInsights`
 * (and its `titleCase` helper at the bottom of the file) come back with it.
 *
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
*/

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

// titleCase — used only by the (currently disabled) Today's Pulse helper above.
// Re-enable alongside `buildPulseInsights` / `PulseStrip`.
// function titleCase(s: string): string {
//   return s.charAt(0) + s.slice(1).toLowerCase();
// }
