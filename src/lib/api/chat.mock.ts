/**
 * Mock SSE chat stream — same wire shape as the real backend, no API call.
 *
 * Why: lets us iterate on the chat UI (tool cards, task checklist, freshness
 * chips, citations + PDF deep-links, clarification card, follow-up chips,
 * Workspace tabs, charts) without burning Gemini tokens or needing the backend
 * + integrations stack up. Toggled at runtime via ``localStorage.prism.mockMode``
 * (the ChatLayout header's "MOCK" toggle flips it).
 *
 * Scenarios driven by user message content (case-insensitive):
 *   • contains "security_id"                  → RESOLVED: a clarification reply →
 *                                               full comparison answer (plan
 *                                               ticking off + table + sources +
 *                                               follow-ups). Pair with "compare".
 *   • "compare" / "clarify" / " vs "          → CLARIFY: a real multi-question
 *                                               ClarificationEvent (tabbed card,
 *                                               security_id options + search box)
 *   • "filing" / "board" / "annual" /         → FILINGS: plan + filings read +
 *     "disclosure"                              FILING CITATIONS with PDF
 *                                               deep-links (url + page) + chips
 *   • "fail" / "error" / "crash"              → FAIL: mid-run tool failure + the
 *                                               structured-error recovery path
 *   • "typo" / "didyou" / "reliac"            → TYPO: search suggestions, no answer
 *   • otherwise                               → HAPPY: the everything path —
 *                                               thoughts, task checklist, many
 *                                               tools, freshness, charts, streamed
 *                                               answer, KPIs + sections + a filing
 *                                               PDF deep-link + follow-up chips
 *
 * To exercise the full clarification ROUND-TRIP in mock: send "compare reliance
 * and adani" (→ tabbed clarification card), pick options + Submit — the card
 * sends a reply containing "security_id", which routes to the RESOLVED answer.
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
  Citation,
  ClarificationEvent,
  ClarificationOption,
  ClarificationQuestion,
  DataFreshnessEvent,
  ErrorEvent,
  FinalAnswer,
  FinalEvent,
  MetaEvent,
  PlanEvent,
  PlanStep,
  TokenEvent,
  ToolCallEvent,
  ToolResultEvent,
} from "./chat";

const MOCK_FLAG_KEY = "prism.mockMode";

/** A real, public PDF so a filing citation's deep-link + "open original" work.
 *  (The IN-APP viewer streams via the backend's auth-gated proxy, so the PDF
 *  body needs the backend; the clickable chip, drawer, page param + open-original
 *  escape hatch all work in pure mock.) */
const SAMPLE_PDF = "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf";

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

type Scenario = "resolved" | "clarify" | "filings" | "fail" | "typo" | "happy";

function pickScenario(message: string): Scenario {
  const m = message.toLowerCase();
  // A clarification REPLY (the picker sends "<term>: <Company> — security_id N")
  // resolves into the comparison answer — the round-trip's second half.
  if (m.includes("security_id")) return "resolved";
  if (m.includes("fail") || m.includes("error") || m.includes("crash")) return "fail";
  if (m.includes("typo") || m.includes("didyou") || m.includes("reliac")) return "typo";
  if (m.includes("compare") || m.includes("clarify") || m.includes(" vs ") || m.includes("versus"))
    return "clarify";
  if (
    m.includes("filing") ||
    m.includes("board") ||
    m.includes("annual report") ||
    m.includes("disclosure")
  )
    return "filings";
  return "happy";
}

/* ── Event constructors ──────────────────────────────────────────────── */

/** One scripted beat — `delay` ms after the previous beat, then dispatch `event`. */
interface Beat {
  delay: number;
  event: ChatEvent;
}

const rid = () => Math.random().toString(16).slice(2, 10);

function metaEvent(): MetaEvent {
  return {
    type: "meta",
    agent_run_id: `mock-${rid()}`,
    session_id: `mock-sess-${rid()}`,
    agent_name: "company_intel",
  };
}

