"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  runChatStream,
  type AgentThoughtEvent,
  type ChartEvent,
  type ChatStreamHandle,
  type Citation,
  type DataFreshnessEvent,
  type ErrorEvent,
  type FinalAnswer,
  type ToolNextAction,
} from "@/lib/api/chat";
import { conversationKeys, conversationsApi } from "@/lib/api/conversations";
import {
  INTENT_CONFIGS,
  routeIntent,
  type IntentConfig,
  type IntentType,
} from "@/lib/mockData";

/* ──────────────────────────────────────────────────────────────────────────
 * Phase machine — when the UI surfaces "Stop"/"Retry"/streaming shimmer.
 *   idle      = no run started yet (empty chat).
 *   thinking  = stream open, no tool call / token yet.
 *   tools     = at least one tool_call event seen; may be calling another.
 *   answering = LLM is streaming the prose answer.
 *   done      = FinalEvent received OR terminal ErrorEvent received.
 * ──────────────────────────────────────────────────────────────────────── */
export type Phase = "idle" | "thinking" | "tools" | "answering" | "done";

/** Rich, per-tool-call state assembled from tool_call + tool_result +
 *  data_freshness events for the same call_id. */
export interface ToolCallState {
  call_id: string;
  tool: string;
  args: Record<string, unknown>;
  status: "running" | "done" | "error";
  result_summary: string | null;
  error: string | null;
  error_code: string | null;
  next_action: ToolNextAction | null;
  latency_ms: number | null;
  freshness: { source: string; as_of: string | null } | null;
  retry_attempt: number; // 0 = first try
}

/** Inspectable reasoning from the agent (currently no Gemini variant exposes
 *  these reliably, but the schema is wired and ready). */
export interface AgentThought {
  text: string;
  kind: AgentThoughtEvent["kind"];
}

/** Run-level metadata captured from MetaEvent + FinalEvent — used by the
 *  chat header (agent_run_id pill, model name, cost / token count). */
export interface RunMeta {
  agent_run_id: string | null;
  session_id: string | null;
  agent_name: string | null;
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
}

/** A chart attached to this turn (Workspace → Charts tab). Same shape the
 *  backend emits in a ChartEvent — we just collect them keyed by chart_id. */
export type AssistantChart = Omit<ChartEvent, "type">;

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  // ── Assistant-only state below ──
  streamedText?: string;
  thoughts?: AgentThought[];
  toolCalls?: ToolCallState[];
  isThinking?: boolean;
  showAnswer?: boolean;
  /** Parsed <answer_meta> structured payload (citations, confidence, freshness). */
  structured?: FinalAnswer | null;
  /** Charts the agent surfaced during this turn. */
  charts?: AssistantChart[];
  /** Terminal error if the run failed for this assistant turn. */
  error?: ErrorEvent | null;
}

interface UseChatReturn {
  phase: Phase;
  messages: ChatMessage[];
  intentConfig: IntentConfig | null;
  activeIntent: IntentType | null;
  showWorkspace: boolean;
  runMeta: RunMeta;
  send: (query: string) => void;
  followUp: (query: string) => void;
  /** Abort the in-flight stream. No-op when phase === "done"/"idle". */
  stop: () => void;
  /** Re-run the most recent user query. Useful after a retriable error. */
  retry: () => void;
  reset: () => void;
  /** Load a past conversation by session_id (replay its turns) and resume it. */
  loadConversation: (sessionId: string) => Promise<void>;
}

const EMPTY_META: RunMeta = {
  agent_run_id: null,
  session_id: null,
  agent_name: null,
  cost_usd: null,
  input_tokens: null,
  output_tokens: null,
  latency_ms: null,
};

/**
 * useChat — drives a real agentic chat conversation against
 * ``POST /api/v1/chat/run``.
 *
 * Tracks the full structured event stream (tool args + errors + freshness +
 * agent thoughts + structured final answer) so the UI can render a
 * Claude-grade tool timeline, citation popovers, freshness chips, and a
 * retry-on-error path.
 *
 *   * ``send()`` opens a fresh SSE stream and starts a new ADK session.
 *   * ``followUp()`` re-opens a stream against the SAME session_id so the
 *     agent retains context.
 *   * ``stop()`` aborts the in-flight stream (mapped to the "Stop" header
 *     button).
 *   * ``retry()`` re-runs the most recent user query (after retriable error).
 *   * ``intentConfig`` is *synthesized* from streaming events — only the
 *     ``contextTag`` and ``tabs`` are seeded from intent classification.
 *
 *   * Aborts in flight on unmount or when ``send`` is called again.
 */
