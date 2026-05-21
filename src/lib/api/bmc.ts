/**
 * BMC (Business Model Canvas) API client + React Query hooks.
 *
 * Wire types mirror `prism-analyst-services/src/schemas/bmc.py`. Keep in sync.
 *
 * Two read hooks (`useBMC`, `useBMCLibrary`) and one mutation (`useGenerateBMC`).
 * Generation is slow (~15-40s, 9 grounded LLM calls) so the mutation has no
 * retry and a long-running expectation; the UI shows a generating state.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";

import { apiClient } from "./client";

// ── Wire types (mirror schemas/bmc.py) ────────────────────────────────────

export interface BMCEvidence {
  marker: string;
  chunk_id: string | null;
  filing_id: string | null;
  page_number: number | null;
  excerpt: string;
}

export interface BMCBlock {
  block_id: string;
  title: string;
  order: number;
  summary_bullets: string[];
  key_insights: string[] | null;
  confidence: number;
  status: "ok" | "evidence_missing" | "failed";
  evidence: BMCEvidence[];
}

export interface BMCContradiction {
  block_a: string;
  block_b: string;
  issue: string;
}

export interface BMC {
  id: string;
  ticker: string;
  company_id: string;
  version: number;
  fiscal_period: string | null;
  status: "running" | "complete" | "partial" | "failed";
  overall_confidence: number | null;
  model: string | null;
  created_at: string;
  blocks: BMCBlock[];
  contradictions: BMCContradiction[];
}

export interface BMCVersionSummary {
  id: string;
  ticker: string;
  version: number;
  fiscal_period: string | null;
  status: string;
  overall_confidence: number | null;
  created_at: string;
}

// ── Client ─────────────────────────────────────────────────────────────────

export interface BMCChatMessage {
  role: "user" | "assistant";
  content: string;
}

export const bmcApi = {
  getLatest(ticker: string, signal?: AbortSignal): Promise<BMC> {
    return apiClient.get<BMC>(`/api/v1/bmc/${encodeURIComponent(ticker)}`, { signal });
  },
  getVersion(ticker: string, version: number, signal?: AbortSignal): Promise<BMC> {
    return apiClient.get<BMC>(`/api/v1/bmc/${encodeURIComponent(ticker)}/${version}`, { signal });
  },
  library(ticker: string, signal?: AbortSignal): Promise<BMCVersionSummary[]> {
    return apiClient.get<BMCVersionSummary[]>(`/api/v1/bmc/${encodeURIComponent(ticker)}/library`, { signal });
  },
  run(ticker: string, fiscalPeriod?: string): Promise<BMC> {
    return apiClient.post<BMC>(`/api/v1/bmc/${encodeURIComponent(ticker)}/run`, {
      body: { fiscal_period: fiscalPeriod ?? null },
    });
  },
  /** Drill-down chat about one block. Stateless — pass the prior thread. */
  chatBlock(
    ticker: string,
    blockId: string,
    message: string,
    history: BMCChatMessage[],
  ): Promise<{ answer: string }> {
    return apiClient.post<{ answer: string }>(
      `/api/v1/bmc/${encodeURIComponent(ticker)}/blocks/${encodeURIComponent(blockId)}/chat`,
      { body: { message, history } },
    );
  },
};

export const bmcKeys = {
  all: ["bmc"] as const,
  latest: (ticker: string) => ["bmc", "latest", ticker] as const,
  library: (ticker: string) => ["bmc", "library", ticker] as const,
};

/** Latest canvas for a ticker. `enabled` gates the fetch until a ticker is chosen. */
export function useBMC(
  ticker: string | null,
  options?: Omit<UseQueryOptions<BMC, Error>, "queryKey" | "queryFn" | "enabled">,
) {
  return useQuery({
    queryKey: bmcKeys.latest(ticker ?? ""),
    queryFn: ({ signal }) => bmcApi.getLatest(ticker!, signal),
    enabled: !!ticker,
    // A 404 (no canvas yet) is an expected state, not a transient error —
    // don't retry it.
    retry: false,
    ...options,
  });
}

export function useBMCLibrary(ticker: string | null) {
  return useQuery({
    queryKey: bmcKeys.library(ticker ?? ""),
    queryFn: ({ signal }) => bmcApi.library(ticker!, signal),
    enabled: !!ticker,
  });
}

/** Generate a new canvas version. Long-running; invalidates the latest+library on success. */
export function useGenerateBMC(ticker: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fiscalPeriod?: string) => bmcApi.run(ticker!, fiscalPeriod),
    onSuccess: (data) => {
      qc.setQueryData(bmcKeys.latest(data.ticker), data);
      qc.invalidateQueries({ queryKey: bmcKeys.library(data.ticker) });
    },
  });
}
