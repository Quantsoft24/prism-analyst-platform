"use client";

import * as React from "react";

import { timeAgo, useNewsFeed, type NewsArticle, type SectorCode } from "@/lib/api/news";
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

const PAGE_LIMIT = 40;

/**
 * The headline feed. Each article exposes "Ask PRISM" (routes the headline into
 * chat) and, when a company is tagged, "Why is it moving?" (the investigation
 * drawer). Sentiment chip per article when the upstream scored it. Graceful
 * loading / empty / error states. CSS Modules; responsive padding.
 */
export default function NewsFeed({ company, sector, hours, onAsk, onInvestigate }: NewsFeedProps) {
  const { data, isLoading, isError, error, isFetching } = useNewsFeed({
    company,
    sector,
    hours,
    limit: PAGE_LIMIT,
  });

  const articles = data?.articles ?? [];

  return (
    <div className={styles.section}>
      {data?.meta && !isLoading && (
        <span className={styles.feedMeta}>
          {data.meta.total_results.toLocaleString()} headlines in the last {hours}h
          {isFetching ? " · refreshing…" : ""}
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
          <div className={styles.emptyTitle}>No headlines found</div>
          <div className={styles.emptyText}>
            Try a wider time window, a different company, or clear the sector filter.
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