function thought(text: string, kind: AgentThoughtEvent["kind"] = "decision"): AgentThoughtEvent {
  return { type: "agent_thought", text, kind };
}

function toolCall(call_id: string, tool: string, args: Record<string, unknown>): ToolCallEvent {
  return { type: "tool_call", call_id, tool, args };
}

function toolOk(call_id: string, tool: string, result_summary: string, latency_ms = 800): ToolResultEvent {
  return { type: "tool_result", call_id, tool, ok: true, result_summary, error: null, error_code: null, next_action: null, latency_ms };
}

function toolErr(
  call_id: string,
  tool: string,
  error: string,
  error_code: string,
  next_action: ToolResultEvent["next_action"],
  latency_ms = 1200,
): ToolResultEvent {
  return { type: "tool_result", call_id, tool, ok: false, result_summary: null, error, error_code, next_action, latency_ms };
}

function freshness(call_id: string, source: string, as_of: string): DataFreshnessEvent {
  return { type: "data_freshness", call_id, source, as_of };
}

function chart(partial: Omit<ChartEvent, "type">): ChartEvent {
  return { type: "chart", ...partial };
}

function token(text: string): TokenEvent {
  return { type: "token", text };
}

/* ── Task checklist (PlanEvent) ──────────────────────────────────────── */

function step(id: string, title: string, status: PlanStep["status"]): PlanStep {
  return { id, title, status };
}
function plan(steps: PlanStep[]): PlanEvent {
  return { type: "plan", steps };
}

/* ── Clarification (structured, multi-question tabbed card) ───────────── */

function opt(id: string, label: string, hint: string, value: string | number): ClarificationOption {
  return { id, label, hint, value };
}
function clarQuestion(id: string, question: string, options: ClarificationOption[]): ClarificationQuestion {
  return { id, question, mode: "single_select", options, allow_search: true };
}
function clarification(questions: ClarificationQuestion[]): ClarificationEvent {
  const first = questions[0];
  return {
    type: "clarification",
    agent_run_id: `mock-clar-${rid()}`,
    questions,
    // Back-compat single-question mirror (= questions[0]).
    question: first.question,
    mode: first.mode,
    options: first.options,
    allow_search: first.allow_search,
  };
}

/* ── Citations ───────────────────────────────────────────────────────── */

function filingCite(label: string, page: number, tool_call_id: string): Citation {
  return { label, url: SAMPLE_PDF, source_kind: "filing", as_of: "2024-04-30", tool_call_id, page };
}
function webCite(label: string, url: string, tool_call_id: string): Citation {
  return { label, url, source_kind: "web", as_of: "live", tool_call_id, page: null };
}

/* ── Structured final builder ────────────────────────────────────────── */

function mkFinal(
  text: string,
  structured: Partial<FinalAnswer> & { confidence: FinalAnswer["confidence"] },
  agent_run_id = `mock-${rid()}`,
): FinalEvent {
  return {
    type: "final",
    answer: text,
    structured: {
      text,
      confidence: structured.confidence,
      data_freshness: structured.data_freshness ?? null,
      kpis: structured.kpis ?? [],
      sections: structured.sections ?? [],
      citations: structured.citations ?? [],
      suggestions: structured.suggestions ?? [],
      suggested_actions: structured.suggested_actions ?? [],
    },
    agent_run_id,
    cost_usd: 0,
    input_tokens: 1480,
    output_tokens: 300,
    latency_ms: 4200,
  };
}

/** Convert a long string into a series of token events (~chunkSize chars each). */
function streamText(text: string, chunkSize = 100): Beat[] {
  const beats: Beat[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    beats.push({ delay: 60 + Math.random() * 40, event: token(text.slice(i, i + chunkSize)) });
  }
  return beats;
}

/* ── HAPPY: the everything path ──────────────────────────────────────── */

