/**
 * Stock Dashboard API client + React Query hooks.
 *
 * Backed by PRISM's `/api/v1/stocks/*` router (direct reads of the investment
 * RDS: `master_securities` + `prices_and_securities`). The security list is
 * fetched ONCE and cached for the session so search suggestions filter
 * in-memory with zero per-keystroke latency.
 */

import { keepPreviousData, useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { apiClient } from "./client";

// ── Wire types (match src/schemas/stock.py) ────────────────────────────────

export type StockRange = "5D" | "1M" | "6M" | "1Y" | "3Y" | "5Y" | "MAX";

export const STOCK_RANGES: StockRange[] = ["5D", "1M", "6M", "1Y", "3Y", "5Y", "MAX"];

export interface Security {
  security_id: number;
  security_name: string | null;
  symbol: string | null;
  isin: string | null;
  exchange: string | null;
  sector: string | null;
}

export interface SecurityDetail extends Security {
  industry: string | null;
  basic_industry: string | null;
  macro_economic_indicator: string | null;
}

export interface PricePoint {
  time: string; // ISO date — YYYY-MM-DD (chart x-axis)
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  trade_volume: number | null;
  trade_value: number | null;
  market_cap: number | null;
}

export interface PriceSeries {
  security: SecurityDetail;
  range: StockRange;
  latest: PricePoint | null;
  points: PricePoint[];
}

// Annual financials (Balance Sheet)
export type FinancialBasis = "standalone" | "consolidated";

export interface FinancialNode {
  key: string;
  label: string;
  level: number;
  values: Record<string, number | null>;
  children: FinancialNode[];
}

export interface BalanceSheetResponse {
  security_id: number;
  basis: FinancialBasis;
  available_bases: FinancialBasis[];
  years: string[];
  sections: FinancialNode[];
}

// Income Statement (sequential)
export interface IncomeRow {
  key: string;
  label: string;
  emphasis: boolean;
  sign: "plus" | "minus" | null;
  info: string | null;
  values: Record<string, number | null>;
}

export interface IncomeStatementResponse {
  security_id: number;
  basis: FinancialBasis;
  available_bases: FinancialBasis[];
  years: string[];
  rows: IncomeRow[];
}

// Reports Viewer (filings) — from the stock-chat service, called directly.
export type ReportCategory =
  | "Annual Report" | "Result" | "Board Meeting" | "AGM/EGM"
  | "Corp. Action" | "Company Update" | "Insider Trading / SAST" | "Others";

export const REPORT_CATEGORIES: ReportCategory[] = [
  "Annual Report", "Result", "Board Meeting", "AGM/EGM",
  "Corp. Action", "Company Update", "Insider Trading / SAST", "Others",
];

export interface ReportFiling {
  newsid: string;
  announcement_dt: string;
  category: string;
  subcategory: string | null;
  headline: string | null;
  news_subject: string | null;
  pdf_link: string | null;
}

// Announcements (regulatory filings) — from the prism-filings service via the
// `/api/v1/stocks/announcements` proxy. Company-scoped, cross-regulator.
export const REGULATORS = ["RBI", "SEBI", "BSE", "NSE", "PIB"] as const;
export type Regulator = (typeof REGULATORS)[number];

/** The 23 prism-filings categories (the `filing_type` param). */
export const ANNOUNCEMENT_CATEGORIES = [
  "Result", "Board Meeting", "AGM/EGM", "Corp Action", "Dividend",
  "Annual Report", "Insider Trading", "M&A", "IPO", "Listing", "Allotment",
  "Guidance", "Rating/Target", "Regulatory Penalty", "Policy/Circular",
  "Auction/Issuance", "Voting Results", "Shareholding Pattern", "BRSR",
  "Corporate Governance", "Investor Complaints", "Related Party", "Compliance",
  "Share Transfer", "Deviation", "Unitholding",
] as const;
export type AnnouncementCategory = (typeof ANNOUNCEMENT_CATEGORIES)[number];

/** Selectable lookback windows (API caps `hours` at 720 = 30d). */
export const ANNOUNCEMENT_WINDOWS = [
  { label: "7 days", hours: 168 },
  { label: "14 days", hours: 336 },
  { label: "30 days", hours: 720 },
] as const;

/** One filing from prism-filings (shape differs from the left pane's `ReportFiling`). */
export interface Announcement {
  title: string;
  description: string;
  source: string;
  regulator: string;
  published_ist: string;
  published_dt: string;
  link: string;
  filing_types: string[];
  company: string | null;
  sector: string | null;
  industry: string | null;
  scrip_code: string | null;
  company_tag_method: string | null;
}

/** Upstream prism-filings response (we read `meta` + `filings`). */
export interface AnnouncementsResponse {
  success?: boolean;
  meta: {
    total_results: number;
    returned: number;
    total_pages: number;
    current_page: number;
    last_fetch_ist?: string;
    data_age_min?: number;
  };
  filings: Announcement[];
}

export interface AnnouncementFilters {
  regulator?: Regulator;
  filingType?: AnnouncementCategory;
  hours: number;
}

export interface ReportsResponse {
  company: string;
  resolved_company: string | null;
  category: string;
  order: string;
  total: number;
  limit: number;
  offset: number;
  filings: ReportFiling[];
}

// ── Metrics (the y-axis dropdown) ───────────────────────────────────────────

export type StockMetric =
  | "close" | "open" | "high" | "low" | "ohlc"
  | "trade_volume" | "trade_value" | "market_cap";

export type MetricKind = "price" | "ohlc" | "volume" | "value" | "cap";

export interface MetricDef {
  value: StockMetric;
  label: string;
  kind: MetricKind;
}

export const METRICS: MetricDef[] = [
  { value: "close", label: "Close Price", kind: "price" },
  { value: "open", label: "Open Price", kind: "price" },
  { value: "high", label: "High Price", kind: "price" },
  { value: "low", label: "Low Price", kind: "price" },
  { value: "ohlc", label: "OHLC Candlestick", kind: "ohlc" },
  { value: "trade_volume", label: "Traded Volume", kind: "volume" },
  { value: "trade_value", label: "Trade Value", kind: "value" },
  { value: "market_cap", label: "Market Cap", kind: "cap" },
];

export function metricDef(metric: StockMetric): MetricDef {
  return METRICS.find((m) => m.value === metric) ?? METRICS[0];
}

/** Numeric value of a metric for a bar (OHLC charts plot close as the scalar). */
export function metricValue(p: PricePoint, metric: StockMetric): number | null {
  if (metric === "ohlc") return p.close;
  return p[metric];
}

// ── API ─────────────────────────────────────────────────────────────────────

const base = "/api/v1/stocks";

export const stocksApi = {
  securities(signal?: AbortSignal): Promise<Security[]> {
    return apiClient.get<Security[]>(`${base}/securities`, { signal });
  },
  prices(securityId: number, range: StockRange, signal?: AbortSignal): Promise<PriceSeries> {
    return apiClient.get<PriceSeries>(`${base}/${securityId}/prices`, {
      query: { range },
      signal,
    });
  },
  balanceSheet(securityId: number, basis: FinancialBasis, signal?: AbortSignal): Promise<BalanceSheetResponse> {
    return apiClient.get<BalanceSheetResponse>(`${base}/${securityId}/balance-sheet`, {
      query: { basis },
      signal,
    });
  },
  incomeStatement(securityId: number, basis: FinancialBasis, signal?: AbortSignal): Promise<IncomeStatementResponse> {
    return apiClient.get<IncomeStatementResponse>(`${base}/${securityId}/income-statement`, {
      query: { basis },
      signal,
    });
  },
  /** Filings list — via PRISM's `/api/v1/stocks/reports` proxy to stock-chat. */
  reports(
    company: string,
    category: ReportCategory,
    limit: number,
    offset = 0,
    signal?: AbortSignal,
  ): Promise<ReportsResponse> {
    return apiClient.get<ReportsResponse>(`${base}/reports`, {
      query: { company, category, limit, offset, order: "desc" },
      signal,
    });
  },
  /** Company-scoped regulatory announcements — via the `/announcements` proxy. */
  announcements(
    company: string,
    filters: AnnouncementFilters,
    page: number,
    limit: number,
    signal?: AbortSignal,
  ): Promise<AnnouncementsResponse> {
    return apiClient.get<AnnouncementsResponse>(`${base}/announcements`, {
      query: {
        company,
        hours: filters.hours,
        page,
        limit,
        ...(filters.regulator ? { regulator: filters.regulator } : {}),
        ...(filters.filingType ? { filing_type: filters.filingType } : {}),
      },
      signal,
    });
  },
};

export const stocksKeys = {
  all: ["stocks"] as const,
  securities: () => ["stocks", "securities"] as const,
  prices: (securityId: number, range: StockRange) =>
    ["stocks", "prices", securityId, range] as const,
  balanceSheet: (securityId: number, basis: FinancialBasis) =>
    ["stocks", "balance-sheet", securityId, basis] as const,
  incomeStatement: (securityId: number, basis: FinancialBasis) =>
    ["stocks", "income-statement", securityId, basis] as const,
  reports: (company: string, category: ReportCategory, limit: number, offset: number) =>
    ["stocks", "reports", company, category, limit, offset] as const,
  announcements: (company: string, filters: AnnouncementFilters, page: number, limit: number) =>
    [
      "stocks", "announcements", company,
      filters.regulator ?? "", filters.filingType ?? "", filters.hours,
      page, limit,
    ] as const,
};

// ── Hooks ─────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/** The full security search index — one fetch per session, powers all search. */
export function useSecurities(
  options?: Omit<UseQueryOptions<Security[], Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: stocksKeys.securities(),
    queryFn: ({ signal }) => stocksApi.securities(signal),
    staleTime: DAY_MS,
    gcTime: DAY_MS,
    ...options,
  });
}

