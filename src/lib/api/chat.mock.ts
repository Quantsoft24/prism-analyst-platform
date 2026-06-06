/**
 * Mock SSE chat stream — same wire shape as the real backend, no API call.
 *
 * Why: lets us iterate on the chat UI (tool cards, freshness chips, citations,
 * Workspace tabs, etc.) without burning Gemini tokens or needing the backend
 * + integrations stack up. Toggled at runtime via ``localStorage.prism.mockMode``
 * (the ChatLayout header's "MOCK" toggle flips it).
 *
 * Scenarios driven by user message content:
 *   • Contains "fail" / "error"          → mid-run tool failure + retry path
 *   • Contains "typo" / "didyou"         → search_companies returns suggestions
 *   • "clarify" / "compare them" /       → agent asks ONE clarifying question
 *     "how did they do" / "which is        and stops (no tools) — the
 *     better" / "analyse the margins"      "ask before you guess" behaviour
 *   • Otherwise                          → comprehensive happy path that
 *                                          exercises every UI surface (thoughts,
 *                                          multiple tools, freshness, structured
 *                                          citations, confidence)
 *
 * The mock honors abort() — calling .abort() drops the in-flight script and
 * fulfills .done with null (matches the real client's contract on user cancel).
 *
 * REMOVE THIS FILE before shipping to production — wire a feature flag if
 * mock mode needs to survive past testing.
 */

import type {
  AgentThoughtEvent,
  ChartEvent,
  ChatEvent,
  ChatRunRequest,
  ChatStreamHandle,
  ChatStreamHandlers,
  DataFreshnessEvent,
  ErrorEvent,
  FinalEvent,
  MetaEvent,
  TokenEvent,
  ToolCallEvent,
  ToolResultEvent,
} from "./chat";

const MOCK_FLAG_KEY = "prism.mockMode";

/** Read-time check — used by runChatStream to decide whether to delegate. */
export function isMockModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MOCK_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMockMode(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(MOCK_FLAG_KEY, "1");
    else window.localStorage.removeItem(MOCK_FLAG_KEY);
  } catch {
    // ignore — private mode, etc.
  }
}

/* ── Scenario picker ─────────────────────────────────────────────────── */

type Scenario = "happy" | "fail" | "typo" | "clarify";

function pickScenario(message: string): Scenario {
  const m = message.toLowerCase();
  if (m.includes("fail") || m.includes("error") || m.includes("crash")) return "fail";
  if (m.includes("typo") || m.includes("didyou") || m.includes("reliac")) return "typo";
  // Ambiguous requests → the agent asks one clarifying question (no tools).
  if (
    m.includes("clarify") ||
    m.includes("compare them") ||
    m.includes("how did they do") ||
    m.includes("which is better") ||
    m.includes("analyse the margins") ||
    m.includes("analyze the margins")
  ) {
    return "clarify";
  }
  return "happy";
}

/* ── Event-stream scripts ────────────────────────────────────────────── */

/** One scripted beat — `delay` ms after the previous beat, then dispatch `event`. */
interface Beat {
  delay: number;
  event: ChatEvent;
}

/** Build a meta event with stable-ish IDs (so refresh doesn't reset the UI). */
function metaEvent(): MetaEvent {
  return {
    type: "meta",
    agent_run_id: `mock-${Math.random().toString(16).slice(2, 10)}`,
    session_id: `mock-sess-${Math.random().toString(16).slice(2, 10)}`,
    agent_name: "company_intel",
  };
}

function thought(text: string, kind: AgentThoughtEvent["kind"] = "decision"): AgentThoughtEvent {
  return { type: "agent_thought", text, kind };
}

function toolCall(call_id: string, tool: string, args: Record<string, unknown>): ToolCallEvent {
  return { type: "tool_call", call_id, tool, args };
}

