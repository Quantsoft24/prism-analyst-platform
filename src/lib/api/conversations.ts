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
}

export interface ConversationDetail {
  session_id: string;
  turns: ConversationTurn[];
}

export const conversationKeys = {
  list: ["conversations", "list"] as const,
};

export const conversationsApi = {
  list: () =>
    apiClient.get<ConversationSummary[]>("/api/v1/chat/conversations", { query: { limit: 30 } }),
  get: (sessionId: string) =>
    apiClient.get<ConversationDetail>(`/api/v1/chat/conversations/${encodeURIComponent(sessionId)}`),
  remove: (sessionId: string) =>
    apiClient.delete<void>(`/api/v1/chat/conversations/${encodeURIComponent(sessionId)}`),
  rename: (sessionId: string, title: string) =>
    apiClient.patch<void>(`/api/v1/chat/conversations/${encodeURIComponent(sessionId)}`, {
      body: { title },
    }),
};

export interface RecentItem {
  id: string; // session_id (real) or mock id
  label: string;
}

/**
 * Recent conversations for the sidebar. MOCK mode → the sample chats so demos
 * keep working; otherwise the signed-in user's real history. `loading` lets the
 * sidebar avoid flashing an empty state before the first fetch resolves.
 */
export function useRecentConversations(): { items: RecentItem[]; isMock: boolean; loading: boolean } {
  const mock = isMockModeEnabled();
  const query = useQuery({
    queryKey: conversationKeys.list,
    queryFn: conversationsApi.list,
    enabled: !mock, // skip the network entirely in mock mode
    staleTime: 30_000,
  });

  if (mock) {
    return { items: RECENT_CHATS.map((c) => ({ id: c.id, label: c.label })), isMock: true, loading: false };
  }
  const items = (query.data ?? []).map((c) => ({ id: c.session_id, label: c.title }));
  return { items, isMock: false, loading: query.isLoading };
}

/** Soft-delete (hide) a conversation. Optimistically removes it from the list
 *  so the row disappears instantly; rolls back on error; reconciles after. */
export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => conversationsApi.remove(sessionId),
    onMutate: async (sessionId: string) => {
      await qc.cancelQueries({ queryKey: conversationKeys.list });
      const previous = qc.getQueryData<ConversationSummary[]>(conversationKeys.list);
      qc.setQueryData<ConversationSummary[]>(conversationKeys.list, (old) =>
        old?.filter((c) => c.session_id !== sessionId),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(conversationKeys.list, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: conversationKeys.list }),
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
      await qc.cancelQueries({ queryKey: conversationKeys.list });
      const previous = qc.getQueryData<ConversationSummary[]>(conversationKeys.list);
      qc.setQueryData<ConversationSummary[]>(conversationKeys.list, (old) =>
        old?.map((c) => (c.session_id === sessionId ? { ...c, title } : c)),
      );
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(conversationKeys.list, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: conversationKeys.list }),
  });
}