/** A security's price series for a range (header + latest + points). */
export function useStockPrices(
  securityId: number | null,
  range: StockRange,
  options?: Omit<UseQueryOptions<PriceSeries, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: stocksKeys.prices(securityId ?? 0, range),
    queryFn: ({ signal }) => stocksApi.prices(securityId as number, range, signal),
    enabled: securityId != null,
    placeholderData: keepPreviousData,
    ...options,
  });
}

/** A security's balance sheet (10-year tree) for a basis. */
export function useBalanceSheet(
  securityId: number | null,
  basis: FinancialBasis,
  options?: Omit<UseQueryOptions<BalanceSheetResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: stocksKeys.balanceSheet(securityId ?? 0, basis),
    queryFn: ({ signal }) => stocksApi.balanceSheet(securityId as number, basis, signal),
    enabled: securityId != null,
    staleTime: DAY_MS,
    placeholderData: keepPreviousData,
    ...options,
  });
}

/** A security's income statement (10-year sequential P&L) for a basis. */
export function useIncomeStatement(
  securityId: number | null,
  basis: FinancialBasis,
  options?: Omit<UseQueryOptions<IncomeStatementResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: stocksKeys.incomeStatement(securityId ?? 0, basis),
    queryFn: ({ signal }) => stocksApi.incomeStatement(securityId as number, basis, signal),
    enabled: securityId != null,
    staleTime: DAY_MS,
    placeholderData: keepPreviousData,
    ...options,
  });
}

