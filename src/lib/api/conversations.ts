/**
 * Chat conversation history — `/api/v1/chat/conversations`.
 *
 * A conversation is the set of agent runs sharing a `session_id` (backend MVP,
 * no new table). `useRecentConversations` powers the sidebar: in MOCK mode it
 * returns the sample `RECENT_CHATS` (for demos/dev); otherwise the real
 * per-user history from the backend.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RECENT_CHATS } from "@/lib/mockData";
import { apiClient } from "./client";
import {
  isMockModeEnabled,
  type ClarificationEvent,
  type FinalAnswer,
  type PlanStep,
} from "./chat";

export interface ConversationSummary {
  session_id: string;
  title: string;
  turns: number;
  last_activity: string;
  preview: string;
  agent_name: string | null;
  is_pinned: boolean;
}

/** The caller's 👍/👎 on one answer (+1 / -1), with optional 👎 detail. */
export interface MessageFeedback {
  rating: 1 | -1;
  reasons: string[];
  comment: string | null;
}

export interface ConversationTurn {
  agent_run_id: string;
  user_input: string;
  final_answer: string | null;
  status: string;
  created_at: string;
  tool_trace: Array<Record<string, unknown>> | null;
  /** Rich view restored from the backend's result_payload so replay matches the
   *  live render (citations/confidence/freshness/sources/follow-ups, task
   *  checklist, pending question). Absent/empty on legacy rows. */
  structured?: FinalAnswer | null;
  plan?: PlanStep[];
  clarification?: ClarificationEvent | null;
  /** The caller's saved rating of this answer (null if not rated) — surfaced so
   *  replay shows the 👍/👎 state. */
  feedback?: MessageFeedback | null;
}

export interface ConversationDetail {
  session_id: string;
  turns: ConversationTurn[];
}

/** The active public share for a conversation (owner view). */
export interface ShareRead {
  token: string;
  shared_at: string;
}

/** A frozen, read-only shared conversation snapshot (served at a public token). */
export interface SharedConversationDetail {
  title: string;
  shared_at: string;
  turns: ConversationTurn[];
}

export interface ConversationListOpts {
  /** Show only archived conversations (the "Archived" view) vs the default. */
  archived?: boolean;
  /** Page size — grow it to "load more" (server orders pinned-first by recency). */
  limit?: number;
}

export const conversationKeys = {
  all: ["conversations"] as const,
  /** Prefix for every list variant — for invalidation. */
  lists: () => ["conversations", "list"] as const,
  /** A specific list, keyed by (search query, archived, limit). */
  list: (q = "", opts: ConversationListOpts = {}) =>
    ["conversations", "list", q, !!opts.archived, opts.limit ?? 30] as const,
};

export const conversationsApi = {
  list: (q = "", opts: ConversationListOpts = {}, signal?: AbortSignal) =>
    apiClient.get<ConversationSummary[]>("/api/v1/chat/conversations", {
      query: {
        limit: opts.limit ?? 30,
        ...(q && q.trim() ? { q: q.trim() } : {}),
        ...(opts.archived ? { archived: true } : {}),
      },
      signal,
    }),
  get: (sessionId: string) =>
    apiClient.get<ConversationDetail>(`/api/v1/chat/conversations/${encodeURIComponent(sessionId)}`),
  remove: (sessionId: string) =>
    apiClient.delete<void>(`/api/v1/chat/conversations/${encodeURIComponent(sessionId)}`),
  rename: (sessionId: string, title: string) =>
    apiClient.patch<void>(`/api/v1/chat/conversations/${encodeURIComponent(sessionId)}`, {
      body: { title },
    }),
  /** Generic update — rename / pin / archive (any subset). */
  update: (
    sessionId: string,
    body: { title?: string; pinned?: boolean; archived?: boolean },
  ) =>
    apiClient.patch<void>(`/api/v1/chat/conversations/${encodeURIComponent(sessionId)}`, {
      body,
    }),
  /** Rate one answer (👍/👎). On 👎 the picker also sends `reasons` + `comment`.
   *  Upserts on the backend — re-rating replaces the prior row. */
  submitFeedback: (
    agentRunId: string,
    body: { rating: 1 | -1; reasons?: string[]; comment?: string | null },
  ) =>
    apiClient.post<void>(`/api/v1/chat/runs/${encodeURIComponent(agentRunId)}/feedback`, {
      body,
    }),
  /** Remove a rating (toggle 👍/👎 back to neutral). */
  clearFeedback: (agentRunId: string) =>
    apiClient.delete<void>(`/api/v1/chat/runs/${encodeURIComponent(agentRunId)}/feedback`),
  /** Create (or get) a read-only public share link for a conversation. Owner
   *  only; idempotent — returns the existing link if already shared. */
  share: (sessionId: string) =>
    apiClient.post<ShareRead>(
      `/api/v1/chat/conversations/${encodeURIComponent(sessionId)}/share`,
      { body: {} },
    ),
  /** Revoke a conversation's public share link (the token stops resolving). */
  revokeShare: (sessionId: string) =>
    apiClient.delete<void>(`/api/v1/chat/conversations/${encodeURIComponent(sessionId)}/share`),
  /** PUBLIC — fetch a frozen shared conversation by its token (no auth). */
  getShared: (token: string) =>
    apiClient.get<SharedConversationDetail>(`/api/v1/chat/shared/${encodeURIComponent(token)}`),
};