function toolOk(
  call_id: string,
  tool: string,
  result_summary: string,
  latency_ms = 800,
): ToolResultEvent {
  return {
    type: "tool_result",
    call_id,
    tool,
    ok: true,
    result_summary,
    error: null,
    error_code: null,
    next_action: null,
    latency_ms,
  };
}

function toolErr(
  call_id: string,
  tool: string,
  error: string,
  error_code: string,
  next_action: ToolResultEvent["next_action"],
  latency_ms = 1200,
): ToolResultEvent {
  return {
    type: "tool_result",
    call_id,
    tool,
    ok: false,
    result_summary: null,
    error,
    error_code,
    next_action,
    latency_ms,
  };
}

function freshness(call_id: string, source: string, as_of: string): DataFreshnessEvent {
  return { type: "data_freshness", call_id, source, as_of };
}

function chart(
  partial: Omit<ChartEvent, "type">,
): ChartEvent {
  return { type: "chart", ...partial };
}

function token(text: string): TokenEvent {
  return { type: "token", text };
}

function finalAnswer(): FinalEvent {
  return {
    type: "final",
    answer: HAPPY_FINAL_TEXT,
    structured: {
      text: HAPPY_FINAL_TEXT,
      confidence: "high",
      data_freshness: "Q4 FY24 · 2026-05-26",
      // Headline KPIs render as the Report tab's KPI grid. Mock here =
      // mockup spec — the real backend will populate these once a
      // financial_metrics-reading tool ships. Cite labels mirror the
      // citation indices in the prose ("[1]", "[2]", …).
      kpis: [
        { label: "Revenue", value: "₹2.46L", unit: "cr", cite_label: "cite 1 · pg 4" },
        { label: "EBIT margin", value: "24.6", unit: "%", cite_label: "cite 1 · pg 6" },
        { label: "Deal TCV", value: "₹13.2", unit: "bn", cite_label: "cite 2 · pg 8" },
        { label: "Attrition (LTM)", value: "12.1", unit: "%", cite_label: "cite 1 · pg 11" },
      ],
      // Named research-note sections — Report tab renders these above
      // the prose. Anomaly callouts get the warn-yellow accent.
      sections: [
        {
          title: "Executive summary",
          kind: "summary",
          body:
            "TCS closed FY24 with **₹2.46L cr** revenue [1], up **3.5% YoY** " +
            "in constant currency. EBIT margin held at **24.6%** [1] — best " +
            "in the Indian IT cohort. Q4 TCV of **₹13.2bn** [2] suggests " +
            "deal momentum continues despite cautious near-term guidance.",
        },
        {
          title: "Anomaly flags",
          kind: "anomaly",
          body:
            "⚠ **Attrition floor approached** — 12.1% LTM is the lowest " +
            "in 8 quarters [1]; further compression would pressure wage costs.\n\n" +
            "⚠ **FY27 guidance left blank** — unlike Infosys (3–5% band [2]), " +
            "TCS declined to commit to a top-line range, citing macro uncertainty.",
        },
      ],
      citations: [
        {
          label: "TCS Q4 FY24 Audited Results, p. 12",
          url: null,
          source_kind: "filing",
          as_of: "2024-04-30",
          tool_call_id: "mt2",
        },
        {
          label: "TCS Investor Presentation, slide 8",
          url: null,
          source_kind: "filing",
          as_of: "2024-04-30",
          tool_call_id: "mt2",
        },
        {
          label: "Live market data (NSE intraday)",
          url: "https://www.nseindia.com/get-quotes/equity?symbol=TCS",
          source_kind: "web",
          as_of: "live",
          tool_call_id: "mt3",
        },
      ],
    },
    agent_run_id: "mock-run-fixed",
    cost_usd: 0,
    input_tokens: 1842,
    output_tokens: 312,
    latency_ms: 4500,
  };
}