/** A company's filings for a category + page window (Reports Viewer). */
export function useReports(
  company: string | null,
  category: ReportCategory,
  limit: number,
  offset: number,
  options?: Omit<UseQueryOptions<ReportsResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: stocksKeys.reports(company ?? "", category, limit, offset),
    queryFn: ({ signal }) => stocksApi.reports(company as string, category, limit, offset, signal),
    enabled: !!company,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    ...options,
  });
}

/** A company's regulatory announcements for a filter + page window. */
export function useAnnouncements(
  company: string | null,
  filters: AnnouncementFilters,
  page: number,
  limit: number,
  options?: Omit<UseQueryOptions<AnnouncementsResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: stocksKeys.announcements(company ?? "", filters, page, limit),
    queryFn: ({ signal }) =>
      stocksApi.announcements(company as string, filters, page, limit, signal),
    enabled: !!company,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    ...options,
  });
}

// ── Search (in-memory, instant) ─────────────────────────────────────────────

/**
 * Rank securities for a query: exact symbol > symbol-prefix > name-prefix >
 * symbol-contains > name-contains > isin-contains. Returns the top `limit`.
 */
export function searchSecurities(
  list: Security[],
  query: string,
  limit = 8,
): Security[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const scored: { s: Security; score: number }[] = [];
  for (const s of list) {
    const name = (s.security_name ?? "").toLowerCase();
    const sym = (s.symbol ?? "").toLowerCase();
    const isin = (s.isin ?? "").toLowerCase();

    let score = Infinity;
    if (sym === q) score = 0;
    else if (sym.startsWith(q)) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (sym.includes(q)) score = 3;
    else if (name.includes(q)) score = 4;
    else if (isin.includes(q)) score = 5;

    if (score !== Infinity) scored.push({ s, score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return (a.s.security_name ?? "").localeCompare(b.s.security_name ?? "");
  });
  return scored.slice(0, limit).map((x) => x.s);
}

// ── Formatting helpers ──────────────────────────────────────────────────────

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** Compact Indian count (K / L / Cr) — for share volumes on the axis/tooltip. */
function compactCount(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e7) return `${inr.format(n / 1e7)} Cr`;
  if (a >= 1e5) return `${inr.format(n / 1e5)} L`;
  if (a >= 1e3) return `${inr.format(n / 1e3)} K`;
  return inr0.format(n);
}

