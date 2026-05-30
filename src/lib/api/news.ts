/**
 * Prism News API client + React Query hooks.
 *
 * Backed by PRISM's `/api/v1/news/*` proxy router, which forwards to the
 * external prism-news service (82 RSS feeds + OpenAI sentiment + a
 * 4,149-company alias master). Wire shapes mirror that service's response —
 * see `integeration_intake_answers.md`.
 *
 * Coverage limits the UI should respect (don't paper over them):
 *  - Indian NSE/BSE-listed names only.
 *  - 10-day (240h) max window.
 *  - Per-company sentiment is lazy + cached: the FIRST query for a fresh
 *    company/window can take 5-10s (OpenAI scores articles); repeats are fast.
 */

import { useMutation, useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { apiClient } from "./client";

// ── Wire types (match the proxied prism-news responses) ─────────────────────

export type SentimentLabel = "positive" | "negative" | "neutral";
export type TrendVerdict = "bullish" | "bearish" | "neutral";
export type SectorCode =
  | "BANKING" | "TECH" | "AUTO" | "PHARMA" | "ENERGY" | "FMCG" | "METALS" | "REALTY";

export const SECTORS: SectorCode[] = [
  "BANKING", "TECH", "AUTO", "PHARMA", "ENERGY", "FMCG", "METALS", "REALTY",
];

export interface ArticleSentiment {
  label: SentimentLabel;
  score: number;
  provider?: "openai" | "heuristic";
}

export interface NewsArticle {
  title: string;
  description?: string;
  source: string;
  published_ist: string;
  link: string;
  original_link?: string;
  companies?: string[];
  sector?: SectorCode | null;
  sentiment?: ArticleSentiment | null;
}

export interface NewsFeedMeta {
  total_results: number;
  returned: number;
  total_pages: number;
  current_page: number;
  response_time_ms: number;
  last_full_fetch_ist?: string;
  sentiment_provider?: "openai" | "heuristic";
}

export interface NewsFeedResponse {
  success: boolean;
  meta: NewsFeedMeta;
  articles: NewsArticle[];
}

export interface SentimentBreakdown {
  positive: number;
  negative: number;
  neutral: number;
}

export interface CompanySummary {
  company: string;
  input?: string;
  total_articles: number;
  sentiment_breakdown: SentimentBreakdown;
  avg_score: number;
  trend: TrendVerdict;
  trend_detail?: {
    recent_half: Partial<SentimentBreakdown>;
    older_half: Partial<SentimentBreakdown>;
  };
  top_positive: NewsArticle[];
  top_negative: NewsArticle[];
  provider?: "openai" | "heuristic";
}

export interface TrendingCompany {
  company: string;
  mentions: number;
  sentiment: SentimentLabel;
  sentiment_breakdown: SentimentBreakdown;
  sector: SectorCode | null;
}

export interface TrendingResponse {
  hours: number;
  trending: TrendingCompany[];
}

export interface NewsStats {
  // The upstream /stats shape is a loose rollup; we read what we need and
  // tolerate extra keys. Sector counts power the heatmap fallback.
  total_24h?: number;
  by_sector?: Record<string, number>;
  by_sentiment?: Partial<SentimentBreakdown>;
  [k: string]: unknown;
}

export interface NewsHealth {
  status: string;
  llm_provider?: string;
  total_articles?: number;
  last_fetch?: string;
  sources_active?: number;
  feeds?: number;
}

// ── Query params ────────────────────────────────────────────────────────────

export interface FeedParams {
  company?: string;        // CSV ok
  sector?: SectorCode;
  hours?: number;          // 1-240
  page?: number;
  limit?: number;
}

// ── Client ───────────────────────────────────────────────────────────────────

const base = "/api/v1/news";

export const newsApi = {
  feed(params: FeedParams, signal?: AbortSignal): Promise<NewsFeedResponse> {
    return apiClient.get<NewsFeedResponse>(`${base}/feed`, {
      query: {
        company: params.company,
        sector: params.sector,
        hours: params.hours ?? 24,
        page: params.page ?? 1,
        limit: params.limit ?? 50,
      },
      signal,
    });
  },
  summary(company: string, hours = 24, signal?: AbortSignal): Promise<CompanySummary> {
    return apiClient.get<CompanySummary>(`${base}/summary`, {
      query: { company, hours },
      signal,
    });
  },
  trending(hours = 24, limit = 20, signal?: AbortSignal): Promise<TrendingResponse> {
    return apiClient.get<TrendingResponse>(`${base}/trending`, {
      query: { hours, limit },
      signal,
    });
  },
  stats(signal?: AbortSignal): Promise<NewsStats> {
    return apiClient.get<NewsStats>(`${base}/stats`, { signal });
  },
  health(signal?: AbortSignal): Promise<NewsHealth> {
    return apiClient.get<NewsHealth>(`${base}/health`, { signal });
  },
};

export const newsKeys = {
  all: ["news"] as const,
  feed: (p: FeedParams) => ["news", "feed", p] as const,
  summary: (company: string, hours: number) => ["news", "summary", company, hours] as const,
  trending: (hours: number, limit: number) => ["news", "trending", hours, limit] as const,
  stats: () => ["news", "stats"] as const,
};

// 5-minute auto-refresh, matching the upstream's 10-min fetch cadence + the
// product spec (configurable UI refresh). React Query handles the polling.
export const NEWS_REFRESH_MS = 5 * 60 * 1000;

// ── Hooks ──────────────────────────────────────────────────────────────────

export function useNewsFeed(
  params: FeedParams,
  options?: Omit<UseQueryOptions<NewsFeedResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: newsKeys.feed(params),
    queryFn: ({ signal }) => newsApi.feed(params, signal),
    refetchInterval: NEWS_REFRESH_MS,
    ...options,
  });
}

