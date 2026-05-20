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

export interface ToolResultEvent {
  type: "tool_result";
  call_id: string;
  tool: string;
  ok: boolean;
  result_summary: string | null;
  error: string | null;
  latency_ms: number;
}

export interface TokenEvent {
  type: "token";
  text: string;
}

export interface FinalEvent {
  type: "final";
  answer: string;
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
