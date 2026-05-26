/**
 * SSE-aware client for the agent chat endpoint.
 *
 * We DON'T use the browser's ``EventSource`` API because it can't POST and
 * can't send custom headers (e.g. our X-Dev-Firm / future Authorization).
 * Standard workaround: ``fetch`` + ``ReadableStream`` + a minimal SSE parser.
 * This is what the ADK docs recommend and what most production agent UIs do.
 *
 * Public API: ``runChatStream(request, handlers)`` returns a Promise that
 * resolves when the stream ends and an abort function the caller can use
 * to cancel mid-stream (e.g. user clicks "Stop").
 */

import { config } from "@/lib/config";

// ── Wire types — must match src/schemas/chat.py on the backend ────────────

export interface MetaEvent {
  type: "meta";
  agent_run_id: string;
  session_id: string;
  agent_name: string;
}

export interface ToolCallEvent {
  type: "tool_call";
  tool: string;
  args: Record<string, unknown>;
  call_id: string;
}

/**
 * One of the structured next-action verbs the backend tools return on failure
 * (see ``prism-analyst-services/src/integrations/tools/_errors.py``). The UI
 * uses it to render the right next-step hint chip / icon on the tool card.
 */
export type ToolNextAction =
  | "ask_user_to_retry_later"
  | "try_alternate_tool"
  | "ask_user_to_clarify"
  | "give_up_gracefully";

export interface ToolResultEvent {
  type: "tool_result";
  call_id: string;
  tool: string;
  ok: boolean;
  result_summary: string | null;
  error: string | null;
  /** snake_case machine token, e.g. "stock_chat_unreachable" — back-compat: may be missing on legacy tool responses. */
  error_code: string | null;
  /** What the agent (or user) should do about this failure. May be missing. */
  next_action: ToolNextAction | null;
  latency_ms: number;
}

export interface TokenEvent {
  type: "token";
  text: string;
}

/**
 * The agent surfaced an inspectable piece of reasoning. The UI renders it
 * as a collapsible "Thinking…" card above tool calls + the eventual answer.
 */
export interface AgentThoughtEvent {
  type: "agent_thought";
  text: string;
  kind: "plan" | "reflect" | "decision";
}

/**
 * The runner re-invoked a tool after a transient failure. Emitted between
 * the failing ``tool_result`` and the next ``tool_call`` for the same
 * ``call_id``. Today the backend's HTTP-layer retries are silent (no event);
 * this schema is here for the future when retries become user-visible.
 */
export interface ToolRetryEvent {
  type: "tool_retry";
  call_id: string;
  tool: string;
  attempt: number; // 1-indexed: 2 means "second try"
  reason: string;
}

/**
 * Freshness signal for a tool result. The UI shows an "as of …" chip on
 * the matching tool card AND the eventual answer block.
 */
export interface DataFreshnessEvent {
  type: "data_freshness";
  call_id: string;
  source: string; // e.g. "filings catalog"
  as_of: string | null; // ISO date / "live" / null
}

/** A single citation backing a fact in the final answer. */
export interface Citation {
  label: string;
  url: string | null;
  source_kind: "filing" | "web" | "bmc" | "tool";
  as_of: string | null;
  tool_call_id: string | null;
}

/**
 * Structured final-answer payload. Present on ``FinalEvent.structured`` when
 * the agent emitted the ``<answer_meta>{...}</answer_meta>`` block at the
 * end of its response. The UI prefers this rendering path over raw prose.
 */
export interface FinalAnswer {
  text: string;
  citations: Citation[];
  confidence: "high" | "medium" | "low";
  data_freshness: string | null;
}

export interface FinalEvent {
  type: "final";
  answer: string;
  /** Present when the agent emitted the structured tail block. May be null. */
  structured: FinalAnswer | null;
  agent_run_id: string;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
}

export interface ErrorEvent {
  type: "error";
  code: string;
  message: string;
  retriable: boolean;
  agent_run_id: string | null;
}

export type ChatEvent =
  | MetaEvent
  | ToolCallEvent
  | ToolResultEvent
  | TokenEvent
  | AgentThoughtEvent
  | ToolRetryEvent
  | DataFreshnessEvent
  | FinalEvent
  | ErrorEvent;

export interface ChatRunRequest {
  message: string;
  session_id?: string | null;
  agent?: "company_intel";
}