// Inline citations use the REAL backend's `[Company | p.N]` evidence format
// (synthesise=false) — not numeric `[n]` — so the mock mirrors production. The
// UI renders each as a compact numbered badge + popover (numbered by Sources
// position): [TCS | p.12] → 1, [TCS | p.8] → 2, [Infosys | p.5] → 3.
const HAPPY_FINAL_TEXT = `Tata Consultancy Services (TCS) is India's largest IT services company by revenue and market cap, with **₹2.46L crore consolidated revenue in FY24** [TCS | p.12] and a **24.6% EBIT margin** [TCS | p.12] — the best in the listed Indian IT cohort.

Key takeaways:
- **Growth:** 3.5% YoY in constant currency [TCS | p.12]. Slower than Infosys (4.8% [Infosys | p.5]) but with margin discipline intact.
- **Deal momentum:** ₹13.2bn TCV in Q4 — the highest in the cohort [TCS | p.8].
- **Attrition:** 12.1% LTM, the lowest among large peers, signalling stable delivery [TCS | p.12].
- **Current price:** ₹3,975 (NSE intraday), trading at ~28.4x trailing P/E.

The Q4 FY24 result was broadly in line with consensus — no surprises on margins or guidance.`;

function happyFinal(): FinalEvent {
  return mkFinal(
    HAPPY_FINAL_TEXT,
    {
      confidence: "high",
      data_freshness: "Q4 FY24 · 2026-05-26",
      kpis: [
        { label: "Revenue", value: "₹2.46L", unit: "cr", cite_label: "cite 1 · pg 4" },
        { label: "EBIT margin", value: "24.6", unit: "%", cite_label: "cite 1 · pg 6" },
        { label: "Deal TCV", value: "₹13.2", unit: "bn", cite_label: "cite 2 · pg 8" },
        { label: "Attrition (LTM)", value: "12.1", unit: "%", cite_label: "cite 1 · pg 11" },
      ],
      sections: [
        {
          title: "Executive summary",
          kind: "summary",
          body:
            "TCS closed FY24 with **₹2.46L cr** revenue [TCS | p.12], up **3.5% YoY** in constant " +
            "currency. EBIT margin held at **24.6%** [TCS | p.12] — best in the Indian IT cohort. " +
            "Q4 TCV of **₹13.2bn** [TCS | p.8] suggests deal momentum continues despite cautious " +
            "near-term guidance.",
        },
        {
          title: "Anomaly flags",
          kind: "anomaly",
          body:
            "⚠ **Attrition floor approached** — 12.1% LTM is the lowest in 8 quarters [TCS | p.12]; " +
            "further compression would pressure wage costs.\n\n⚠ **FY27 guidance left blank** — unlike " +
            "Infosys (3–5% band [Infosys | p.5]), TCS declined to commit to a top-line range, citing " +
            "macro uncertainty.",
        },
      ],
      // FILING citations (url + page) → each inline `[Company | p.N]` resolves to
      // its Sources position and renders as a numbered badge that deep-links into
      // the Report-tab PDF viewer at that page.
      citations: [
        filingCite("TCS Q4 FY24 Audited Results, p. 12", 12, "mt2"),
        filingCite("TCS Q4 FY24 Investor Presentation, p. 8", 8, "mt2"),
        filingCite("Infosys Q4 FY24 Fact Sheet, p. 5", 5, "mt2"),
        webCite("Live market data (NSE intraday)", "https://www.nseindia.com/get-quotes/equity?symbol=TCS", "mt3"),
      ],
      suggestions: [
        "How does TCS's margin compare with Infosys in FY24?",
        "What was TCS's deal TCV trend over the last 4 quarters?",
        "Show TCS revenue growth in a table",
      ],
      // Deep-dive "Explore" chips (mirrors what the backend's rule-based
      // synthesis emits for a company financials/filings turn).
      suggested_actions: [
        { action: "bmc", label: "Business Model Canvas · TCS", context: { ticker: "TCS" } },
        {
          action: "stock_dashboard",
          label: "Price & financials · TCS",
          context: { security_id: 11536 },
        },
        {
          action: "news",
          label: "News & sentiment · TCS",
          context: { company: "Tata Consultancy Services" },
        },
      ],
    },
    "mock-run-happy",
  );
}

