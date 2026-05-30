"use client";

import * as React from "react";
import { keepPreviousData } from "@tanstack/react-query";

import {
  timeAgo,
  useNewsFeed,
  FEED_PAGE_SIZE,
  type NewsArticle,
  type SectorCode,
  type SentimentLabel,
} from "@/lib/api/news";
import { cn } from "@/lib/utils";

import styles from "./news.module.css";

interface NewsFeedProps {
  /** Section title shown inline with the filters (e.g. "Latest headlines"). */
  title: string;
  /** Resolved feed scope: a single company, a CSV of watchlist companies, or undefined (all news). */
  company?: string;
  sector?: SectorCode;
  hours: number;
  /** Companies to offer in the multi-select sub-filter (the watchlist, when the feed shows it). */
  subFilterOptions?: string[];
  /** Selected sub-filter companies (controlled by the parent — re-scopes the feed server-side). */
  subFilter: string[];
  onSubFilterChange: (next: string[]) => void;
  /** Shown as a "Clear filter" button when an explicit company/sector filter is active. */
  onClearScope?: () => void;
  onAsk: (article: NewsArticle) => void;
  onInvestigate: (company: string) => void;
}

type SentimentFilter = "all" | SentimentLabel;

/**
 * Headline feed — title + a company sub-filter dropdown + sentiment filter pills
 * on one header row, numbered pagination (reference style). The company
 * sub-filter re-scopes the feed server-side (so alias resolution works and
 * pagination stays correct); the sentiment pills narrow the current page.
 * Article cards show a sentiment chip, source, time-ago, sector, and a 1-line
 * description preview, with "Ask PRISM" / "Why is it moving?" actions.
 */
