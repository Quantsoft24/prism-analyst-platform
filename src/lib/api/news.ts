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

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  type UseQueryOptions,
} from "@tanstack/react-query";

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

/** One row from /news/sources. Defensive — the upstream shape varies; we read
 *  what's present and tolerate extra keys. */
export interface NewsSource {
  source?: string;
  name?: string;
  count?: number;
  articles?: number;
  minutes_since_last?: number;
  last_article_minutes?: number;
  stale?: boolean;
  [k: string]: unknown;
}

export interface NewsSourcesResponse {
  sources?: NewsSource[];
  total?: number;
  total_sources?: number;
  [k: string]: unknown;
}

/** /news/compare → per-company summaries ranked by avg_score (best→worst).
 *  The upstream may key the array as `comparison`, `results`, or `companies`;
 *  we normalise at the hook. Each row is summary-shaped. */
export interface CompareRow {
  company: string;
  trend?: TrendVerdict;
  avg_score?: number;
  total_articles?: number;
  sentiment_breakdown?: SentimentBreakdown;
  provider?: "openai" | "heuristic";
  [k: string]: unknown;
}

export interface CompareResponse {
  comparison?: CompareRow[];
  results?: CompareRow[];
  companies?: CompareRow[] | string[];
  [k: string]: unknown;
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
  sources(hours = 24, signal?: AbortSignal): Promise<NewsSourcesResponse> {
    return apiClient.get<NewsSourcesResponse>(`${base}/sources`, {
      query: { hours },
      signal,
    });
  },
  compare(companies: string, hours = 48, signal?: AbortSignal): Promise<CompareResponse> {
    return apiClient.get<CompareResponse>(`${base}/compare`, {
      query: { companies, hours },
      signal,
    });
  },
};

export const newsKeys = {
  all: ["news"] as const,
  feed: (p: FeedParams) => ["news", "feed", p] as const,
  feedInfinite: (p: Omit<FeedParams, "page">) => ["news", "feed-inf", p] as const,
  summary: (company: string, hours: number) => ["news", "summary", company, hours] as const,
  trending: (hours: number, limit: number) => ["news", "trending", hours, limit] as const,
  stats: () => ["news", "stats"] as const,
  sources: (hours: number) => ["news", "sources", hours] as const,
  compare: (companies: string, hours: number) => ["news", "compare", companies, hours] as const,
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
    // News is time-sensitive, but respect the visible 5-min countdown: only
    // refetch on tab-refocus when the data is ACTUALLY stale (≥ the refresh
    // interval), not on every focus. Without this, the app-wide staleTime (30s)
    // made a quick tab-switch-and-back trigger an immediate refetch that reset
    // the countdown early. staleTime = the interval ties the on-focus refetch to
    // the countdown: switching away and back mid-cycle no longer refreshes;
    // returning after the cycle has elapsed still gets fresh data.
    refetchOnWindowFocus: true,
    staleTime: NEWS_REFRESH_MS,
    ...options,
  });
}

/** Paginated feed with "Load more" (append). Each page is `PAGE_SIZE` articles;
 *  `fetchNextPage` advances the `page` param. Changing company/sector/hours
 *  changes the query key, so React Query resets to page 1 automatically. The
 *  whole loaded set still refreshes on the 5-min cadence. */
export const FEED_PAGE_SIZE = 20;