function happyPath(): Beat[] {
  return [
    { delay: 50, event: metaEvent() },
    { delay: 200, event: thought("User wants a TCS deep-dive. I'll plan it, then pull filings + technicals.", "plan") },
    // Visible task checklist — declared, then ticks off as work completes.
    { delay: 120, event: plan([
        step("s1", "Resolve TCS and read the latest filing", "in_progress"),
        step("s2", "Pull live technicals + compute margin", "pending"),
        step("s3", "Compose the answer with citations", "pending"),
      ]) },
    { delay: 300, event: toolCall("mt1", "resolve_company", { query: "TCS" }) },
    { delay: 600, event: toolOk("mt1", "resolve_company", "found Tata Consultancy Services Ltd · security_id 2718", 540) },
    { delay: 200, event: thought("Found TCS. Reading the latest Q4 filing for narrative.", "decision") },
    { delay: 100, event: toolCall("mt2", "stock_filings_read", { question: "TCS Q4 FY24 highlights", security_id: 2718 }) },
    { delay: 1800, event: toolOk("mt2", "stock_filings_read", "answer + evidence · 4 passages", 1740) },
    { delay: 50, event: freshness("mt2", "filings catalog", "2024-04-30") },
    { delay: 120, event: plan([
        step("s1", "Resolve TCS and read the latest filing", "done"),
        step("s2", "Pull live technicals + compute margin", "in_progress"),
        step("s3", "Compose the answer with citations", "pending"),
      ]) },
    { delay: 150, event: toolCall("mt3", "stock_technicals", { security_id: 2718, period: "1y" }) },
    { delay: 900, event: toolOk("mt3", "stock_technicals", "ok · price, 52w, ma_50, ma_200, rsi_14", 840) },
    { delay: 50, event: freshness("mt3", "market data", "live") },
    { delay: 200, event: toolCall("mt4", "compute_margin", { numerator: 60490, denominator: 246060 }) },
    { delay: 400, event: toolOk("mt4", "compute_margin", "= 24.6%", 320) },
    { delay: 120, event: plan([
        step("s1", "Resolve TCS and read the latest filing", "done"),
        step("s2", "Pull live technicals + compute margin", "done"),
        step("s3", "Compose the answer with citations", "in_progress"),
      ]) },
    // Charts surfaced from the trend data.
    { delay: 200, event: chart({ call_id: "mt2", chart_id: "tcs_revenue_5q", title: "TCS revenue · trailing 5 quarters", unit: "₹ cr", current_value: "63,973", current_delta: "+3.5% YoY", delta_kind: "pos", kind: "area", points: [ { x: "Q4'25", y: 59700 }, { x: "Q1'26", y: 60810 }, { x: "Q2'26", y: 61590 }, { x: "Q3'26", y: 62800 }, { x: "Q4'26", y: 63973 } ] }) },
    { delay: 100, event: chart({ call_id: "mt2", chart_id: "tcs_ebit_margin", title: "EBIT margin · 5-quarter band", unit: "%", current_value: "24.6", current_delta: "flat QoQ", delta_kind: "neutral", kind: "line", points: [ { x: "Q4'25", y: 24.1 }, { x: "Q1'26", y: 24.3 }, { x: "Q2'26", y: 24.5 }, { x: "Q3'26", y: 24.6 }, { x: "Q4'26", y: 24.6 } ] }) },
    { delay: 100, event: chart({ call_id: "mt3", chart_id: "tcs_price_1y", title: "TCS · 1-year price", unit: "₹", current_value: "3,975", current_delta: "+12.4% 1Y", delta_kind: "pos", kind: "line", points: [ { x: "May'25", y: 3536 }, { x: "Jul'25", y: 3680 }, { x: "Sep'25", y: 3492 }, { x: "Nov'25", y: 3814 }, { x: "Jan'26", y: 3905 }, { x: "Mar'26", y: 3848 }, { x: "May'26", y: 3975 } ] }) },
    { delay: 150, event: thought("Have enough — composing the final answer with citations.", "reflect") },
    ...streamText(HAPPY_FINAL_TEXT, 120),
    // Final checklist state (all done) lands right before the answer — mirrors
    // the backend's deterministic all-done PlanEvent.
    { delay: 120, event: plan([
        step("s1", "Resolve TCS and read the latest filing", "done"),
        step("s2", "Pull live technicals + compute margin", "done"),
        step("s3", "Compose the answer with citations", "done"),
      ]) },
    { delay: 200, event: happyFinal() },
  ];
}