export function useNewsTrending(
  hours = 24,
  limit = 20,
  options?: Omit<UseQueryOptions<TrendingResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: newsKeys.trending(hours, limit),
    queryFn: ({ signal }) => newsApi.trending(hours, limit, signal),
    refetchInterval: NEWS_REFRESH_MS,
    ...options,
  });
}

/** Per-company summary. `enabled` gates the (potentially slow, cold-OpenAI)
 *  fetch until a company is actually requested. */
export function useCompanySummary(
  company: string | null,
  hours = 24,
  options?: Omit<UseQueryOptions<CompanySummary, Error>, "queryKey" | "queryFn" | "enabled">,
) {
  return useQuery({
    queryKey: newsKeys.summary(company ?? "", hours),
    queryFn: ({ signal }) => newsApi.summary(company!, hours, signal),
    enabled: !!company,
    // First call can be slow (cold OpenAI). Don't hammer on transient errors.
    retry: 1,
    ...options,
  });
}

export function useNewsStats(
  options?: Omit<UseQueryOptions<NewsStats, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: newsKeys.stats(),
    queryFn: ({ signal }) => newsApi.stats(signal),
    refetchInterval: NEWS_REFRESH_MS,
    ...options,
  });
}

// Mutation form of summary — used by the Watchlist to fetch each company's
// pulse lazily (so adding a name fires one request, not a re-render storm).
export function useCompanySummaryMutation() {
  return useMutation({
    mutationFn: ({ company, hours }: { company: string; hours?: number }) =>
      newsApi.summary(company, hours ?? 24),
  });
}

// ── Display helpers (shared across components) ──────────────────────────────

/** Tailwind text-color token for a sentiment/verdict. */
export function sentimentColorClass(label?: string): string {
  if (label === "positive" || label === "bullish") return "text-pos";
  if (label === "negative" || label === "bearish") return "text-neg";
  return "text-ink-mute";
}

export function sentimentBgClass(label?: string): string {
  if (label === "positive" || label === "bullish") return "bg-pos-soft text-pos";
  if (label === "negative" || label === "bearish") return "bg-neg-soft text-neg";
  return "bg-bg-sunken text-ink-mute";
}

export function verdictLabel(trend?: string): string {
  if (trend === "bullish") return "↗ Bullish";
  if (trend === "bearish") return "↘ Bearish";
  return "→ Neutral";
}

/** "2026-05-30 13:48:48 IST" → "12m ago". Returns "" on unparseable input. */
export function timeAgo(istDateStr?: string): string {
  if (!istDateStr) return "";
  const clean = istDateStr.replace(" IST", "");
  const date = new Date(clean + "+05:30");
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Net sentiment score in [-1, 1] from a breakdown — drives heatmap color. */
export function netSentiment(b?: Partial<SentimentBreakdown>): number {
  if (!b) return 0;
  const pos = b.positive ?? 0;
  const neg = b.negative ?? 0;
  const neu = b.neutral ?? 0;
  const total = pos + neg + neu;
  if (total === 0) return 0;
  return (pos - neg) / total;
}