export function useChat(): UseChatReturn {
  const queryClient = useQueryClient();
  const refreshConversationList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: conversationKeys.list });
  }, [queryClient]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeIntent, setActiveIntent] = useState<IntentType | null>(null);
  const [intentConfig, setIntentConfig] = useState<IntentConfig | null>(null);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [runMeta, setRunMeta] = useState<RunMeta>(EMPTY_META);
  const sessionIdRef = useRef<string | null>(null);
  const streamRef = useRef<ChatStreamHandle | null>(null);
  const lastQueryRef = useRef<string | null>(null);
  // call_id → index into the assistant message's toolCalls array, so we can
  // update the matching ToolCall when its tool_result arrives.
  const toolCallIndexRef = useRef<Map<string, number>>(new Map());
  // call_id → freshness payload — buffered when data_freshness arrives before
  // we've finished writing the tool_result row (rare; SSE event order is
  // tool_result then data_freshness, but we belt-and-suspenders).
  const freshnessBufferRef = useRef<
    Map<string, { source: string; as_of: string | null }>
  >(new Map());

  // Abort any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      streamRef.current?.abort();
    };
  }, []);

  const cancelInflight = useCallback(() => {
    streamRef.current?.abort();
    streamRef.current = null;
    toolCallIndexRef.current.clear();
    freshnessBufferRef.current.clear();
  }, []);

  /**
   * Internal: open an SSE stream and wire its events into chat state.
   * Used by both ``send`` (new conversation) and ``followUp`` (same session).
   */
  const startStream = useCallback(
    (query: string, isFollowUp: boolean) => {
      cancelInflight();
      lastQueryRef.current = query;

      // Classify intent — used only to pick the workspace tabs + contextTag.
      // The answer comes from the backend, not from INTENT_CONFIGS.
      const intent = routeIntent(query);
      const intentBase = INTENT_CONFIGS[intent];
      setActiveIntent(intent);

      // Title preservation: on a follow-up keep the ORIGINAL chat title
      // (typing "ok" should NOT rename the chat to "ok"). Only the first
      // user turn — i.e. ``isFollowUp === false`` — sets the title from
      // the query. Tabs / contextTag stay in sync with the latest intent
      // so the workspace can still flip layouts if the user pivots
      // ("compare X and Y" → compare tabs).
      setIntentConfig((prev) =>
        isFollowUp && prev
          ? { ...prev, contextTag: intentBase.contextTag, tabs: intentBase.tabs }
          : {
              title: deriveTitle(query),
              statusMsg: "Live · running 0 tools",
              tools: [],
              answer: "",
              contextTag: intentBase.contextTag,
              tabs: intentBase.tabs,
            },
      );
      setRunMeta(EMPTY_META);

      // Seed the message list with the user message + an empty assistant turn.
      if (isFollowUp) {
        setMessages((prev) => [
          ...prev,
          { role: "user", text: query },
          newAssistantStub(),
        ]);
      } else {
        setMessages([{ role: "user", text: query }, newAssistantStub()]);
        setShowWorkspace(false);
      }
      setPhase("thinking");

      // Reveal workspace once the stream actually starts producing.
      const workspaceReveal = setTimeout(() => setShowWorkspace(true), 300);

      streamRef.current = runChatStream(
        {
          message: query,
          session_id: sessionIdRef.current,
        },
        {
          onMeta: (event) => {
            sessionIdRef.current = event.session_id;
            setRunMeta((m) => ({
              ...m,
              agent_run_id: event.agent_run_id,
              session_id: event.session_id,
              agent_name: event.agent_name,
            }));
            // The agent_runs row now exists → the conversation list (sidebar /
            // dashboard / account) should pick it up without a page refresh.
            refreshConversationList();
          },

          onAgentThought: (event) => {
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => ({
                ...msg,
                thoughts: [
                  ...(msg.thoughts ?? []),
                  { text: event.text, kind: event.kind },
                ],
              })),
            );
          },

          onToolCall: (event) => {
            setPhase("tools");
            const initial: ToolCallState = {
              call_id: event.call_id,
              tool: event.tool,
              args: event.args ?? {},
              status: "running",
              result_summary: null,
              error: null,
              error_code: null,
              next_action: null,
              latency_ms: null,
              freshness: null,
              retry_attempt: 0,
            };
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => {
                const tools = [...(msg.toolCalls ?? []), initial];
                toolCallIndexRef.current.set(event.call_id, tools.length - 1);
                return {
                  ...msg,
                  isThinking: false,
                  toolCalls: tools,
                };
              }),
            );
          },

          onToolResult: (event) => {
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => {
                const idx = toolCallIndexRef.current.get(event.call_id);
                if (idx === undefined || !msg.toolCalls) return msg;
                const tools = msg.toolCalls.slice();
                const buffered = freshnessBufferRef.current.get(event.call_id);
                if (buffered) freshnessBufferRef.current.delete(event.call_id);
                tools[idx] = {
                  ...tools[idx],
                  status: event.ok ? "done" : "error",
                  result_summary: event.result_summary ?? null,
                  error: event.error ?? null,
                  error_code: event.error_code ?? null,
                  next_action: event.next_action ?? null,
                  latency_ms: event.latency_ms,
                  freshness: buffered ?? tools[idx].freshness,
                };
                return { ...msg, toolCalls: tools };
              }),
            );
          },

          onChart: (event: ChartEvent) => {
            // Append (or replace by chart_id) on the latest assistant turn.
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => {
                const existing = msg.charts ?? [];
                const idx = existing.findIndex(
                  (c) => c.chart_id === event.chart_id,
                );
                const next = existing.slice();
                // Drop the discriminant `type` — assistant stores raw shape.
                const { type: _t, ...payload } = event;
                if (idx >= 0) next[idx] = payload;
                else next.push(payload);
                return { ...msg, charts: next };
              }),
            );
          },

          onDataFreshness: (event: DataFreshnessEvent) => {
            // Attach to the matching tool card if it's already been written;
            // otherwise buffer until tool_result lands.
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => {
                const idx = toolCallIndexRef.current.get(event.call_id);
                if (idx === undefined || !msg.toolCalls) {
                  freshnessBufferRef.current.set(event.call_id, {
                    source: event.source,
                    as_of: event.as_of,
                  });
                  return msg;
                }
                const tools = msg.toolCalls.slice();
                tools[idx] = {
                  ...tools[idx],
                  freshness: { source: event.source, as_of: event.as_of },
                };
                return { ...msg, toolCalls: tools };
              }),
            );
          },

          onToolRetry: (event) => {
            // The backend's HTTP-layer retries are silent today; this branch
            // fires only when a future runner-level retry is wired. We bump
            // the retry_attempt counter so the UI can render ↻ on the card.
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => {
                const idx = toolCallIndexRef.current.get(event.call_id);
                if (idx === undefined || !msg.toolCalls) return msg;
                const tools = msg.toolCalls.slice();
                tools[idx] = {
                  ...tools[idx],
                  retry_attempt: Math.max(
                    tools[idx].retry_attempt,
                    event.attempt,
                  ),
                  status: "running",
                };
                return { ...msg, toolCalls: tools };
              }),
            );
          },

          onToken: (event) => {
            setPhase((p) =>
              p === "thinking" || p === "tools" ? "answering" : p,
            );
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => ({
                ...msg,
                isThinking: false,
                showAnswer: true,
                streamedText: (msg.streamedText ?? "") + event.text,
              })),
            );
          },

          onFinal: (event) => {
            setPhase("done");
            refreshConversationList(); // refresh preview / last-activity
            setRunMeta((m) => ({
              ...m,
              cost_usd: event.cost_usd,
              input_tokens: event.input_tokens,
              output_tokens: event.output_tokens,
              latency_ms: event.latency_ms,
            }));
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => {
                // Client-side fallback FinalAnswer (T3.1): if the backend
                // didn't provide a structured payload (Gemini Flash sometimes
                // omits the <answer_meta> tail), synthesize a minimal one
                // from the tool_call evidence the user already saw. The
                // Report tab + sources chips still render — empty would be
                // a visibly degraded experience. We never invent KPIs or
                // section bodies; only citations + confidence + freshness,
                // which are observed facts.
                const structured =
                  event.structured ??
                  synthesizeFallbackAnswer(
                    event.answer,
                    msg.toolCalls ?? [],
                  );
                return {
                  ...msg,
                  isThinking: false,
                  showAnswer: true,
                  text: event.answer,
                  streamedText: event.answer,
                  structured,
                };
              }),
            );
          },

          onError: (event) => {
            setPhase("done");
            refreshConversationList();
            setMessages((prev) =>
              updateLastAssistant(prev, (msg) => ({
                ...msg,
                isThinking: false,
                showAnswer: true,
                error: event,
              })),
            );
          },
        },
      );

      streamRef.current.done.finally(() => clearTimeout(workspaceReveal));
    },
    [cancelInflight, refreshConversationList],
  );

  const send = useCallback(
    (query: string) => {
      sessionIdRef.current = null;
      startStream(query, false);
    },
    [startStream],
  );

  const followUp = useCallback(
    (query: string) => {
      startStream(query, true);
    },
    [startStream],
  );

  const stop = useCallback(() => {
    if (!streamRef.current) return;
    streamRef.current.abort();
    streamRef.current = null;
    setPhase("done");
    setMessages((prev) =>
      updateLastAssistant(prev, (msg) => ({
        ...msg,
        isThinking: false,
        showAnswer: true,
        error: msg.error ?? {
          type: "error",
          code: "user_aborted",
          message: "Stopped by user.",
          retriable: true,
          agent_run_id: null,
        },
      })),
    );
  }, []);

  const retry = useCallback(() => {
    const q = lastQueryRef.current;
    if (!q) return;
    // Pop the failed assistant message so retry overwrites it cleanly;
    // also pop the duplicate user message we're about to re-add.
    setMessages((prev) => {
      const next = prev.slice();
      while (next.length && next[next.length - 1].role !== "user") next.pop();
      if (next.length) next.pop();
      return next;
    });
    startStream(q, false);
  }, [startStream]);

  const reset = useCallback(() => {
    cancelInflight();
    sessionIdRef.current = null;
    lastQueryRef.current = null;
    setPhase("idle");
    setMessages([]);
    setActiveIntent(null);
    setIntentConfig(null);
    setShowWorkspace(false);
    setRunMeta(EMPTY_META);
  }, [cancelInflight]);

  /**
   * Replay a past conversation: fetch its turns, rebuild the message list, and
   * point `session_id` at it so the next message continues the same session.
   */
  const loadConversation = useCallback(
    async (sessionId: string) => {
      cancelInflight();
      const detail = await conversationsApi.get(sessionId);

      const msgs: ChatMessage[] = [];
      for (const t of detail.turns) {
        msgs.push({ role: "user", text: t.user_input });
        msgs.push({
          ...newAssistantStub(),
          isThinking: false,
          showAnswer: true,
          text: t.final_answer ?? "",
          streamedText: t.final_answer ?? "",
          toolCalls: (t.tool_trace ?? []).map(traceToToolCall),
          error:
            t.status === "failed"
              ? {
                  type: "error",
                  code: "failed",
                  message: "This run did not complete.",
                  retriable: false,
                  agent_run_id: t.agent_run_id,
                }
              : null,
        });
      }

      const firstQuery = detail.turns[0]?.user_input ?? "Conversation";
      const intent = routeIntent(firstQuery);
      const intentBase = INTENT_CONFIGS[intent];

      sessionIdRef.current = sessionId;
      lastQueryRef.current = detail.turns[detail.turns.length - 1]?.user_input ?? null;
      setMessages(msgs);
      setActiveIntent(intent);
      setIntentConfig({
        title: deriveTitle(firstQuery),
        statusMsg: "Resumed conversation",
        tools: [],
        answer: "",
        contextTag: intentBase.contextTag,
        tabs: intentBase.tabs,
      });
      setRunMeta({ ...EMPTY_META, session_id: sessionId });
      setShowWorkspace(true);
      setPhase("done");
    },
    [cancelInflight],
  );

  return {
    phase,
    messages,
    intentConfig,
    activeIntent,
    showWorkspace,
    runMeta,
    send,
    followUp,
    stop,
    retry,
    reset,
    loadConversation,
  };
}