/* ── CLARIFY: structured multi-question clarification (tabbed card) ───── */

function clarifyPath(): Beat[] {
  return [
    { delay: 50, event: metaEvent() },
    { delay: 300, event: thought('"Reliance" and "Adani" each map to several listed entities — I\'ll disambiguate both in one card before pulling numbers.', "plan") },
    { delay: 200, event: toolCall("mc1", "resolve_companies", { names: ["reliance", "adani"] }) },
    { delay: 700, event: toolOk("mc1", "resolve_companies", "awaiting your selection · 2 question(s)", 220) },
    { delay: 250, event: clarification([
        clarQuestion("reliance", 'Multiple companies match "Reliance". Which one did you mean?', [
          opt("r1", "Reliance Industries Ltd.", "RELIANCE · NSE · Oil, Gas & Consumer", 2228),
          opt("r2", "Reliance Power Ltd.", "RPOWER · NSE · Power", 1394),
          opt("r3", "Reliance Infrastructure Ltd.", "RELINFRA · NSE · Infrastructure", 1437),
        ]),
        clarQuestion("adani", 'Multiple companies match "Adani". Which one did you mean?', [
          opt("a1", "Adani Enterprises Ltd.", "ADANIENT · NSE · Trading", 84),
          opt("a2", "Adani Ports & SEZ Ltd.", "ADANIPORTS · NSE · Infrastructure", 114),
          opt("a3", "Adani Power Ltd.", "ADANIPOWER · NSE · Power", 102),
        ]),
      ]) },
  ];
}

/* ── RESOLVED: the answer after a clarification pick (round-trip part 2) ─ */

const COMPARE_TEXT = `For **FY24**, Reliance Industries Ltd. is far larger by revenue and profit, while Adani Enterprises Ltd. carries materially higher leverage.

| Company | Revenue (₹ cr) | Net Profit (₹ cr) | Debt-to-Equity |
| :------ | -------------: | ----------------: | -------------: |
| Reliance Industries Ltd. | 9,00,000 | 79,000 | 0.44 |
| Adani Enterprises Ltd. | 96,400 | 3,250 | 1.63 |

**Takeaway:** Reliance is ~9× Adani Enterprises on revenue with a far stronger balance sheet; Adani's growth comes with higher financial risk.`;

function resolvedPath(): Beat[] {
  return [
    { delay: 50, event: metaEvent() },
    { delay: 200, event: thought("Got the picks: Reliance Industries (2228) and Adani Enterprises (84). Planning a 2-step compare.", "plan") },
    { delay: 120, event: plan([ step("c1", "Pull FY24 financials for both companies", "in_progress"), step("c2", "Compare and summarise", "pending") ]) },
    { delay: 200, event: toolCall("mr1", "financials_query", { question: "FY24 revenue, net profit and debt-to-equity for Reliance Industries Ltd and Adani Enterprises Ltd", security_ids: [2228, 84] }) },
    { delay: 1400, event: toolOk("mr1", "financials_query", "2 companies · 3 metrics", 1320) },
    { delay: 50, event: freshness("mr1", "financials_query", "2024-03-31") },
    { delay: 120, event: plan([ step("c1", "Pull FY24 financials for both companies", "done"), step("c2", "Compare and summarise", "in_progress") ]) },
    { delay: 150, event: thought("Have the numbers — composing the comparison table.", "reflect") },
    ...streamText(COMPARE_TEXT, 100),
    { delay: 120, event: plan([ step("c1", "Pull FY24 financials for both companies", "done"), step("c2", "Compare and summarise", "done") ]) },
    { delay: 180, event: mkFinal(COMPARE_TEXT, {
        confidence: "high",
        data_freshness: "FY24 · 2024-03-31",
        // DB-sourced numbers → no filing citation; the "1 source" chip comes
        // from the financials_query freshness (a data-source).
        citations: [],
        suggestions: [
          "How did their net margins compare in FY24?",
          "Compare their FY25 revenue growth",
          "Which has higher return on equity?",
        ],
      }, "mock-run-resolved") },
  ];
}

