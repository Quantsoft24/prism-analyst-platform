/**
 * Regulatory Lens API client + React Query hooks.
 *
 * Backed by PRISM's `/api/v1/regulatory/*` router, which reads the SEBI Postgres
 * (`content` ~40k SEBI docs + `ai_tags` JSON, `weekly_summaries`, `insight_feed`)
 * read-only. Wire shapes mirror `src/schemas/regulatory.py`.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

import { apiClient } from "./client";

// ── Wire types ───────────────────────────────────────────────────────────────

export type Severity = "High" | "Medium" | "Low";

export interface AiTags {
  intent?: string | null;
  topics: string[];
  stakeholders: string[];
  severity?: Severity | null;
  action_required: boolean;
  deadlines: string[];
}

export interface RegDocSummary {
  id: number;
  type: string;
  sub_type?: string | null;
  title: string;
  date?: string | null;
  summary?: string | null;
  sebi_id?: string | null;
  sebi_department?: string | null;
  ai_tags: AiTags;
}

export interface RegDocDetail extends RegDocSummary {
  sebi_url?: string | null;
  sebi_section?: string | null;
  sebi_sub_section?: string | null;
  sebi_info_for?: string | null;
  meeting_date?: string | null;
  extracted_text?: string | null;
  language?: string | null;
  related_content_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface FeedResponse {
  items: RegDocSummary[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

export interface TypeCount {
  type: string;
  count: number;
}
export interface SeverityCount {
  severity: string;
  count: number;
}
export interface IntentCount {
  intent: string;
  count: number;
}
export interface TopicCount {
  topic: string;
  count: number;
}

export interface RegStats {
  total_documents: number;
  this_week: number;
  today: number;
  action_required: number;
  high_severity_week: number;
  open_deadlines: number;
  type_counts: TypeCount[];
  severity_counts: SeverityCount[];
  intent_counts: IntentCount[];
}

export interface DeadlineItem {
  id: number;
  type: string;
  title: string;
  date?: string | null;
  deadline: string;
  severity?: Severity | null;
  intent?: string | null;
}
export interface DeadlinesResponse {
  items: DeadlineItem[];
  total: number;
}

export interface WeeklySummary {
  id: number;
  week_start_date?: string | null;
  week_end_date?: string | null;
  generated_at?: string | null;
  summary_text?: string | null;
}
export interface WeeklySummariesResponse {
  items: WeeklySummary[];
}

export type EventKind = "deadline" | "board";
export interface CalendarEvent {
  id: number;
  type: string;
  title: string;
  date: string; // YYYY-MM-DD
  kind: EventKind;
  severity?: Severity | null;
}
export interface CalendarResponse {
  events: CalendarEvent[];
}

// ── Per-user personalization ────────────────────────────────────────────────

export type TermKind = "topic" | "entity";

export interface TrackedTerm {
  term: string;
  kind: TermKind;
}

export interface AlertRules {
  orders_naming_entity: boolean;
  circular_matching_topic: boolean;
  deadline_soon: boolean;
}

export interface RegPersonalization {
  bookmarks: number[];
  tracked: TrackedTerm[];
  alert_rules: AlertRules;
}

export interface RegAlert extends RegDocSummary {
  matched_term?: string | null;
}
export interface AlertsResponse {
  items: RegAlert[];
  total: number;
}

export interface FeedParams {
  page?: number;
  limit?: number;
  type?: string;
  severity?: Severity;
  intent?: string;
  action_required?: boolean;
  topic?: string;
  search?: string;
  date_from?: string;
  date_to?: string;
}

// ── Client ───────────────────────────────────────────────────────────────────

const base = "/api/v1/regulatory";

export const regulatoryApi = {
  stats: (signal?: AbortSignal) => apiClient.get<RegStats>(`${base}/stats`, { signal }),
  feed: (params: FeedParams, signal?: AbortSignal) =>
    apiClient.get<FeedResponse>(`${base}/feed`, {
      query: {
        page: params.page ?? 1,
        limit: params.limit ?? FEED_PAGE_SIZE,
        type: params.type,
        severity: params.severity,
        intent: params.intent,
        action_required: params.action_required,
        topic: params.topic,
        search: params.search,
        date_from: params.date_from,
        date_to: params.date_to,
      },
      signal,
    }),
  doc: (id: number, signal?: AbortSignal) =>
    apiClient.get<RegDocDetail>(`${base}/content/${id}`, { signal }),
  recent: (limit = 10, signal?: AbortSignal) =>
    apiClient.get<RegDocSummary[]>(`${base}/recent`, { query: { limit }, signal }),
  deadlines: (limit = 30, signal?: AbortSignal) =>
    apiClient.get<DeadlinesResponse>(`${base}/deadlines`, { query: { limit }, signal }),
  calendar: (start: string, end: string, signal?: AbortSignal) =>
    apiClient.get<CalendarResponse>(`${base}/calendar`, { query: { start, end }, signal }),
  weeklySummaries: (limit = 8, signal?: AbortSignal) =>
    apiClient.get<WeeklySummariesResponse>(`${base}/weekly-summary`, {
      query: { limit },
      signal,
    }),
  topics: (limit = 50, signal?: AbortSignal) =>
    apiClient.get<TopicCount[]>(`${base}/topics`, { query: { limit }, signal }),
  types: (signal?: AbortSignal) => apiClient.get<TypeCount[]>(`${base}/types`, { signal }),
  me: (signal?: AbortSignal) => apiClient.get<RegPersonalization>(`${base}/me`, { signal }),
  putMe: (body: RegPersonalization) => apiClient.put<RegPersonalization>(`${base}/me`, { body }),
  alerts: (limit = 20, signal?: AbortSignal) =>
    apiClient.get<AlertsResponse>(`${base}/alerts`, { query: { limit }, signal }),
  bookmarks: (signal?: AbortSignal) =>
    apiClient.get<RegDocSummary[]>(`${base}/bookmarks`, { signal }),
};

export const FEED_PAGE_SIZE = 20;

export const regKeys = {
  all: ["regulatory"] as const,
  stats: () => ["regulatory", "stats"] as const,
  feed: (p: FeedParams) => ["regulatory", "feed", p] as const,
  doc: (id: number) => ["regulatory", "doc", id] as const,
  recent: (limit: number) => ["regulatory", "recent", limit] as const,
  deadlines: (limit: number) => ["regulatory", "deadlines", limit] as const,
  calendar: (start: string, end: string) => ["regulatory", "calendar", start, end] as const,
  weekly: (limit: number) => ["regulatory", "weekly", limit] as const,
  topics: (limit: number) => ["regulatory", "topics", limit] as const,
  types: () => ["regulatory", "types"] as const,
  me: () => ["regulatory", "me"] as const,
  alerts: (limit: number) => ["regulatory", "alerts", limit] as const,
  bookmarks: () => ["regulatory", "bookmarks"] as const,
};

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useRegStats() {
  return useQuery({
    queryKey: regKeys.stats(),
    queryFn: ({ signal }) => regulatoryApi.stats(signal),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRegFeed(
  params: FeedParams,
  options?: Omit<UseQueryOptions<FeedResponse, Error>, "queryKey" | "queryFn">,
) {
  return useQuery({
    queryKey: regKeys.feed(params),
    queryFn: ({ signal }) => regulatoryApi.feed(params, signal),
    ...options,
  });
}

export function useRegDoc(id: number | null) {
  return useQuery({
    queryKey: regKeys.doc(id ?? 0),
    queryFn: ({ signal }) => regulatoryApi.doc(id!, signal),
    enabled: id != null,
  });
}

export function useRegRecent(limit = 10) {
  return useQuery({
    queryKey: regKeys.recent(limit),
    queryFn: ({ signal }) => regulatoryApi.recent(limit, signal),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRegDeadlines(limit = 30) {
  return useQuery({
    queryKey: regKeys.deadlines(limit),
    queryFn: ({ signal }) => regulatoryApi.deadlines(limit, signal),
    staleTime: 5 * 60 * 1000,
  });
}

/** Calendar events (deadlines + board meetings) in a date range. */
export function useRegCalendar(start: string, end: string) {
  return useQuery({
    queryKey: regKeys.calendar(start, end),
    queryFn: ({ signal }) => regulatoryApi.calendar(start, end, signal),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRegWeeklySummaries(limit = 8) {
  return useQuery({
    queryKey: regKeys.weekly(limit),
    queryFn: ({ signal }) => regulatoryApi.weeklySummaries(limit, signal),
    staleTime: 30 * 60 * 1000,
  });
}

export function useRegTopics(limit = 50) {
  return useQuery({
    queryKey: regKeys.topics(limit),
    queryFn: ({ signal }) => regulatoryApi.topics(limit, signal),
    staleTime: 60 * 60 * 1000,
  });
}

export function useRegTypes() {
  return useQuery({
    queryKey: regKeys.types(),
    queryFn: ({ signal }) => regulatoryApi.types(signal),
    staleTime: 60 * 60 * 1000,
  });
}

export function useRegPersonalization() {
  return useQuery({
    queryKey: regKeys.me(),
    queryFn: ({ signal }) => regulatoryApi.me(signal),
    staleTime: 60 * 1000,
  });
}

export function useRegAlerts(limit = 20, enabled = true) {
  return useQuery({
    queryKey: regKeys.alerts(limit),
    queryFn: ({ signal }) => regulatoryApi.alerts(limit, signal),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useRegBookmarks(enabled = true) {
  return useQuery({
    queryKey: regKeys.bookmarks(),
    queryFn: ({ signal }) => regulatoryApi.bookmarks(signal),
    enabled,
    staleTime: 60 * 1000,
  });
}

/** Replace the user's personalization blob; refreshes derived queries. */
export function usePutRegPersonalization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegPersonalization) => regulatoryApi.putMe(body),
    onSuccess: (saved) => {
      qc.setQueryData(regKeys.me(), saved);
      qc.invalidateQueries({ queryKey: ["regulatory", "alerts"] });
      qc.invalidateQueries({ queryKey: regKeys.bookmarks() });
    },
  });
}

/** Default personalization for optimistic/empty states. */
export const EMPTY_PERSONALIZATION: RegPersonalization = {
  bookmarks: [],
  tracked: [],
  alert_rules: {
    orders_naming_entity: true,
    circular_matching_topic: true,
    deadline_soon: true,
  },
};

/** Convenience for the bookmark toggle (drawer + watchlist share one source). */
export function useToggleBookmark() {
  const { data } = useRegPersonalization();
  const put = usePutRegPersonalization();
  const current = data ?? EMPTY_PERSONALIZATION;
  return {
    isBookmarked: (id: number) => current.bookmarks.includes(id),
    toggle: (id: number) => {
      const has = current.bookmarks.includes(id);
      put.mutate({
        ...current,
        bookmarks: has
          ? current.bookmarks.filter((x) => x !== id)
          : [...current.bookmarks, id],
      });
    },
    pending: put.isPending,
  };
}

// ── Display helpers (shared across components) ───────────────────────────────

/** Visual "tone" per content type — drives the icon/tag color class. */
export type RegTone = "cir" | "mc" | "reg" | "ord" | "con" | "bm" | "gen";

interface TypeMeta {
  label: string;
  short: string;
  tone: RegTone;
}

export const TYPE_META: Record<string, TypeMeta> = {
  CIRCULAR: { label: "Circular", short: "Circular", tone: "cir" },
  MASTER_CIRCULAR: { label: "Master Circular", short: "Master", tone: "mc" },
  REGULATION: { label: "Regulation", short: "Regulation", tone: "reg" },
  RULES: { label: "Rules", short: "Rules", tone: "reg" },
  ACT: { label: "Act", short: "Act", tone: "reg" },
  GUIDELINE: { label: "Guideline", short: "Guideline", tone: "reg" },
  ORDER: { label: "Order", short: "Order", tone: "ord" },
  GENERAL_ORDER: { label: "General Order", short: "Gen Order", tone: "ord" },
  PRESS_RELEASE: { label: "Press Release", short: "Press", tone: "gen" },
  BOARD_MEETING: { label: "Board Meeting", short: "Board", tone: "bm" },
  GAZETTE_NOTIFICATION: { label: "Gazette Notification", short: "Gazette", tone: "con" },
  ADVISORY: { label: "Advisory", short: "Advisory", tone: "con" },
  MUTUAL_FUND: { label: "Mutual Fund", short: "MF", tone: "mc" },
  CONSULTATION_PAPER: { label: "Consultation Paper", short: "Consultation", tone: "con" },
  FAQ: { label: "FAQ", short: "FAQ", tone: "gen" },
  SPEECH: { label: "Speech", short: "Speech", tone: "gen" },
};

export function typeMeta(type: string): TypeMeta {
  return (
    TYPE_META[type] ?? {
      label: formatType(type),
      short: formatType(type),
      tone: "gen",
    }
  );
}

/** "PRESS_RELEASE" → "Press Release". */
export function formatType(t: string): string {
  return t
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** ISO date → "4 Jun 2026" (en-IN). Returns "" on bad input. */
export function formatRegDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Severity → tone token for color classes (High=neg, Medium=warn, Low=info). */
export function severityTone(s?: string | null): "hi" | "med" | "low" | "none" {
  if (s === "High") return "hi";
  if (s === "Medium") return "med";
  if (s === "Low") return "low";
  return "none";
}

/** Days until a YYYY-MM-DD deadline (negative = past). */
export function daysUntil(deadline: string): number {
  const d = new Date(deadline + "T00:00:00");
  if (Number.isNaN(d.getTime())) return NaN;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}
