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

import { config } from "@/lib/config";
import { apiClient, authHeaders } from "./client";

// ── Wire types (match the external BMC service response) ─────────────────

export interface BMCEvidence {
  marker: string;        // e.g. "[1]"
  newsid: string;        // filing identifier from filings_index
  page: number | null;   // page number inside the PDF
  excerpt: string;       // verbatim quoted text
  /** Clickable source-PDF URL with `#page=N` appended — deep-links to the cited
   *  page. Resolved at response time by the BMC service; forwarded by our proxy. */
  pdf_url?: string | null;
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
  /** Whole-document source PDF (no page anchor) — "View full source filing". */
  pdf_url?: string | null;
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

/** One row in the firm-wide Library — the latest canvas per company.
 *  Matches `GET /bmc/library` (entries[]), enriched from filings_index. */
export interface BMCLibraryEntry {
  ticker: string;
  company_name: string;
  security_id_bse?: number | null;
  security_id_nse?: number | null;
  isin?: string | null;
  sector?: string | null;
  industry?: string | null;
  latest_version: number;
  version_count: number;
  latest_bmc_id?: string;
  latest_fiscal_period?: string | null;
  latest_status: BMC["status"];
  latest_overall_confidence: number | null;
  last_generated_at: string; // ISO datetime
}

// ── Temporal diff (POST /bmc/{ticker}/diff) ──────────────────────────────────

export interface BMCBlockDiff {
  block_id: string;
  title?: string;
  /** Facts present in period B but not A. */
  added?: string[];
  /** Facts present in A but gone in B. */
  removed?: string[];
  /** Facts that materially changed between the two periods. */
  changed?: string[];
  /** Optional per-block narrative of the change. */
  narrative?: string | null;
  status?: string;
}

export interface BMCDiff {
  ticker: string;
  /** Period anchors / version refs the service diffed (shape varies — render loosely). */
  a?: Record<string, unknown> | null;
  b?: Record<string, unknown> | null;
  block_diffs: BMCBlockDiff[];
  /** Top-level prose summary of how the business model evolved. */
  narrative: string;
  from_cache?: boolean;
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
  /** All canvases saved for this firm (latest version per company), enriched
   *  from filings_index. `GET /bmc/library` returns `{firm_id, total, entries}`;
   *  we unwrap to the entries list (tolerating a bare array too). */
  listAllCanvases(signal?: AbortSignal): Promise<BMCLibraryEntry[]> {
    return apiClient
      .get<BMCLibraryEntry[] | { entries?: BMCLibraryEntry[] }>("/api/v1/bmc/library", { signal })
      .then((r) => (Array.isArray(r) ? r : (r?.entries ?? [])));
  },
  getLatest(ticker: string, signal?: AbortSignal): Promise<BMC> {
    return apiClient.get<BMC>(`/api/v1/bmc/${encodeURIComponent(ticker)}`, { signal });
  },
  getVersion(ticker: string, version: number, signal?: AbortSignal): Promise<BMC> {
    return apiClient.get<BMC>(`/api/v1/bmc/${encodeURIComponent(ticker)}/${version}`, { signal });
  },
  library(ticker: string, signal?: AbortSignal): Promise<BMCVersionSummary[]> {
    // The service returns `{ticker, company_name, versions: [...]}` (not a bare
    // array) — unwrap to the versions list, tolerating either shape.
    return apiClient
      .get<BMCVersionSummary[] | { versions?: BMCVersionSummary[] }>(
        `/api/v1/bmc/${encodeURIComponent(ticker)}/library`,
        { signal },
      )
      .then((r) => (Array.isArray(r) ? r : (r?.versions ?? [])));
  },
  run(ticker: string, opts?: { fiscalPeriod?: string; securityId?: number }): Promise<BMC> {
    const body: Record<string, unknown> = {};
    if (opts?.fiscalPeriod) body.fiscal_period = opts.fiscalPeriod;
    // Integer fast-path — pins the exact NSE/BSE entity, skips the fuzzy resolver.
    if (opts?.securityId != null) body.security_id = opts.securityId;
    return apiClient.post<BMC>(`/api/v1/bmc/${encodeURIComponent(ticker)}/run`, { body });
  },
  /** Temporal diff between two fiscal periods (e.g. "2024" vs "2026"). Slow when
   *  the underlying canvases aren't cached (~60-110s cold). */
  diff(ticker: string, periodA: string, periodB: string, refresh = false): Promise<BMCDiff> {
    return apiClient.post<BMCDiff>(`/api/v1/bmc/${encodeURIComponent(ticker)}/diff`, {
      body: { period_a: periodA, period_b: periodB, refresh },
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
  allCanvases: ["bmc", "all-canvases"] as const,
  latest: (ticker: string) => ["bmc", "latest", ticker] as const,
  library: (ticker: string) => ["bmc", "library", ticker] as const,
  version: (ticker: string, version: number) => ["bmc", "version", ticker, version] as const,
};

/** Firm-wide Library list (every company with a saved canvas). */
export function useBMCAllCanvases() {
  return useQuery({
    queryKey: bmcKeys.allCanvases,
    queryFn: ({ signal }) => bmcApi.listAllCanvases(signal),
    staleTime: 60_000,
  });
}

/**
 * Fetch a BMC export (PDF/JSON) as an object URL through the auth-gated proxy.
 * A plain `<a href>` can't carry the auth header, so we fetch the blob with
 * `authHeaders()` (mirrors `fetchFilingPdfObjectUrl`) and let the caller trigger
 * the download / revoke the URL.
 */
export async function fetchBmcExportObjectUrl(
  ticker: string,
  version: number,
  format: "pdf" | "json",
  signal?: AbortSignal,
): Promise<string> {
  const url = new URL(
    `/api/v1/bmc/${encodeURIComponent(ticker)}/${version}/export`,
    config.apiUrl,
  );
  url.searchParams.set("format", format);
  const resp = await fetch(url.toString(), { headers: await authHeaders(), signal });
  if (!resp.ok) throw new Error(`Export failed: HTTP ${resp.status}`);
  return URL.createObjectURL(await resp.blob());
}

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

/** A specific saved version (for the version timeline). */
export function useBMCVersion(ticker: string | null, version: number | null) {
  return useQuery({
    queryKey: bmcKeys.version(ticker ?? "", version ?? 0),
    queryFn: ({ signal }) => bmcApi.getVersion(ticker!, version!, signal),
    enabled: !!ticker && version != null,
  });
}

/** Generate a new canvas version. Long-running; invalidates the latest+library on success.
 *  Pass `securityId` (from resolve_company) to pin the exact entity. */
export function useGenerateBMC(ticker: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts?: { fiscalPeriod?: string; securityId?: number }) =>
      bmcApi.run(ticker!, opts),
    onSuccess: (data) => {
      qc.setQueryData(bmcKeys.latest(data.ticker), data);
      qc.invalidateQueries({ queryKey: bmcKeys.library(data.ticker) });
    },
  });
}

/** Temporal diff between two fiscal periods. Mutation (on-demand, slow on cold pairs). */
export function useBMCDiff(ticker: string | null) {
  return useMutation({
    mutationFn: (vars: { periodA: string; periodB: string; refresh?: boolean }) =>
      bmcApi.diff(ticker!, vars.periodA, vars.periodB, vars.refresh ?? false),
  });
}