/* ── FILINGS: filing citations with PDF deep-links ───────────────────── */

const FILINGS_TEXT = `At its board meeting held on April 30, 2024, **Reliance Industries Ltd.**'s Board approved and took on record the audited financial results for Q4 and the year ended March 31, 2024, and made several key decisions [Reliance Industries Ltd | p.12].

Specifically, the Board:
- Recommended a **dividend of ₹10 per equity share** (face value ₹10) for FY24, subject to AGM approval [Reliance Industries Ltd | p.12].
- Approved raising funds up to **₹20,000 crore** via non-convertible debentures on a private-placement basis [Reliance Industries Ltd | p.3].
- Approved the date of the 47th Annual General Meeting [Reliance Industries Ltd | p.3].`;

function filingsPath(): Beat[] {
  return [
    { delay: 50, event: metaEvent() },
    { delay: 200, event: thought("Board-meeting question — I'll read the disclosures, then synthesise the decisions with page-level citations.", "plan") },
    { delay: 120, event: plan([ step("f1", "Read Reliance board-meeting disclosures", "in_progress"), step("f2", "Synthesise key decisions with citations", "pending") ]) },
    { delay: 250, event: toolCall("mfl1", "resolve_company", { query: "Reliance Industries Ltd" }) },
    { delay: 600, event: toolOk("mfl1", "resolve_company", "found Reliance Industries Ltd · security_id 2228", 480) },
    { delay: 120, event: plan([ step("f1", "Read Reliance board-meeting disclosures", "done"), step("f2", "Synthesise key decisions with citations", "in_progress") ]) },
    { delay: 150, event: toolCall("mfl2", "stock_filings_read", { question: "Reliance Industries board meeting decisions April 2024", security_id: 2228, synthesise: false }) },
    { delay: 1900, event: toolOk("mfl2", "stock_filings_read", "evidence · 5 passages · 2 filings", 1820) },
    { delay: 50, event: freshness("mfl2", "filings catalog", "2024-04-30") },
    { delay: 150, event: thought("Have the board-outcome PDF — composing with inline page citations.", "reflect") },
    ...streamText(FILINGS_TEXT, 100),
    { delay: 120, event: plan([ step("f1", "Read Reliance board-meeting disclosures", "done"), step("f2", "Synthesise key decisions with citations", "done") ]) },
    { delay: 180, event: mkFinal(FILINGS_TEXT, {
        confidence: "high",
        data_freshness: "2024-04-30",
        // FILING citations with url + page → inline `[Company | p.N]` markers AND
        // the Sources list deep-link into the Report-tab PDF viewer at that page.
        citations: [
          filingCite("Reliance Industries Ltd — Q4 FY24 board outcome, p. 12", 12, "mfl2"),
          filingCite("Reliance Industries Ltd — Q4 FY24 board outcome, p. 3", 3, "mfl2"),
        ],
        suggestions: [
          "What were the audited FY24 financial results?",
          "What dividend did Reliance declare for FY24?",
          "When is the next AGM scheduled?",
        ],
      }, "mock-run-filings") },
  ];
}

/* ── FAIL: structured-error recovery path ────────────────────────────── */