const HAPPY_FINAL_TEXT = `Tata Consultancy Services (TCS) is India's largest IT services company by revenue and market cap, with **₹2.46L crore consolidated revenue in FY24** [1] and a **24.6% EBIT margin** [1] — the best in the listed Indian IT cohort.

Key takeaways:
- **Growth:** 3.5% YoY in constant currency [1]. Slower than Infosys (4.8% [2]) but with margin discipline intact.
- **Deal momentum:** ₹13.2bn TCV in Q4 — the highest in the cohort [2].
- **Attrition:** 12.1% LTM, the lowest among large peers, signalling stable delivery [1].
- **Current price:** ₹3,975 (NSE intraday) [3], trading at ~28.4x trailing P/E.

The Q4 FY24 result was broadly in line with consensus — no surprises on margins or guidance.`;

/** Comprehensive happy-path script — exercises agent_thought, multiple
 *  tool_calls, freshness events, streamed tokens, structured final. */
function happyPath(): Beat[] {
  return [
    { delay: 50, event: metaEvent() },
    { delay: 200, event: thought("User wants a TCS deep-dive. I'll start with lookup, then pull filings + technicals in parallel.", "plan") },
    // Tool 1 — lookup_company
    { delay: 350, event: toolCall("mt1", "lookup_company", { ticker: "TCS" }) },
    { delay: 600, event: toolOk("mt1", "lookup_company", "found Tata Consultancy Services", 540) },
    // Tool 2 — stock_filings_read
    { delay: 250, event: thought("Found TCS. Now reading the latest Q4 filing for narrative.", "decision") },
    { delay: 100, event: toolCall("mt2", "stock_filings_read", { question: "TCS Q4 FY24 highlights", company: "TCS", max_filings: 3 }) },
    { delay: 1800, event: toolOk("mt2", "stock_filings_read", "answer: TCS delivered Rs 24,604cr revenue in Q4 FY24...", 1740) },
    { delay: 50, event: freshness("mt2", "filings catalog", "2024-04-30") },
    // Tool 3 — stock_technicals
    { delay: 200, event: toolCall("mt3", "stock_technicals", { ticker: "TCS", exchange: "NSE", period: "1y" }) },
    { delay: 900, event: toolOk("mt3", "stock_technicals", "ok · current_price, 52w, ma_50, ma_200, rsi_14", 840) },
    { delay: 50, event: freshness("mt3", "market data", "live") },
    // Tool 4 — compute_margin (NRE arithmetic)
    { delay: 200, event: toolCall("mt4", "compute_margin", { numerator: 60490, denominator: 246060 }) },
    { delay: 400, event: toolOk("mt4", "compute_margin", "= 24.6%", 320) },
    // Three charts surface from the trend data the tools fetched.
    {
      delay: 200,
      event: chart({
        call_id: "mt2",
        chart_id: "tcs_revenue_5q",
        title: "TCS revenue · trailing 5 quarters",
        unit: "₹ cr",
        current_value: "63,973",
        current_delta: "+3.5% YoY",
        delta_kind: "pos",
        kind: "area",
        points: [
          { x: "Q4'25", y: 59700 },
          { x: "Q1'26", y: 60810 },
          { x: "Q2'26", y: 61590 },
          { x: "Q3'26", y: 62800 },
          { x: "Q4'26", y: 63973 },
        ],
      }),
    },
    {
      delay: 100,
      event: chart({
        call_id: "mt2",
        chart_id: "tcs_ebit_margin",
        title: "EBIT margin · 5-quarter band",
        unit: "%",
        current_value: "24.6",
        current_delta: "flat QoQ",
        delta_kind: "neutral",
        kind: "line",
        points: [
          { x: "Q4'25", y: 24.1 },
          { x: "Q1'26", y: 24.3 },
          { x: "Q2'26", y: 24.5 },
          { x: "Q3'26", y: 24.6 },
          { x: "Q4'26", y: 24.6 },
        ],
      }),
    },
    {
      delay: 100,
      event: chart({
        call_id: "mt3",
        chart_id: "tcs_price_1y",
        title: "TCS · 1-year price",
        unit: "₹",
        current_value: "3,975",
        current_delta: "+12.4% 1Y",
        delta_kind: "pos",
        kind: "line",
        points: [
          { x: "May'25", y: 3536 },
          { x: "Jul'25", y: 3680 },
          { x: "Sep'25", y: 3492 },
          { x: "Nov'25", y: 3814 },
          { x: "Jan'26", y: 3905 },
          { x: "Mar'26", y: 3848 },
          { x: "May'26", y: 3975 },
        ],
      }),
    },
    // Reflection thought
    { delay: 150, event: thought("Have enough — composing the final answer with citations.", "reflect") },
    // Streamed tokens
    ...streamText(HAPPY_FINAL_TEXT, 120),
    // Final
    { delay: 200, event: finalAnswer() },
  ];
}