export function useInfiniteNewsFeed(params: Omit<FeedParams, "page" | "limit">) {
  return useInfiniteQuery({
    queryKey: newsKeys.feedInfinite(params),
    queryFn: ({ pageParam, signal }) =>
      newsApi.feed({ ...params, page: pageParam as number, limit: FEED_PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const m = last.meta;
      if (!m) return undefined;
      return m.current_page < m.total_pages ? m.current_page + 1 : undefined;
    },
    refetchInterval: NEWS_REFRESH_MS,
    // News is time-sensitive, but respect the visible 5-min countdown: only
    // refetch on tab-refocus when the data is ACTUALLY stale (≥ the refresh
    // interval), not on every focus. Without this, the app-wide staleTime (30s)
    // made a quick tab-switch-and-back trigger an immediate refetch that reset
    // the countdown early. staleTime = the interval ties the on-focus refetch to
    // the countdown: switching away and back mid-cycle no longer refreshes;
    // returning after the cycle has elapsed still gets fresh data.
    refetchOnWindowFocus: true,
    staleTime: NEWS_REFRESH_MS,
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
    // News is time-sensitive, but respect the visible 5-min countdown: only
    // refetch on tab-refocus when the data is ACTUALLY stale (≥ the refresh
    // interval), not on every focus. Without this, the app-wide staleTime (30s)
    // made a quick tab-switch-and-back trigger an immediate refetch that reset
    // the countdown early. staleTime = the interval ties the on-focus refetch to
    // the countdown: switching away and back mid-cycle no longer refreshes;
    // returning after the cycle has elapsed still gets fresh data.
    refetchOnWindowFocus: true,
    staleTime: NEWS_REFRESH_MS,
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
    // News is time-sensitive, but respect the visible 5-min countdown: only
    // refetch on tab-refocus when the data is ACTUALLY stale (≥ the refresh
    // interval), not on every focus. Without this, the app-wide staleTime (30s)
    // made a quick tab-switch-and-back trigger an immediate refetch that reset
    // the countdown early. staleTime = the interval ties the on-focus refetch to
    // the countdown: switching away and back mid-cycle no longer refreshes;
    // returning after the cycle has elapsed still gets fresh data.
    refetchOnWindowFocus: true,
    staleTime: NEWS_REFRESH_MS,
    ...options,
  });
}

export function useNewsSources(
  hours = 24,
  options?: Omit<UseQueryOptions<NewsSourcesResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: newsKeys.sources(hours),
    queryFn: ({ signal }) => newsApi.sources(hours, signal),
    refetchInterval: NEWS_REFRESH_MS,
    // News is time-sensitive, but respect the visible 5-min countdown: only
    // refetch on tab-refocus when the data is ACTUALLY stale (≥ the refresh
    // interval), not on every focus. Without this, the app-wide staleTime (30s)
    // made a quick tab-switch-and-back trigger an immediate refetch that reset
    // the countdown early. staleTime = the interval ties the on-focus refetch to
    // the countdown: switching away and back mid-cycle no longer refreshes;
    // returning after the cycle has elapsed still gets fresh data.
    refetchOnWindowFocus: true,
    staleTime: NEWS_REFRESH_MS,
    ...options,
  });
}

/** Multi-company sentiment compare. `enabled` gates until ≥1 company is given;
 *  cold companies can be slow (OpenAI), so retry once. Normalise the row array
 *  at the call site via `compareRows()`. */
export function useNewsCompare(
  companies: string[],
  hours = 48,
  options?: Omit<UseQueryOptions<CompareResponse, Error>, "queryKey" | "queryFn" | "enabled">,
) {
  const csv = companies.join(",");
  return useQuery({
    queryKey: newsKeys.compare(csv, hours),
    queryFn: ({ signal }) => newsApi.compare(csv, hours, signal),
    enabled: companies.length > 0,
    retry: 1,
    ...options,
  });
}

/** Pull the ranked rows out of a CompareResponse regardless of which key the
 *  upstream used (comparison | results | companies), dropping bare-string
 *  shapes. Sorted best→worst by avg_score when present. */
export function compareRows(resp?: CompareResponse): CompareRow[] {
  if (!resp) return [];
  const raw = resp.comparison ?? resp.results ?? resp.companies ?? [];
  const rows = (raw as unknown[]).filter(
    (r): r is CompareRow => typeof r === "object" && r !== null && "company" in r,
  );
  return [...rows].sort((a, b) => (b.avg_score ?? 0) - (a.avg_score ?? 0));
}

// Mutation form of summary — used by the Watchlist to fetch each company's
// pulse lazily (so adding a name fires one request, not a re-render storm).
export function useCompanySummaryMutation() {
  return useMutation({
    mutationFn: ({ company, hours }: { company: string; hours?: number }) =>
      newsApi.summary(company, hours ?? 24),
  });
}

// ── Company-name resolution ─────────────────────────────────────────────────

