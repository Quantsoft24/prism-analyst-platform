/**
 * BMC (Business Model Canvas) API client + React Query hooks.
 *
 * Backed by PRISM's `/api/v1/bmc/*` router, which is a thin proxy to the
 * external `bmc` service (read-on-demand 9-block canvas). Wire shapes mirror
 * that service's response — see `integeration_intake_answers.md`.
 *
 * Two read hooks (`useBMC`, `useBMCLibrary`) and one mutation
 * (`useGenerateBMC`). Generation can take ~25-35 s cold; the UI shows a
 * "generating" state. The block drill-down chat is server-stateful now:
 * history lives in `bmc_chats` upstream, so the client just sends a message
 * and the server returns the running history.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";

import { apiClient } from "./client";

// ── Wire types (match the external BMC service response) ─────────────────

export interface BMCEvidence {
  marker: string;        // e.g. "[1]"
  newsid: string;        // filing identifier from filings_index
  page: number | null;   // page number inside the PDF
  excerpt: string;       // verbatim quoted text
}

export interface BMCBlock {
  block_id: string;
  title: string;
  /** Bullets with inline `[n]` citation markers. */
  summary_bullets: string[];
  key_insights?: string[] | null;
  /** "ok" | "evidence_missing"; the service does not emit "failed" per block. */
  status: "ok" | "evidence_missing";
  confidence: number;
  evidence: BMCEvidence[];
}

export interface BMCSelectedFiling {
  slot: "annual_report" | "investor_presentation" | "result" | string;
  category?: string;
  announcement_dt?: string;
  page_count?: number;
  from_cache?: boolean;
  sections_read?: string[];
}

export interface BMC {
  bmc_id: string;
  ticker: string;
  company_name: string;
  version: number;
  /** complete | partial | failed | no_evidence */
  status: "complete" | "partial" | "failed" | "no_evidence";
  overall_confidence: number | null;
  blocks: BMCBlock[];
  selected_filings?: BMCSelectedFiling[];
  /** Slots that the service couldn't find filings for (e.g. ["investor_presentation"]). */
  gaps?: string[];
  needs_clarification?: boolean;
  clarification?: string | null;
}

export interface BMCVersionSummary {
  bmc_id: string;
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

export interface BMCBlockChatResponse {
  answer: string;
  used_markers?: string[];
  evidence_missing?: boolean;
  evidence?: BMCEvidence[];
  /** Full server-side thread so the UI can render the latest state. */
  history?: BMCChatMessage[];
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
      body: fiscalPeriod ? { fiscal_period: fiscalPeriod } : {},
    });
  },
  /**
   * Drill-down chat about one block. Server tracks the thread in `bmc_chats`,
   * so just send the new message and use `response.history` for the UI thread.
   */
  chatBlock(
    ticker: string,
    blockId: string,
    message: string,
    version?: number,
  ): Promise<BMCBlockChatResponse> {
    return apiClient.post<BMCBlockChatResponse>(
      `/api/v1/bmc/${encodeURIComponent(ticker)}/blocks/${encodeURIComponent(blockId)}/chat`,
      { body: version != null ? { user_message: message, version } : { user_message: message } },
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
    // 404 = "no canvas yet" — expected state, don't retry.
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