export interface RecentItem {
  id: string; // session_id (real) or mock id
  label: string;
  pinned: boolean;
}

/**
 * Recent conversations for the sidebar / history. MOCK mode → the sample chats
 * so demos keep working; otherwise the signed-in user's real history (pinned
 * first, server-ordered). `opts.archived` selects the Archived view; `opts.limit`
 * grows for "load more". `loading` avoids flashing an empty state pre-fetch.
 */
export function useRecentConversations(
  q = "",
  opts: ConversationListOpts = {},
): { items: RecentItem[]; isMock: boolean; loading: boolean } {
  const mock = isMockModeEnabled();
  const term = q.trim();
  const query = useQuery({
    queryKey: conversationKeys.list(term, opts),
    queryFn: ({ signal }) => conversationsApi.list(term, opts, signal),
    enabled: !mock, // skip the network entirely in mock mode
    staleTime: 30_000,
  });

  if (mock) {
    const all = RECENT_CHATS.map((c) => ({ id: c.id, label: c.label, pinned: false }));
    const items = term
      ? all.filter((c) => c.label.toLowerCase().includes(term.toLowerCase()))
      : all;
    // Mock has no archive concept → the Archived view is empty.
    return { items: opts.archived ? [] : items, isMock: true, loading: false };
  }
  const items = (query.data ?? []).map((c) => ({
    id: c.session_id,
    label: c.title,
    pinned: c.is_pinned,
  }));
  return { items, isMock: false, loading: query.isLoading };
}

/** Soft-delete (hide) a conversation. Optimistically removes it from the list
 *  so the row disappears instantly; rolls back on error; reconciles after. */
export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => conversationsApi.remove(sessionId),
    onMutate: async (sessionId: string) => {
      await qc.cancelQueries({ queryKey: conversationKeys.lists() });
      const previous = qc.getQueryData<ConversationSummary[]>(conversationKeys.list());
      qc.setQueryData<ConversationSummary[]>(conversationKeys.list(), (old) =>
        old?.filter((c) => c.session_id !== sessionId),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(conversationKeys.list(), ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: conversationKeys.lists() }),
  });
}

/** Rename a conversation. Optimistically updates the title in the cached list
 *  so it changes instantly; rolls back on error; reconciles after. */
export function useRenameConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, title }: { sessionId: string; title: string }) =>
      conversationsApi.rename(sessionId, title),
    onMutate: async ({ sessionId, title }: { sessionId: string; title: string }) => {
      await qc.cancelQueries({ queryKey: conversationKeys.lists() });
      const previous = qc.getQueryData<ConversationSummary[]>(conversationKeys.list());
      qc.setQueryData<ConversationSummary[]>(conversationKeys.list(), (old) =>
        old?.map((c) => (c.session_id === sessionId ? { ...c, title } : c)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(conversationKeys.list(), ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: conversationKeys.lists() }),
  });
}

/** Submit a 👍/👎 on one answer. Keyed by `agent_run_id`; the backend upserts so
 *  re-rating overwrites. No optimistic cache write — the answer footer owns the
 *  pressed/saved UI state locally; this just persists it. */
export function useSubmitFeedback() {
  return useMutation({
    mutationFn: ({
      agentRunId,
      rating,
      reasons,
      comment,
    }: {
      agentRunId: string;
      rating: 1 | -1;
      reasons?: string[];
      comment?: string | null;
    }) => conversationsApi.submitFeedback(agentRunId, { rating, reasons, comment }),
  });
}

/** Remove a rating (toggle 👍/👎 back to neutral). Like `useSubmitFeedback`, the
 *  footer owns the UI state — this just clears the persisted row. */
export function useClearFeedback() {
  return useMutation({
    mutationFn: ({ agentRunId }: { agentRunId: string }) =>
      conversationsApi.clearFeedback(agentRunId),
  });
}

/** Pin / unpin a conversation. Refetches so the server re-orders pinned-first. */
export function usePinConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, pinned }: { sessionId: string; pinned: boolean }) =>
      conversationsApi.update(sessionId, { pinned }),
    onSettled: () => void qc.invalidateQueries({ queryKey: conversationKeys.lists() }),
  });
}

/** Archive / unarchive a conversation. Archiving optimistically removes it from
 *  the default list (instant); the archived view + all variants reconcile after. */
export function useArchiveConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, archived }: { sessionId: string; archived: boolean }) =>
      conversationsApi.update(sessionId, { archived }),
    onMutate: async ({ sessionId, archived }: { sessionId: string; archived: boolean }) => {
      await qc.cancelQueries({ queryKey: conversationKeys.lists() });
      const previous = qc.getQueryData<ConversationSummary[]>(conversationKeys.list());
      if (archived) {
        qc.setQueryData<ConversationSummary[]>(conversationKeys.list(), (old) =>
          old?.filter((c) => c.session_id !== sessionId),
        );
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(conversationKeys.list(), ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: conversationKeys.lists() }),
  });
}