/** Failure-path script — one tool fails with retriable=true, agent handles. */
function failPath(): Beat[] {
  return [
    { delay: 50, event: metaEvent() },
    { delay: 200, event: thought("Looking up the requested ticker.", "plan") },
    { delay: 100, event: toolCall("mf1", "lookup_company", { ticker: "TCS" }) },
    { delay: 500, event: toolOk("mf1", "lookup_company", "found Tata Consultancy Services") },
    { delay: 200, event: toolCall("mf2", "stock_filings_read", { question: "TCS recent disclosures", company: "TCS" }) },
    {
      delay: 2200,
      event: toolErr(
        "mf2",
        "stock_filings_read",
        "The filings service timed out reading filings. Try again in a moment, or refine the question.",
        "stock_chat_timeout",
        "ask_user_to_retry_later",
        2150,
      ),
    },
    { delay: 200, event: thought("Filings service is down. Falling back to live technicals only.", "decision") },
    { delay: 100, event: toolCall("mf3", "stock_technicals", { ticker: "TCS" }) },
    { delay: 800, event: toolOk("mf3", "stock_technicals", "ok · current_price, 52w, ma_50, rsi_14") },
    { delay: 50, event: freshness("mf3", "market data", "live") },
    ...streamText(
      "I couldn't reach the filings service to read TCS's latest disclosures (timed out after 2s). I do have live market data: TCS is trading at **₹3,975** on the NSE intraday [1].\n\nTry the question again in a moment — the filings service should recover.",
      80,
    ),
    {
      delay: 200,
      event: {
        type: "final",
        answer: "Partial result — filings service unavailable.",
        structured: {
          text: "Partial result — filings service unavailable.",
          confidence: "low",
          data_freshness: "live (technicals only)",
          kpis: [],
          sections: [],
          citations: [
            {
              label: "TCS live market data (NSE intraday)",
              url: null,
              source_kind: "web",
              as_of: "live",
              tool_call_id: "mf3",
            },
          ],
        },
        agent_run_id: "mock-fail",
        cost_usd: 0,
        input_tokens: 612,
        output_tokens: 88,
        latency_ms: 4300,
      } as FinalEvent,
    },
  ];
}

/** "Did you mean?" path — search_companies returns suggestions, no answer. */
function typoPath(): Beat[] {
  return [
    { delay: 50, event: metaEvent() },
    { delay: 200, event: thought("That looks like a name, not a ticker — searching the catalog.", "plan") },
    { delay: 100, event: toolCall("mtp1", "search_companies", { query: "Reliac", limit: 5 }) },
    { delay: 600, event: toolOk("mtp1", "search_companies", "0 of 0 item(s) · 3 near-match(es)") },
    { delay: 200, event: thought("No exact match. Surfacing the closest hits and asking the user to confirm.", "decision") },
    ...streamText(
      `I couldn't find a company called "Reliac" in the catalog. Did you mean:\n\n- **Reliance Industries** (RELIANCE)\n- **Reliance Capital** (RELCAPITAL)\n- **Reliance Infrastructure** (RELINFRA)\n\nReply with the ticker or name you'd like to look up.`,
      60,
    ),
    {
      delay: 200,
      event: {
        type: "final",
        answer: "Awaiting user clarification.",
        structured: null,
        agent_run_id: "mock-typo",
        cost_usd: 0,
        input_tokens: 340,
        output_tokens: 64,
        latency_ms: 2100,
      } as FinalEvent,
    },
  ];
}