export default function NewsFeed({
  title,
  company,
  sector,
  hours,
  subFilterOptions,
  subFilter,
  onSubFilterChange,
  onClearScope,
  onAsk,
  onInvestigate,
}: NewsFeedProps) {
  const [page, setPage] = React.useState(1);
  const [sentiment, setSentiment] = React.useState<SentimentFilter>("all");
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Reset page + sentiment when the feed scope changes.
  React.useEffect(() => {
    setPage(1);
    setSentiment("all");
  }, [company, sector, hours]);

  // Close the company dropdown on outside click.
  React.useEffect(() => {
    if (!dropdownOpen) return;
    const onDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [dropdownOpen]);

  const { data, isLoading, isError, error, isFetching, isPlaceholderData } = useNewsFeed(
    { company, sector, hours, page, limit: FEED_PAGE_SIZE },
    { placeholderData: keepPreviousData },
  );

  const pageArticles = React.useMemo(() => data?.articles ?? [], [data]);
  const meta = data?.meta;
  const totalPages = meta?.total_pages ?? 1;
  const total = meta?.total_results ?? 0;

  // The company sub-filter re-scopes the feed server-side (via the parent), so
  // here we only narrow the current page by sentiment. Sentiment is populated
  // on company-scoped feeds; the general feed's is lazily null.
  const sentimentApplicable = !!company;
  const articles = React.useMemo(() => {
    let out = pageArticles;
    if (sentimentApplicable && sentiment !== "all") {
      out = out.filter((a) => a.sentiment?.label === sentiment);
    }
    return out;
  }, [pageArticles, sentiment, sentimentApplicable]);

  const showFilterGroup =
    !isLoading && !isError && pageArticles.length > 0 && (sentimentApplicable || !!subFilterOptions);

  return (
    <div className={styles.section}>
      {/* Header: title + (company sub-filter dropdown + sentiment pills) inline */}
      <div className={styles.feedHeader}>
        <div className={styles.feedHeaderLeft}>
          <h2 className={styles.sectionTitle}>{title}</h2>
          {onClearScope && (
            <button className={styles.clearBtn} onClick={onClearScope}>
              Clear filter ✕
            </button>
          )}
        </div>

        {showFilterGroup && (
          <div className={styles.filterGroup}>
            {subFilterOptions && subFilterOptions.length > 1 && (
              <div className={styles.dropdown} ref={dropdownRef}>
                <button
                  className={cn(styles.filterPill, dropdownOpen && styles.filterPillActive)}
                  onClick={() => setDropdownOpen((o) => !o)}
                >
                  {subFilter.length === 0 ? "All companies" : `${subFilter.length} selected`} ▾
                </button>
                {dropdownOpen && (
                  <div className={styles.dropdownMenu}>
                    <button
                      className={cn(styles.dropdownItem, subFilter.length === 0 && styles.dropdownItemActive)}
                      onClick={() => onSubFilterChange([])}
                    >
                      <span className={styles.checkbox}>{subFilter.length === 0 ? "✓" : ""}</span>
                      All companies
                    </button>
                    <div className={styles.dropdownDivider} />
                    {subFilterOptions.map((c) => {
                      const on = subFilter.includes(c);
                      return (
                        <button
                          key={c}
                          className={cn(styles.dropdownItem, on && styles.dropdownItemActive)}
                          onClick={() =>
                            onSubFilterChange(on ? subFilter.filter((x) => x !== c) : [...subFilter, c])
                          }
                        >
                          <span className={styles.checkbox}>{on ? "✓" : ""}</span>
                          {c}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {sentimentApplicable && (
              <div className={styles.filterPills}>
                {(["all", "positive", "neutral", "negative"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSentiment(s)}
                    className={cn(
                      styles.filterPill,
                      sentiment === s && styles.filterPillActive,
                      sentiment === s && s === "positive" && styles.filterPillPos,
                      sentiment === s && s === "negative" && styles.filterPillNeg,
                    )}
                  >
                    {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* meta line */}
      {meta && !isLoading && (
        <span className={styles.feedMeta}>
          {total.toLocaleString()} headlines in the last {hours}h
          {isFetching && isPlaceholderData ? " · loading page…" : isFetching ? " · refreshing…" : ""}
        </span>
      )}

      {isLoading && (
        <div className={styles.skeletonList}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={styles.skeletonRow} />
          ))}
        </div>
      )}

      {isError && (
        <div className={styles.errorBox}>
          Couldn&apos;t load the news feed: {error?.message ?? "unknown error"}. It
          auto-retries every few minutes.
        </div>
      )}

      {!isLoading && !isError && articles.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>
            {pageArticles.length > 0 ? "No matching headlines" : "No headlines found"}
          </div>
          <div className={styles.emptyText}>
            {pageArticles.length > 0
              ? "No articles match the current filters on this page — clear them or try another page."
              : "Try a wider time window, a different company, or clear the sector filter."}
          </div>
        </div>
      )}

      {articles.length > 0 && (
        <div className={styles.feedList}>
          {articles.map((a, i) => (
            <ArticleRow
              key={`${a.link}-${i}`}
              article={a}
              onAsk={() => onAsk(a)}
              onInvestigate={onInvestigate}
            />
          ))}
        </div>
      )}

      {/* Numbered pagination */}
      {!isLoading && !isError && totalPages > 1 && (
        <Pager page={page} totalPages={totalPages} disabled={isFetching} onGo={setPage} />
      )}
    </div>
  );
}

/* ── Numbered pager (Prev · 1 2 3 4 5 · Next) ───────────────────────────── */

function Pager({
  page,
  totalPages,
  disabled,
  onGo,
}: {
  page: number;
  totalPages: number;
  disabled: boolean;
  onGo: (p: number) => void;
}) {
  // Window of up to 5 page numbers centred on the current page.
  const count = Math.min(5, totalPages);
  let start = Math.max(1, page - 2);
  if (start + count - 1 > totalPages) start = Math.max(1, totalPages - count + 1);
  const nums = Array.from({ length: count }, (_, i) => start + i);

  return (
    <div className={styles.pager}>
      <button className={styles.pageBtn} disabled={page <= 1 || disabled} onClick={() => onGo(page - 1)}>
        ← Prev
      </button>
      {nums.map((p) => (
        <button
          key={p}
          className={cn(styles.pageBtn, p === page && styles.pageBtnActive)}
          disabled={disabled}
          onClick={() => onGo(p)}
        >
          {p}
        </button>
      ))}
      <button
        className={styles.pageBtn}
        disabled={page >= totalPages || disabled}
        onClick={() => onGo(page + 1)}
      >
        Next →
      </button>
      <span className={styles.pageInfo}>
        Page {page} of {totalPages.toLocaleString()}
      </span>
    </div>
  );
}

function scoreClass(label?: string): string {
  if (label === "positive") return styles.scorePos;
  if (label === "negative") return styles.scoreNeg;
  return styles.scoreNeu;
}

function ArticleRow({
  article,
  onAsk,
  onInvestigate,
}: {
  article: NewsArticle;
  onAsk: () => void;
  onInvestigate: (company: string) => void;
}) {
  const primaryCompany = article.companies?.[0];
  const showDesc =
    article.description && article.description.trim() && article.description.trim() !== article.title.trim();
  return (
    <div className={styles.article}>
      {article.sentiment && (
        <span className={cn(styles.articleScore, scoreClass(article.sentiment.label))}>
          {Math.round((article.sentiment.score ?? 0) * 100)}%
        </span>
      )}
      <div className={styles.articleMain}>
        <a className={styles.articleTitle} href={article.link} target="_blank" rel="noopener noreferrer">
          {article.title}
        </a>
        {showDesc && <div className={styles.articleDesc}>{article.description}</div>}
        <div className={styles.articleMeta}>
          <span className={styles.sourceName}>{article.source}</span>
          <span>·</span>
          <span>{timeAgo(article.published_ist)}</span>
          {article.sector && (
            <>
              <span>·</span>
              <span className={styles.sectorTag}>{article.sector}</span>
            </>
          )}
          {primaryCompany && (
            <>
              <span>·</span>
              <span className={styles.coName}>{primaryCompany}</span>
            </>
          )}
        </div>
        <div className={styles.articleActions}>
          <button className={styles.actionBtn} onClick={onAsk}>
            Ask PRISM
          </button>
          {primaryCompany && (
            <button className={styles.actionBtn} onClick={() => onInvestigate(primaryCompany)}>
              Why is it moving?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
