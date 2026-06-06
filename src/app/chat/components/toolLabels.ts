/**
 * Humanize raw agent tool names into friendly, present-tense narration — the
 * difference between "stock_filings_read" and "Reading the filing…". Used by the
 * inline agent-activity stream to make the chat feel like watching a person work.
 */

type Status = "running" | "done" | "error";

// Exact tool name → {running, done} phrasing.
const EXACT: Record<string, { run: string; done: string }> = {
  lookup_company: { run: "Looking up the company", done: "Looked up the company" },
  web_search: { run: "Searching the web", done: "Searched the web" },
  google_search: { run: "Searching the web", done: "Searched the web" },
  financials_query: { run: "Querying financials", done: "Queried financials" },
  prism_financials: { run: "Querying financials", done: "Queried financials" },
  stock_chat: { run: "Reading the filing", done: "Read the filing" },
  stock_technicals: { run: "Checking technicals", done: "Checked technicals" },
};

// Prefix families → {running, done} phrasing.
const PREFIX: { prefix: string; run: string; done: string }[] = [
  { prefix: "stock_filings", run: "Reading filings", done: "Read filings" },
  { prefix: "stock_announcements", run: "Scanning announcements", done: "Scanned announcements" },
  { prefix: "stock_reports", run: "Pulling reports", done: "Pulled reports" },
  { prefix: "stock_", run: "Looking up market data", done: "Looked up market data" },
  { prefix: "news_", run: "Scanning the news", done: "Scanned the news" },
  { prefix: "bmc_", run: "Mapping the business model", done: "Mapped the business model" },
  { prefix: "compute_", run: "Crunching the numbers", done: "Crunched the numbers" },
  { prefix: "portfolio_", run: "Working the portfolio", done: "Worked the portfolio" },
];

/** Title-case a raw tool name as a last-resort label. */
function prettify(tool: string): string {
  const s = tool.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** A friendly label for a tool call, phrased for its current status. */
export function toolLabel(tool: string, status: Status): string {
  const entry = EXACT[tool] ?? PREFIX.find((p) => tool.startsWith(p.prefix));
  if (!entry) {
    const name = prettify(tool);
    return status === "running" ? `Running ${name}…` : name;
  }
  return status === "running" ? `${entry.run}…` : entry.done;
}
