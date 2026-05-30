"use client";

import * as React from "react";

import {
  timeAgo,
  useInfiniteNewsFeed,
  type NewsArticle,
  type SectorCode,
  type SentimentLabel,
} from "@/lib/api/news";
import { cn } from "@/lib/utils";

import styles from "./news.module.css";

interface NewsFeedProps {
  company?: string;
  sector?: SectorCode;
  hours: number;
  /** "Ask PRISM about this article" → opens chat with the headline as context. */
  onAsk: (article: NewsArticle) => void;
  /** "Why is X moving?" → opens the investigation drawer for a company. */
  onInvestigate: (company: string) => void;
}

type SentimentFilter = "all" | SentimentLabel;

/**
 * The headline feed — paginated via "Load more" (append) and, when a company
 * filter is active, filterable by sentiment. Each article exposes "Ask PRISM"
 * and (when a company is tagged) "Why is it moving?". CSS Modules; responsive.
 */
export default function NewsFeed({ company, sector, hours, onAsk, onInvestigate }: NewsFeedProps) {
  const [sentiment, setSentiment] = React.useState<SentimentFilter>("all");

  // Reset the sentiment filter whenever the feed scope changes.
  React.useEffect(() => {
    setSentiment("all");
  }, [company, sector, hours]);

  const {
    data,
    isLoading,
    isError,
    error,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteNewsFeed({ company, sector, hours });

  const allArticles = React.useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.articles ?? []),
    [data],
  );
  const total = data?.pages?.[0]?.meta?.total_results ?? 0;

  // Sentiment filtering only makes sense on a company feed (the general feed's
  // sentiment is lazily scored → mostly null, filtering would empty it).
  const sentimentApplicable = !!company;
  const articles = React.useMemo(() => {
    if (!sentimentApplicable || sentiment === "all") return allArticles;
    return allArticles.filter((a) => a.sentiment?.label === sentiment);
  }, [allArticles, sentiment, sentimentApplicable]);

  return (
    <div className={styles.section}>
      {/* meta + sentiment filter row */}
      <div className={styles.feedTopRow}>
        {total > 0 && !isLoading && (
          <span className={styles.feedMeta}>
            {total.toLocaleString()} headlines in the last {hours}h
            {isFetching && !isFetchingNextPage ? " · refreshing…" : ""}
          </span>
        )}
        {sentimentApplicable && allArticles.length > 0 && (
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
            {allArticles.length > 0 ? "No matching headlines" : "No headlines found"}
          </div>
          <div className={styles.emptyText}>
            {allArticles.length > 0
              ? "No articles match this sentiment filter — try 'All'."
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

      {/* Load more / end-note */}
      {!isLoading && !isError && allArticles.length > 0 && (
        <div className={styles.loadMoreRow}>
          {hasNextPage ? (
            <button
              className={styles.loadMore}
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage
                ? "Loading…"
                : `Load more (${allArticles.length.toLocaleString()} of ${total.toLocaleString()})`}
            </button>
          ) : (
            <span className={styles.endNote}>
              Showing all {total.toLocaleString()} headlines in the last {hours}h
            </span>
          )}
        </div>
      )}
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