/** Map a stored tool_trace entry to a (completed) ToolCallState for replay. */
function traceToToolCall(entry: Record<string, unknown>, i: number): ToolCallState {
  const tool = typeof entry.tool === "string" ? entry.tool : "tool";
  const callId = typeof entry.call_id === "string" ? entry.call_id : `${tool}-${i}`;
  const args = (entry.args && typeof entry.args === "object" ? entry.args : {}) as Record<string, unknown>;
  const latency = typeof entry.latency_ms === "number" ? entry.latency_ms : null;
  return {
    call_id: callId,
    tool,
    args,
    status: "done",
    result_summary: null,
    error: null,
    error_code: null,
    next_action: null,
    latency_ms: latency,
    freshness: null,
    retry_attempt: 0,
  };
}

// ── Citation re-export so ChatLayout doesn't need to import the wire types ─
export type { Citation };

// ── helpers ───────────────────────────────────────────────────────────────

function newAssistantStub(): ChatMessage {
  return {
    role: "assistant",
    text: "",
    isThinking: true,
    thoughts: [],
    toolCalls: [],
    charts: [],
    showAnswer: false,
    streamedText: "",
    structured: null,
    error: null,
  };
}

/** Mutate the last assistant message in-place via an updater function. */
function updateLastAssistant(
  messages: ChatMessage[],
  update: (msg: ChatMessage) => ChatMessage,
): ChatMessage[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      const next = messages.slice();
      next[i] = update(messages[i]);
      return next;
    }
  }
  return messages;
}

