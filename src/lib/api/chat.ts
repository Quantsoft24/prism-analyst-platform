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
import { authHeaders } from "./client";
import { isMockModeEnabled, runMockChatStream, setMockMode } from "./chat.mock";

/** Re-exports — UI components import these from the same module they import
 *  ``runChatStream`` from. Keeps the mock-mode plumbing colocated. */
export { isMockModeEnabled, setMockMode };

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

/** One data point on a chart — labelled x (period / category) and numeric y. */
export interface ChartPoint {
  x: string;
  y: number;
}

/**
 * A chart that a tool surfaced — e.g. `stock_technicals` returning a 5-quarter
 * ARPU trend, or `compute_growth` over a series. The UI's Workspace → Charts
 * tab renders one card per ChartEvent. Backend doesn't emit these today; the
 * wire shape is here so when a chart-producing tool ships, the pipeline is
 * already wired end-to-end (mock mode validates the path).
 */
export interface ChartEvent {
  type: "chart";
  /** Call that produced the chart; null when synthesised from the final answer. */
  call_id: string | null;
  /** Stable id so the UI can dedup if a chart is emitted twice. */
  chart_id: string;
  /** e.g. "Jio segment ARPU · trailing 5 quarters" */
  title: string;
  /** Display unit prefix/suffix — "₹" / "%" / "x" / "". */
  unit: string;
  /** Latest value, formatted ("202", "12.4", "47,628"). */
  current_value: string;
  /** Optional delta line ("+3.1% q/q", "−0.42% YTD") + its sign. */
  current_delta: string | null;
  delta_kind: "pos" | "neg" | "neutral" | null;
  /** Series of {x_label, y_value}. UI infers chart range from the points. */
  points: ChartPoint[];
  /** Visualisation hint — frontend may fall back to a default. */
  kind: "line" | "area" | "bar";
}

/** A single citation backing a fact in the final answer. */
export interface Citation {
  label: string;
  url: string | null;
  source_kind: "filing" | "web" | "bmc" | "tool";
  as_of: string | null;
  tool_call_id: string | null;
  /** Page in the source PDF (filings) — deep-links to the exact page in the
   *  Report-tab viewer. Populated in Phase 6. */
  page?: number | null;
}

/** A headline KPI surfaced in the workspace Report tab.
 *
 * Renders as one card in the KPI grid (mockup pattern: Revenue · ₹2.74L cr ·
 * cite 1 · pg 4). Backend tools don't emit these today; the schema lives
 * here so when a tool ships that extracts headline numbers from a filing
 * (or the agent fills it from a structured answer block), the Report tab
 * renders without further frontend changes. Mock mode validates the pipe. */
export interface FinalKpi {
  label: string;
  value: string;
  unit: string | null;
  cite_label: string | null;
}

/** A named section in the final research note (Executive summary, Anomaly
 * flags, etc.). Body is markdown so we can keep citations / bold / lists
 * intact. ``kind`` lets the UI accent anomaly callouts in warn-yellow. */
export interface FinalSection {
  title: string;
  body: string;
  kind: "summary" | "anomaly" | "note";
}

/** A curated "explore further" deep-dive action surfaced under an answer as a
 *  compact chip that deep-links into a dedicated tool interface. Synthesized
 *  server-side (rule-based, no LLM) — see backend ``src/services/deep_dive.py``.
 *  The UI maps ``action`` → a route via ``ACTION_ROUTES`` (see DeepDiveActions);
 *  unknown actions are dropped silently so new tools can ship registry-first. */
export interface DeepDiveSuggestion {
  action: "bmc" | "stock_dashboard" | "news" | "regulatory" | "portfolio";
  label: string;
  /** Lightweight deep-link params the target route supports (e.g. ``ticker``,
   *  ``security_id``, ``company``). May be empty. */
  context: Record<string, string | number>;
}

/** Structured numeric result from `financials_query` (prism-financials),
 *  attached deterministically by the backend runner (not LLM-composed) so the
 *  UI renders value-card / trend chart / comparison & ranking tables / statement
 *  faithfully beneath the prose. Fields are operation-specific — all optional;
 *  render by which array is populated (compare can carry `operation:"lookup"`). */
export interface FinalFinancials {
  operation: string;
  answer?: string | null;
  value?: number | null;
  period?: string | null;
  field?: { key?: string; label?: string; unit?: string } | null;
  company?: { security_id?: number; name?: string; symbol?: string } | null;
  series?: { period: string; value: number }[];
  comparison?: { security_id?: number; name?: string; value?: number; period?: string }[];
  ranking?: { rank?: number; name?: string; value?: number; display?: string; security_id?: number }[];
  matches?: Record<string, unknown>[];
  line_items?: { key?: string; label?: string; value?: number; unit?: string; display?: string }[];
  attributes?: Record<string, unknown> | null;
  count?: number | null;
  names?: string[];
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
  /** Headline KPIs the agent extracted — render as the Report tab's KPI
   *  grid. Optional; empty/missing arrays render no grid. */
  kpis: FinalKpi[];
  /** Named sections (Executive summary, Anomaly flags, etc.) that come
   *  AFTER the KPI grid and BEFORE the prose. Optional. */
  sections: FinalSection[];
  /** 2-3 suggested next questions — rendered as clickable chips. Optional. */
  suggestions?: string[];
  /** "Explore further" deep-dive chips → tool interfaces. Optional; capped +
   *  curated server-side. Rendered distinct from the follow-up chips. */
  suggested_actions?: DeepDiveSuggestion[];
  /** Structured numeric result (from financials_query) — value card / chart /
   *  tables rendered under the prose. Optional; absent on non-financials turns. */
  financials?: FinalFinancials | null;
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
  /** The model hit its output-token cap (finish_reason=MAX_TOKENS) → the answer
   *  is cut off and the UI offers "Continue generating". Absent on old payloads. */
  truncated?: boolean;
}

