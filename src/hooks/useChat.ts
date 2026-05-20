"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  runChatStream,
  type ChatStreamHandle,
  type ToolCallEvent,
} from "@/lib/api/chat";
import {
  INTENT_CONFIGS,
  routeIntent,
  type IntentConfig,
  type IntentType,
  type ToolCall,
} from "@/lib/mockData";

/* ── Chat phase machine — preserved from the mock implementation so
 * ChatLayout (which switches on these strings) doesn't have to change. */
type Phase = "idle" | "thinking" | "tools" | "answering" | "done";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCall[];
  visibleToolCount?: number;
  showAnswer?: boolean;
  isThinking?: boolean;
  streamedText?: string;
}

interface UseChatReturn {
  phase: Phase;
  messages: ChatMessage[];
  intentConfig: IntentConfig | null;
  activeIntent: IntentType | null;
  showWorkspace: boolean;
  send: (query: string) => void;
  followUp: (query: string) => void;
  reset: () => void;
}

/**
 * useChat — drives a real agentic chat conversation against
 * ``POST /api/v1/chat/run``.
 *
 * The public interface matches the mock implementation that preceded it,
 * so ``ChatLayout`` is unchanged. Internally:
 *   * ``send()`` opens a fresh SSE stream and starts a new ADK session.
 *   * ``followUp()`` re-opens a stream against the SAME session_id so the
 *     agent retains context.
 *   * ``intentConfig`` is *synthesized* on the fly from streaming events
 *     instead of read from the static INTENT_CONFIGS map — only the
 *     ``contextTag`` and ``tabs`` are still seeded from intent classification
 *     so the workspace pane has sensible tabs.
 *   * Aborts in flight on unmount or when ``send`` is called again.
 */
export function useChat(): UseChatReturn {
  const [phase, setPhase] = useState<Phase>("idle");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeIntent, setActiveIntent] = useState<IntentType | null>(null);
  const [intentConfig, setIntentConfig] = useState<IntentConfig | null>(null);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const streamRef = useRef<ChatStreamHandle | null>(null);
  // call_id → index into the assistant message's toolCalls array, so we can
  // update the matching ToolCall when its tool_result arrives.
  const toolCallIndexRef = useRef<Map<string, number>>(new Map());

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
  }, []);

  /**
   * Internal: open an SSE stream and wire its events into chat state.
   * Used by both ``send`` (new conversation) and ``followUp`` (same session).
   */
  const startStream = useCallback(
    (query: string, isFollowUp: boolean) => {
      cancelInflight();

      // Classify intent — used only to pick the workspace tabs + contextTag.
      // The answer comes from the backend, not from INTENT_CONFIGS.
      const intent = routeIntent(query);
      const intentBase = INTENT_CONFIGS[intent];
      setActiveIntent(intent);

      // Build a synthetic IntentConfig that will grow as tool_call events
      // arrive. We seed empty tools and an empty answer — they get filled
      // by the SSE handlers.
      const liveConfig: IntentConfig = {
        title: deriveTitle(query),
        statusMsg: "Live · running 0 tools",
        tools: [],
        answer: "",
        contextTag: intentBase.contextTag,
        tabs: intentBase.tabs,
      };
      setIntentConfig(liveConfig);

      // Seed the message list with the user message + a "thinking" assistant.
      if (isFollowUp) {
        setMessages((prev) => [
          ...prev,
          { role: "user", text: query },
          {
            role: "assistant",
            text: "",
            isThinking: true,
            toolCalls: [],
            visibleToolCount: 0,
            showAnswer: false,
            streamedText: "",
          },
        ]);
      } else {
        setMessages([
          { role: "user", text: query },
          {
            role: "assistant",
            text: "",
            isThinking: true,
            toolCalls: [],
            visibleToolCount: 0,
            showAnswer: false,
            streamedText: "",
          },
        ]);
        setShowWorkspace(false);
      }
      setPhase("thinking");

      // Reveal workspace once the stream actually starts producing.
      // We delay slightly so the "thinking" state is visible — matches the
      // prior UX without depending on setTimeout for correctness.
      const workspaceReveal = setTimeout(() => setShowWorkspace(true), 300);

      streamRef.current = runChatStream(
        {
          message: query,
          session_id: sessionIdRef.current,
        },
        {
          onMeta: (event) => {
            sessionIdRef.current = event.session_id;
          },
          onToolCall: (event) => {
            setPhase("tools");
            const toolCall: ToolCall = {
              name: event.tool,
              status: formatToolArgs(event),
              time: "running",
              running: true,
            };
            setMessages((prev) => updateLastAssistant(prev, (msg) => {
              const tools = [...(msg.toolCalls ?? []), toolCall];
              toolCallIndexRef.current.set(event.call_id, tools.length - 1);
              return {
                ...msg,
                isThinking: false,
                toolCalls: tools,
                visibleToolCount: tools.length,
              };
            }));
          },
          onToolResult: (event) => {
            setMessages((prev) => updateLastAssistant(prev, (msg) => {
              const idx = toolCallIndexRef.current.get(event.call_id);
              if (idx === undefined || !msg.toolCalls) return msg;
              const tools = msg.toolCalls.slice();
              tools[idx] = {
                ...tools[idx],
                status: event.ok
                  ? (event.result_summary ?? "ok")
                  : `error: ${event.error ?? "unknown"}`,
                time: `${event.latency_ms}ms`,
                running: false,
              };
              return { ...msg, toolCalls: tools };
            }));
          },
          onToken: (event) => {
            setPhase((p) => (p === "thinking" ? "answering" : p === "tools" ? "answering" : p));
            setMessages((prev) => updateLastAssistant(prev, (msg) => ({
              ...msg,
              isThinking: false,
              showAnswer: true,
              streamedText: (msg.streamedText ?? "") + event.text,
            })));
          },
          onFinal: (event) => {
            setPhase("done");
            setMessages((prev) => updateLastAssistant(prev, (msg) => ({
              ...msg,
              isThinking: false,
              showAnswer: true,
              text: event.answer,
              streamedText: event.answer,
            })));
          },
          onError: (event) => {
            setPhase("done");
            const friendly =
              event.code === "timeout"
                ? "The agent took too long to respond. Try a shorter question."
                : `Something went wrong: ${event.message}`;
            setMessages((prev) => updateLastAssistant(prev, (msg) => ({
              ...msg,
              isThinking: false,
              showAnswer: true,
              text: friendly,
              streamedText: friendly,
            })));
          },
        },
      );

      // Cleanup the reveal timer if the stream finishes before it fires.
      streamRef.current.done.finally(() => clearTimeout(workspaceReveal));
    },
    [cancelInflight],
  );

  const send = useCallback(
    (query: string) => {
      // Fresh send = fresh session. Drop any prior session_id.
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

  const reset = useCallback(() => {
    cancelInflight();
    sessionIdRef.current = null;
    setPhase("idle");
    setMessages([]);
    setActiveIntent(null);
    setIntentConfig(null);
    setShowWorkspace(false);
  }, [cancelInflight]);

  return { phase, messages, intentConfig, activeIntent, showWorkspace, send, followUp, reset };
}

// ── helpers ───────────────────────────────────────────────────────────────

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

/** Squeeze tool args into a short status line for the tool-call card. */
function formatToolArgs(event: ToolCallEvent): string {
  const entries = Object.entries(event.args);
  if (entries.length === 0) return "running…";
  return entries
    .slice(0, 2)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(", ");
}

/** Derive a chat-header title from the first user query.
 * Short truncation; the agent's final answer carries the real meaning. */
function deriveTitle(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 57) + "…";
}