/** Clarification path — the request is ambiguous, so the agent asks ONE
 *  focused question and stops (no tools). Mirrors the "ask before you guess"
 *  rule in the real agent's prompt. Trigger with e.g. "compare them",
 *  "how did they do?", or any message containing "clarify". */
function clarifyPath(): Beat[] {
  const text =
    `Happy to dig into that — I just want to pull the right numbers rather than guess. Could you clarify:\n\n` +
    `- **Which company (or companies)?** e.g. TCS, Infosys, Reliance\n` +
    `- **Which metric?** revenue growth, margins, or share-price return\n` +
    `- **Over what period?** the latest quarter, FY24, or trailing 1-year\n\n` +
    `Once you tell me, I'll pull it straight from the filings and live market data.`;
  return [
    { delay: 50, event: metaEvent() },
    {
      delay: 300,
      event: thought(
        "The request is ambiguous — no company, metric, or period is specified. Per 'ask before you guess', I'll ask one focused question instead of burning tools.",
        "plan",
      ),
    },
    ...streamText(text, 55),
    {
      delay: 200,
      event: {
        type: "final",
        answer: "Awaiting user clarification.",
        structured: null,
        agent_run_id: "mock-clarify",
        cost_usd: 0,
        input_tokens: 210,
        output_tokens: 72,
        latency_ms: 1400,
      } as FinalEvent,
    },
  ];
}

/** Convert a long string into a series of token events (~chunk_size chars each). */
function streamText(text: string, chunkSize = 100): Beat[] {
  const beats: Beat[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    beats.push({
      delay: 60 + Math.random() * 40, // 60–100 ms between chunks
      event: token(text.slice(i, i + chunkSize)),
    });
  }
  return beats;
}

/* ── Public entry point ─────────────────────────────────────────────── */

/**
 * Mock-mode equivalent of `runChatStream` from chat.ts.
 *
 * Returns the same ChatStreamHandle shape: `.done` resolves with the
 * terminal event (or null if the caller called abort()).
 */
export function runMockChatStream(
  request: ChatRunRequest,
  handlers: ChatStreamHandlers = {},
): ChatStreamHandle {
  let aborted = false;
  const scenario = pickScenario(request.message);
  const beats =
    scenario === "fail"
      ? failPath()
      : scenario === "typo"
        ? typoPath()
        : scenario === "clarify"
          ? clarifyPath()
          : happyPath();

  const done = (async (): Promise<FinalEvent | ErrorEvent | null> => {
    let terminal: FinalEvent | ErrorEvent | null = null;
    for (const beat of beats) {
      await sleep(beat.delay);
      if (aborted) return null;
      handlers.onEvent?.(beat.event);
      switch (beat.event.type) {
        case "meta":
          handlers.onMeta?.(beat.event);
          break;
        case "tool_call":
          handlers.onToolCall?.(beat.event);
          break;
        case "tool_result":
          handlers.onToolResult?.(beat.event);
          break;
        case "token":
          handlers.onToken?.(beat.event);
          break;
        case "agent_thought":
          handlers.onAgentThought?.(beat.event);
          break;
        case "tool_retry":
          handlers.onToolRetry?.(beat.event);
          break;
        case "data_freshness":
          handlers.onDataFreshness?.(beat.event);
          break;
        case "chart":
          handlers.onChart?.(beat.event);
          break;
        case "final":
          handlers.onFinal?.(beat.event);
          terminal = beat.event;
          break;
        case "error":
          handlers.onError?.(beat.event);
          terminal = beat.event;
          break;
      }
    }
    return terminal;
  })();

  return {
    done,
    abort: () => {
      aborted = true;
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