/** Compact ₹-crore amount (the DB already stores value/cap in ₹ crore). */
function compactCrore(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e5) return `${inr2.format(n / 1e5)} L Cr`;
  if (a >= 1e3) return `${inr2.format(n / 1e3)} K Cr`;
  return `${inr2.format(n)} Cr`;
}

/**
 * Full-precision format for the latest-values strip.
 * (The chart axis/tooltip use the compact ``formatChartValue`` instead.)
 */
export function formatMetric(value: number | null | undefined, kind: MetricKind): string {
  if (value == null || Number.isNaN(value)) return "—";
  switch (kind) {
    case "price":
    case "ohlc":
      return `₹${inr2.format(value)}`;
    case "volume":
      return inr0.format(value);
    case "value":
    case "cap":
      // The investment DB stores these in ₹ crore.
      return `₹${inr2.format(value)} Cr`;
  }
}

/**
 * Compact value for the chart's y-axis ticks AND the hover tooltip, so the two
 * always read identically (e.g. axis "₹670 Cr" ↔ tooltip "₹670 Cr"). Prices
 * stay full; large counts / crore amounts get K·L·Cr suffixes for readability.
 */
export function formatChartValue(value: number | null | undefined, kind: MetricKind): string {
  if (value == null || Number.isNaN(value)) return "—";
  switch (kind) {
    case "price":
    case "ohlc":
      return `₹${inr2.format(value)}`;
    case "volume":
      return compactCount(value);
    case "value":
    case "cap":
      return `₹${compactCrore(value)}`;
  }
}

/** Day-over-day change from the last two close points. */
export function priceChange(points: PricePoint[]): { abs: number; pct: number } | null {
  const closes = points.map((p) => p.close).filter((c): c is number => c != null);
  if (closes.length < 2) return null;
  const prev = closes[closes.length - 2];
  const last = closes[closes.length - 1];
  if (!prev) return null;
  return { abs: last - prev, pct: ((last - prev) / prev) * 100 };
}

/** Total return of the selected metric across the whole range (first → last). */
export function rangeReturn(points: PricePoint[], metric: StockMetric): number | null {
  const vals = points
    .map((p) => metricValue(p, metric))
    .filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const first = vals[0];
  if (!first) return null;
  return ((vals[vals.length - 1] - first) / Math.abs(first)) * 100;
}

// ── Financials cell views ───────────────────────────────────────────────────

/** How the balance-sheet table renders each value cell. */
export type FinView = "value" | "yoy" | "common";

/** A financial amount (₹ crore) for the table — compact ₹ Cr / K Cr / L Cr. */
export function formatFinValue(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? "—" : formatChartValue(v, "cap");
}

/**
 * Plain ₹-crore amount for the balance-sheet table's "Value (Cr)" view — the
 * full number (Indian-grouped, no decimals, no ₹/Cr suffix; the column/view
 * label carries the unit). e.g. 3760 → "3,760", -738573 → "-7,38,573".
 */
export function formatCrorePlain(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? "—" : inr0.format(v);
}

/** Year-over-year % change. */
export function yoyPct(prev: number | null | undefined, curr: number | null | undefined): number | null {
  if (prev == null || curr == null || prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

/** Value as a % of a base (common-size), e.g. % of Total assets. */
export function commonPct(value: number | null | undefined, base: number | null | undefined): number | null {
  if (value == null || base == null || base === 0) return null;
  return (value / Math.abs(base)) * 100;
}

/** Format a signed percentage with one decimal (or em-dash when null). */
export function formatPct(p: number | null): string {
  if (p == null || Number.isNaN(p)) return "—";
  return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`;
}