export interface ErrorEvent {
  type: "error";
  code: string;
  message: string;
  retriable: boolean;
  agent_run_id: string | null;
}

/** One selectable answer in a clarification question. `value` is sent back to
 *  the agent when chosen (a security_id for company picks). */
export interface ClarificationOption {
  id: string;
  label: string;
  hint: string | null;
  value: string | number;
}

/** One question in a clarification form. Several can be asked together (one per
 *  ambiguous company in a comparison) and answered in sequence in one card. */
export interface ClarificationQuestion {
  id: string;
  question: string;
  mode: "single_select" | "multi_select" | "open_text";
  options: ClarificationOption[];
  allow_search: boolean;
}

/** Terminal event: the agent needs the user to disambiguate before it can
 *  proceed. The UI renders a form with one OR MORE `questions` (a stepper) +
 *  a securities search box; the combined answer is sent as the next message in
 *  the same session and the agent resumes with it. */
export interface ClarificationEvent {
  type: "clarification";
  agent_run_id: string | null;
  /** The form's questions (one or many). Prefer this over the single fields. */
  questions: ClarificationQuestion[];
  /** Back-compat single-question mirror (= questions[0]). */
  question: string;
  mode: "single_select" | "multi_select" | "open_text";
  options: ClarificationOption[];
  allow_search: boolean;
}

/** One task in the agent's visible checklist. */
export interface PlanStep {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "done";
}

/** The agent's task list (Claude-Code-style). Emitted when the agent declares or
 *  updates its plan; the UI renders the latest `steps` as checkboxes. */
export interface PlanEvent {
  type: "plan";
  steps: PlanStep[];
}

export type ChatEvent =
  | MetaEvent
  | ToolCallEvent
  | ToolResultEvent
  | TokenEvent
  | PlanEvent
  | AgentThoughtEvent
  | ToolRetryEvent
  | DataFreshnessEvent
  | ChartEvent
  | FinalEvent
  | ClarificationEvent
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
  onChart?: (event: ChartEvent) => void;
  onPlan?: (event: PlanEvent) => void;
  onFinal?: (event: FinalEvent) => void;
  onClarification?: (event: ClarificationEvent) => void;
  onError?: (event: ErrorEvent) => void;
  /** Catch-all — useful for logging or future event types. */
  onEvent?: (event: ChatEvent) => void;
}

export interface ChatStreamHandle {
  /** Resolves with the terminal event (``final``, ``clarification``, or ``error``). */
  done: Promise<FinalEvent | ClarificationEvent | ErrorEvent | null>;
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
  // Mock-mode escape hatch (testing UI without burning tokens or needing the
  // backend stack up). Set `localStorage.prism.mockMode = "1"` to enable;
  // remove the flag (or click the chat header's MOCK badge) to disable.
  // Remove this branch + chat.mock.ts before shipping to production.
  if (isMockModeEnabled()) {
    return runMockChatStream(request, handlers);
  }

  const controller = new AbortController();
  const url = new URL("/api/v1/chat/run", config.apiUrl).toString();

  const done = (async (): Promise<FinalEvent | ClarificationEvent | ErrorEvent | null> => {
    // Same auth as apiClient: the Supabase bearer token when signed in (so the
    // backend attributes this agent_run to the user → it shows in history), or
    // the dev-firm header when auth is off.
    const response = await fetch(url, {
      method: "POST",
      headers: { ...(await authHeaders()), Accept: "text/event-stream" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      // FastAPI errors are JSON `{"detail": "..."}` — surface the clean message
      // (e.g. the daily-limit notice) instead of the raw JSON.
      let message = text || `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed.detail === "string") message = parsed.detail;
      } catch {
        // not JSON — keep the raw text
      }
      const errEvent: ErrorEvent = {
        type: "error",
        code: `http_${response.status}`,
        message,
        // 429 = daily limit: not retriable (waiting won't help until tomorrow).
        retriable: response.status >= 500,
        agent_run_id: null,
      };
      handlers.onError?.(errEvent);
      handlers.onEvent?.(errEvent);
      return errEvent;
    }

    let terminal: FinalEvent | ClarificationEvent | ErrorEvent | null = null;
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
        case "chart":
          handlers.onChart?.(event);
          break;
        case "plan":
          handlers.onPlan?.(event);
          break;
        case "final":
          handlers.onFinal?.(event);
          terminal = event;
          break;
        case "clarification":
          handlers.onClarification?.(event);
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