export interface ChatStreamHandlers {
  onMeta?: (event: MetaEvent) => void;
  onToolCall?: (event: ToolCallEvent) => void;
  onToolResult?: (event: ToolResultEvent) => void;
  onToken?: (event: TokenEvent) => void;
  onAgentThought?: (event: AgentThoughtEvent) => void;
  onToolRetry?: (event: ToolRetryEvent) => void;
  onDataFreshness?: (event: DataFreshnessEvent) => void;
  onFinal?: (event: FinalEvent) => void;
  onError?: (event: ErrorEvent) => void;
  /** Catch-all — useful for logging or future event types. */
  onEvent?: (event: ChatEvent) => void;
}

export interface ChatStreamHandle {
  /** Resolves with the terminal event (``final`` or ``error``). */
  done: Promise<FinalEvent | ErrorEvent | null>;
  /** Cancel the stream and the underlying HTTP request. */
  abort: () => void;
}

/**
 * Open an SSE chat stream and dispatch events to the provided handlers.
 *
 * The returned ``done`` promise resolves with the terminal event so callers
 * can ``await`` completion if they want sequential UI flow.
 */
export function runChatStream(
  request: ChatRunRequest,
  handlers: ChatStreamHandlers = {},
): ChatStreamHandle {
  const controller = new AbortController();
  const url = new URL("/api/v1/chat/run", config.apiUrl).toString();

  const done = (async (): Promise<FinalEvent | ErrorEvent | null> => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-Dev-Firm": "QUANTSOFT",
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      const errEvent: ErrorEvent = {
        type: "error",
        code: `http_${response.status}`,
        message: text || `HTTP ${response.status}`,
        retriable: response.status >= 500,
        agent_run_id: null,
      };
      handlers.onError?.(errEvent);
      handlers.onEvent?.(errEvent);
      return errEvent;
    }

    let terminal: FinalEvent | ErrorEvent | null = null;
    for await (const event of parseEventStream(response.body)) {
      handlers.onEvent?.(event);
      switch (event.type) {
        case "meta":
          handlers.onMeta?.(event);
          break;
        case "tool_call":
          handlers.onToolCall?.(event);
          break;
        case "tool_result":
          handlers.onToolResult?.(event);
          break;
        case "token":
          handlers.onToken?.(event);
          break;
        case "agent_thought":
          handlers.onAgentThought?.(event);
          break;
        case "tool_retry":
          handlers.onToolRetry?.(event);
          break;
        case "data_freshness":
          handlers.onDataFreshness?.(event);
          break;
        case "final":
          handlers.onFinal?.(event);
          terminal = event;
          break;
        case "error":
          handlers.onError?.(event);
          terminal = event;
          break;
      }
    }
    return terminal;
  })();

  return {
    done,
    abort: () => controller.abort(),
  };
}

// ── SSE parser ────────────────────────────────────────────────────────────
// Minimal but correct SSE per the WHATWG spec — we only need ``data:`` lines
// since the backend duplicates ``type`` inside the JSON payload.

async function* parseEventStream(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      // Normalize line endings: SSE spec accepts \r\n, \n, or \r as line
      // terminators (and \r\n\r\n / \n\n / \r\r as message separators).
      // ``sse-starlette`` (our backend) emits \r\n, so without this every
      // event was getting concatenated and JSON.parse choked.
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");

      let separatorIdx: number;
      while ((separatorIdx = buffer.indexOf("\n\n")) >= 0) {
        const rawMessage = buffer.slice(0, separatorIdx);
        buffer = buffer.slice(separatorIdx + 2);
        const event = parseOneMessage(rawMessage);
        if (event) yield event;
      }
    }
    // Flush trailing partial — terminal events without a final separator.
    if (buffer.trim()) {
      const event = parseOneMessage(buffer);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseOneMessage(raw: string): ChatEvent | null {
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
    // We ignore ``event:`` and ``id:`` fields — ``type`` is duplicated in JSON.
  }
  if (dataLines.length === 0) return null;
  const payload = dataLines.join("\n");
  try {
    return JSON.parse(payload) as ChatEvent;
  } catch (err) {
    // Server contract violation — log but don't crash the stream.
    if (typeof console !== "undefined") {
      console.warn("[chat] failed to parse SSE payload:", payload, err);
    }
    return null;
  }
}