function failPath(): Beat[] {
  return [
    { delay: 50, event: metaEvent() },
    { delay: 200, event: thought("Looking up the requested ticker.", "plan") },
    { delay: 100, event: toolCall("mf1", "resolve_company", { query: "TCS" }) },
    { delay: 500, event: toolOk("mf1", "resolve_company", "found Tata Consultancy Services Ltd · security_id 2718") },
    { delay: 200, event: toolCall("mf2", "stock_filings_read", { question: "TCS recent disclosures", security_id: 2718 }) },
    { delay: 2200, event: toolErr("mf2", "stock_filings_read", "The filings service timed out reading filings. Try again in a moment, or refine the question.", "stock_chat_timeout", "ask_user_to_retry_later", 2150) },
    { delay: 200, event: thought("Filings service is down. Falling back to live technicals only.", "decision") },
    { delay: 100, event: toolCall("mf3", "stock_technicals", { security_id: 2718 }) },
    { delay: 800, event: toolOk("mf3", "stock_technicals", "ok · price, 52w, ma_50, rsi_14") },
    { delay: 50, event: freshness("mf3", "market data", "live") },
    ...streamText(
      "I couldn't reach the filings service to read TCS's latest disclosures (timed out after 2s). I do have live market data: TCS is trading at **₹3,975** on the NSE intraday [1].\n\nTry the question again in a moment — the filings service should recover.",
      80,
    ),
    { delay: 200, event: mkFinal(
        "Partial result — filings service unavailable.",
        {
          confidence: "low",
          data_freshness: "live (technicals only)",
          citations: [webCite("TCS live market data (NSE intraday)", "https://www.nseindia.com/get-quotes/equity?symbol=TCS", "mf3")],
          suggestions: ["Retry reading TCS filings", "Show TCS live technicals", "What is TCS trading at right now?"],
        },
        "mock-fail",
      ) },
  ];
}

/* ── TYPO: search suggestions, no answer ─────────────────────────────── */

function typoPath(): Beat[] {
  return [
    { delay: 50, event: metaEvent() },
    { delay: 200, event: thought("That looks like a name, not a ticker — searching the catalog.", "plan") },
    { delay: 100, event: toolCall("mtp1", "search_companies", { query: "Reliac", limit: 5 }) },
    { delay: 600, event: toolOk("mtp1", "search_companies", "0 exact · 3 near-match(es)") },
    { delay: 200, event: thought("No exact match. Surfacing the closest hits and asking the user to confirm.", "decision") },
    ...streamText(
      `I couldn't find a company called "Reliac" in the catalog. Did you mean:\n\n- **Reliance Industries** (RELIANCE)\n- **Reliance Power** (RPOWER)\n- **Reliance Infrastructure** (RELINFRA)\n\nReply with the name you'd like to look up.`,
      60,
    ),
    { delay: 200, event: mkFinal(
        "Awaiting user clarification.",
        { confidence: "low", suggestions: ["Look up Reliance Industries", "Look up Reliance Power", "Search for another company"] },
        "mock-typo",
      ) },
  ];
}

/* ── Public entry point ─────────────────────────────────────────────── */

/**
 * Mock-mode equivalent of `runChatStream` from chat.ts. Returns the same
 * ChatStreamHandle shape: `.done` resolves with the terminal event (final OR
 * clarification OR error), or null if the caller called abort().
 */
export function runMockChatStream(
  request: ChatRunRequest,
  handlers: ChatStreamHandlers = {},
): ChatStreamHandle {
  let aborted = false;
  const scenario = pickScenario(request.message);
  const beats =
    scenario === "resolved"
      ? resolvedPath()
      : scenario === "clarify"
        ? clarifyPath()
        : scenario === "filings"
          ? filingsPath()
          : scenario === "fail"
            ? failPath()
            : scenario === "typo"
              ? typoPath()
              : happyPath();

  const done = (async (): Promise<FinalEvent | ClarificationEvent | ErrorEvent | null> => {
    let terminal: FinalEvent | ClarificationEvent | ErrorEvent | null = null;
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
        case "plan":
          handlers.onPlan?.(beat.event);
          break;
        case "clarification":
          handlers.onClarification?.(beat.event);
          terminal = beat.event;
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
