/**
 * Systematic Portfolio Builder API client + React Query hooks.
 *
 * Backed by PRISM's `/api/v1/portfolio/*` router (point-in-time-correct factor
 * engine over the investment RDS + durable backtest jobs in PRISM's own DB).
 * Wire types mirror `src/schemas/portfolio.py`.
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { apiClient } from "./client";

const base = "/api/v1/portfolio";

// ── Wire types ───────────────────────────────────────────────────────────────

export interface Universe {
  index_id: number;
  index_name: string | null;
  exchange: string | null;
}

export type FactorCategory =
  | "valuation" | "quality" | "growth" | "size" | "momentum" | "liquidity" | "volatility";
export type Operator = ">" | ">=" | "<" | "<=" | "=" | "between" | "top_k" | "bottom_k";
export type WeightScheme = "equal" | "market_cap" | "factor_score" | "inverse_vol";
export type Normalization = "none" | "zscore" | "rank";
export type Frequency = "15d" | "monthly" | "quarterly" | "semiannual" | "annual";

export interface FactorMeta {
  id: string;
  name: string;
  category: FactorCategory;
  unit: string;
  direction: "higher_better" | "lower_better";
  default_operator: Operator;
  data_kind: string;
  source_tables: string[];
  description: string;
  exclude_sectors: string[];
  decimals: number;
}

export interface FilterSpec {
  factor_id: string;
  op: Operator;
  value?: number | null;
  value2?: number | null;
  k?: number | null;
}

export interface WeightingSpec {
  scheme: WeightScheme;
  score_factor_id?: string | null;
  max_weight?: number | null;
  max_sector_weight?: number | null;
}

export interface CustomFactorSpec {
  id: string;
  name: string;
  expression: string;
  direction: string;
  normalization: string;
}

export interface Holding {
  security_id: number;
  symbol: string | null;
  name: string | null;
  sector: string | null;
  weight: number;
  factors: Record<string, number | null>;
}

export interface Coverage {
  factor_id: string;
  computable: number;
  total: number;
}

export interface FunnelStep {
  label: string;
  remaining: number;
}

export interface ScreenRequest {
  index_id: number;
  filters: FilterSpec[];
  weighting: WeightingSpec;
  basis?: string | null;
  as_of?: string | null;
  display_factors?: string[];
  custom_factors?: CustomFactorSpec[];
}

export interface ScreenResponse {
  as_of: string;
  universe: Universe;
  membership_count: number;
  basis: string;
  weighting_scheme: string;
  holdings: Holding[];
  funnel: FunnelStep[];
  coverage: Coverage[];
  dropped_no_weight: number;
  notes: string[];
}

// Backtest
export type BacktestStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface BacktestRequest {
  index_id: number;
  start: string;
  end: string;
  frequency: Frequency;
  filters: FilterSpec[];
  weighting: WeightingSpec;
  basis?: string | null;
  benchmark_index_id?: number | null;
  custom_factors?: CustomFactorSpec[];
  name?: string | null;
}

export interface BacktestMetrics {
  total_return: number;
  cagr: number;
  ann_vol: number;
  sharpe: number;
  max_drawdown: number;
  best_day: number;
  worst_day: number;
  n_days: number;
}

export interface RebalanceSnap {
  date: string;
  n_holdings: number;
  turnover: number;
  holdings: {
    security_id: number;
    symbol: string | null;
    sector: string | null;
    weight: number;
    is_new: boolean;
  }[];
}

export interface BacktestResult {
  dates: string[];
  nav: number[];
  benchmark_nav: number[];
  drawdown: number[];
  metrics: BacktestMetrics;
  benchmark_metrics: BacktestMetrics;
  rebalances: RebalanceSnap[];
  notes: string[];
}

export interface BacktestJob {
  id: string;
  name: string | null;
  status: BacktestStatus;
  progress: number;
  stage: string | null;
  error: string | null;
  spec: Record<string, unknown>;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  result: BacktestResult | null;
}

export interface CustomFactor {
  id: string;
  name: string;
  expression: string;
  direction: string;
  normalization: string;
  created_at: string;
}

export interface Strategy {
  id: string;
  name: string;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FactorPreviewRow {
  security_id: number;
  symbol: string | null;
  name: string | null;
  sector: string | null;
  value: number | null;
}

export interface FactorPreviewResponse {
  as_of: string;
  factor_id: string;
  computable: number;
  total: number;
  top: FactorPreviewRow[];
  bottom: FactorPreviewRow[];
}

// ── Client ─────────────────────────────────────────────────────────────────

export const portfolioApi = {
  universes: () => apiClient.get<Universe[]>(`${base}/universes`),
  factors: () => apiClient.get<FactorMeta[]>(`${base}/factors`),
  screen: (body: ScreenRequest) => apiClient.post<ScreenResponse>(`${base}/screen`, { body }),
  submitBacktest: (body: BacktestRequest) =>
    apiClient.post<BacktestJob>(`${base}/backtest`, { body }),
  getBacktest: (id: string) => apiClient.get<BacktestJob>(`${base}/backtest/${id}`),
  listBacktests: () => apiClient.get<BacktestJob[]>(`${base}/backtests`),
  factorPreview: (body: {
    index_id: number;
    factor_id?: string | null;
    custom?: CustomFactorSpec | null;
    as_of?: string | null;
    basis?: string | null;
    limit?: number;
  }) => apiClient.post<FactorPreviewResponse>(`${base}/factors/preview`, { body }),
  validateExpression: (expression: string) =>
    apiClient.post<{ ok: boolean; refs: string[]; error: string | null }>(
      `${base}/custom-factors/validate`, { body: { expression } },
    ),
  listCustomFactors: () => apiClient.get<CustomFactor[]>(`${base}/custom-factors`),
  createCustomFactor: (body: {
    name: string; expression: string; direction: string; normalization: string;
  }) => apiClient.post<CustomFactor>(`${base}/custom-factors`, { body }),
  deleteCustomFactor: (id: string) =>
    apiClient.delete<void>(`${base}/custom-factors/${id}`),
  listStrategies: () => apiClient.get<Strategy[]>(`${base}/strategies`),
  getStrategy: (id: string) => apiClient.get<Strategy>(`${base}/strategies/${id}`),
  createStrategy: (body: { name: string; config: Record<string, unknown> }) =>
    apiClient.post<Strategy>(`${base}/strategies`, { body }),
  deleteStrategy: (id: string) => apiClient.delete<void>(`${base}/strategies/${id}`),
};

export const portfolioKeys = {
  universes: ["pb", "universes"] as const,
  factors: ["pb", "factors"] as const,
  backtest: (id: string) => ["pb", "backtest", id] as const,
  backtests: ["pb", "backtests"] as const,
  customFactors: ["pb", "custom-factors"] as const,
  strategies: ["pb", "strategies"] as const,
};

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useUniverses(options?: Omit<UseQueryOptions<Universe[], Error>, "queryKey" | "queryFn">) {
  return useQuery({ queryKey: portfolioKeys.universes, queryFn: portfolioApi.universes, staleTime: 6 * 3600_000, ...options });
}

export function useFactors(options?: Omit<UseQueryOptions<FactorMeta[], Error>, "queryKey" | "queryFn">) {
  return useQuery({ queryKey: portfolioKeys.factors, queryFn: portfolioApi.factors, staleTime: 6 * 3600_000, ...options });
}

export function useScreenMutation() {
  return useMutation({ mutationFn: portfolioApi.screen });
}

export function useFactorPreviewMutation() {
  return useMutation({ mutationFn: portfolioApi.factorPreview });
}

/** Poll a backtest job while it's queued/running; stop once it settles. */
export function useBacktest(id: string | null) {
  return useQuery({
    queryKey: portfolioKeys.backtest(id ?? ""),
    queryFn: () => portfolioApi.getBacktest(id!),
    enabled: !!id,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "queued" || s === "running" ? 1500 : false;
    },
    placeholderData: keepPreviousData,
  });
}