/** Corporate suffixes carried by the stocks `master_securities` legal names
 *  ("… Ltd.", "… Pvt Ltd", "… Corporation") that the prism-news alias master
 *  does NOT key on — it uses the de-suffixed canonical ("Tata Consultancy
 *  Services"). Anchored to the end so mid-name words ("Container Corporation of
 *  India") are left intact. */
const CORP_SUFFIX_RE =
  /[\s,.]*\b(?:ltd|limited|pvt|private|inc|incorporated|corp|corporation|plc|llp)\b\.?\s*$/i;

/**
 * Normalize a company name so the news service's alias matching resolves it.
 *
 * The Stocks/BMC search resolves against `master_securities` (full legal names
 * like "Tata Consultancy Services Ltd."), but prism-news matches on de-suffixed
 * canonical names + short aliases. Sending the legal name verbatim returns 0
 * articles (see `network_request_logs.txt`). We strip trailing corporate
 * suffixes + punctuation so the name lands on the canonical form. Generic rules
 * only — NO per-company table.
 *
 * This is the frontend bridge; the durable fix is server-side (the news service
 * normalizing suffixes / indexing tickers, or news migrating to `security_id`
 * so both systems share one key).
 */
export function normalizeCompanyForNews(name: string): string {
  let out = name.trim();
  // Peel repeated suffixes ("… Pvt Ltd." → "… Pvt" → "…").
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out.replace(CORP_SUFFIX_RE, "").trim();
  }
  out = out.replace(/[\s,.]+$/, "").trim();
  return out || name.trim(); // never return empty
}

// ── "Ask PRISM" prompt builder ──────────────────────────────────────────────

/**
 * Build the grounded prompt for the per-article "Ask PRISM" action.
 *
 * The old version sent only `"title" (source)`, so the agent had to re-derive
 * context from its tools and often drifted from the actual story. We now hand it
 * the full article context the feed already carries — headline, source, time,
 * tagged companies, sector, auto-sentiment, and the summary — so it reasons about
 * THIS article. We include a real publisher link when present but drop opaque
 * `news.google.com` redirect URLs (unfetchable + token-heavy), and skip RSS
 * "echo" descriptions that merely repeat the title + source.
 */
export function buildArticleAskPrompt(article: NewsArticle): string {
  const companies = (article.companies ?? []).filter(Boolean);

  const lead = companies.length
    ? `What is the significance and likely impact of this news for ${companies.join(", ")}? Explain what an equity analyst should take away and what to watch.`
    : "Explain the significance and implications of this news for an equity analyst — what it means, the likely market impact, and what to watch.";

  // Keep genuine summaries and multi-outlet round-ups; drop the RSS "echo"
  // (description that's just "<title>  <Source>").
  const titleNorm = article.title.replace(/\s+/g, " ").trim();
  const descNorm = (article.description ?? "").replace(/\s+/g, " ").trim();
  const isEcho =
    !descNorm ||
    descNorm === titleNorm ||
    (descNorm.startsWith(titleNorm) && descNorm.length - titleNorm.length < 40);
  const summary = isEcho ? "" : descNorm.slice(0, 700);

  const link =
    article.link && !/^https?:\/\/news\.google\.com/i.test(article.link) ? article.link : "";

  const ctx: string[] = [`- Headline: ${article.title}`];
  ctx.push(`- Source: ${article.source}${article.published_ist ? ` · ${article.published_ist}` : ""}`);
  if (companies.length) ctx.push(`- Companies: ${companies.join(", ")}`);
  if (article.sector) ctx.push(`- Sector: ${article.sector}`);
  if (article.sentiment) {
    ctx.push(
      `- Auto-sentiment: ${article.sentiment.label} (${Math.round((article.sentiment.score ?? 0) * 100)}%)`,
    );
  }
  if (summary) ctx.push(`- Summary: ${summary}`);
  if (link) ctx.push(`- Link: ${link}`);

  return `${lead}\n\nArticle context:\n${ctx.join("\n")}`;
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

/** Relative time from an epoch-ms timestamp (e.g. React Query's
 *  `dataUpdatedAt`). "just now" / "Xs ago" / "Xm ago" / "Xh ago". */
export function timeAgoFrom(ms?: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
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