/** Derive a chat-header title from the first user query.
 * Short truncation; the agent's final answer carries the real meaning. */
function deriveTitle(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + "…";
}

/**
 * Synthesize a minimal FinalAnswer when the backend didn't emit one.
 *
 * Production-grade rules:
 *  - Only use OBSERVED facts (tool calls + their freshness, success/failure).
 *    Never invent KPIs, never fabricate section bodies, never quote numbers
 *    that didn't appear in a tool result.
 *  - Returns `null` when there's nothing useful to synthesize (no answer
 *    text AND no tool calls). The Report tab falls back to prose-only,
 *    same as before.
 *  - Idempotent + cheap (no async, no setState).
 */
function synthesizeFallbackAnswer(
  answer: string,
  toolCalls: ToolCallState[],
): FinalAnswer | null {
  if (!answer && toolCalls.length === 0) return null;

  const succeeded = toolCalls.filter((t) => t.status === "done");
  const failed = toolCalls.filter((t) => t.status === "error");

  // Citations: one per successful tool. The label is just the tool name
  // (humanised) plus its freshness; users hover the Sources chip to see it.
  const citations: Citation[] = succeeded.map((t) => {
    const asOf = t.freshness?.as_of ?? null;
    const suffix = asOf ? ` · as of ${asOf}` : "";
    return {
      label: `${prettifyToolName(t.tool)}${suffix}`,
      url: null,
      source_kind: toolSourceKind(t.tool),
      as_of: asOf,
      tool_call_id: t.call_id,
    };
  });

  // Confidence heuristic:
  //  • all tools succeeded   → "high"
  //  • some failed           → "medium"
  //  • nothing succeeded     → "low"
  let confidence: FinalAnswer["confidence"];
  if (succeeded.length === 0) confidence = "low";
  else if (failed.length === 0) confidence = "high";
  else confidence = "medium";

  // data_freshness: prefer the LATEST as_of across tools. Strings sort
  // correctly for ISO dates; "live" comes after ISO dates lexically which
  // matches its semantic ("now ≥ any past date"). null/undefined skipped.
  const freshness = succeeded
    .map((t) => t.freshness?.as_of)
    .filter((x): x is string => Boolean(x))
    .sort()
    .pop();

  return {
    text: answer,
    citations,
    confidence,
    data_freshness: freshness ?? null,
    // Deliberately empty — we don't fabricate KPIs or sections client-side.
    // Real values come from the backend's <answer_meta> block when the LLM
    // cooperates; if it doesn't, the Report tab still has chips + Sources.
    kpis: [],
    sections: [],
  };
}

function prettifyToolName(tool: string): string {
  return tool.replace(/_/g, " ");
}

function toolSourceKind(tool: string): Citation["source_kind"] {
  if (tool.startsWith("stock_filings")) return "filing";
  if (tool === "web_search") return "web";
  if (tool.startsWith("bmc_")) return "bmc";
  return "tool";
}