export function useBacktests() {
  return useQuery({ queryKey: portfolioKeys.backtests, queryFn: portfolioApi.listBacktests });
}

export function useSubmitBacktest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: portfolioApi.submitBacktest,
    onSuccess: () => qc.invalidateQueries({ queryKey: portfolioKeys.backtests }),
  });
}

export function useCustomFactors() {
  return useQuery({ queryKey: portfolioKeys.customFactors, queryFn: portfolioApi.listCustomFactors });
}

export function useCreateCustomFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: portfolioApi.createCustomFactor,
    onSuccess: () => qc.invalidateQueries({ queryKey: portfolioKeys.customFactors }),
  });
}

export function useDeleteCustomFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: portfolioApi.deleteCustomFactor,
    onSuccess: () => qc.invalidateQueries({ queryKey: portfolioKeys.customFactors }),
  });
}

export function useStrategies() {
  return useQuery({ queryKey: portfolioKeys.strategies, queryFn: portfolioApi.listStrategies });
}

export function useCreateStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: portfolioApi.createStrategy,
    onSuccess: () => qc.invalidateQueries({ queryKey: portfolioKeys.strategies }),
  });
}

export function useDeleteStrategy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: portfolioApi.deleteStrategy,
    onSuccess: () => qc.invalidateQueries({ queryKey: portfolioKeys.strategies }),
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: "15d", label: "Every 15 days" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Semi-annual" },
  { value: "annual", label: "Annual" },
];

export const OPERATORS: { value: Operator; label: string }[] = [
  { value: ">", label: ">" },
  { value: ">=", label: "≥" },
  { value: "<", label: "<" },
  { value: "<=", label: "≤" },
  { value: "=", label: "=" },
  { value: "between", label: "between" },
  { value: "top_k", label: "top K" },
  { value: "bottom_k", label: "bottom K" },
];

/** Format a factor value in its unit (× / % / ₹ cr). */
export function fmtFactor(v: number | null | undefined, meta?: { unit: string; decimals: number }): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const dec = meta?.decimals ?? 2;
  if (meta?.unit === "₹ crore") return `₹${Math.round(v).toLocaleString("en-IN")} cr`;
  const s = v.toLocaleString("en-IN", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  if (meta?.unit === "%") return `${s}%`;
  if (meta?.unit === "×") return `${s}×`;
  return s;
}

export function pct(v: number | null | undefined, dec = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(dec)}%`;
}
