/**
 * PRISM — Centralized Mock Data
 *
 * ALL hardcoded data lives here. When we connect the backend,
 * we replace imports from this file with real API calls.
 */

/* ── User ── */
export const MOCK_USER = {
  initials: "AK",
  name: "Aarav Kapoor",
  firm: "Avendus Capital",
};

/* ── Navigation ── */
export type NavView = "dashboard" | "chat" | "companies" | "bmc" | "news" | "stocks" | "portfolio" | "reports" | "settings";

export interface NavItem {
  id: NavView;
  label: string;
  icon: string;
  badge?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "chat", label: "Research Chat", icon: "chat", badge: "12" },
  { id: "companies", label: "Companies", icon: "companies" },
  { id: "bmc", label: "Business Models", icon: "bmc" },
  { id: "news", label: "News & Sentiment", icon: "news" },
  { id: "stocks", label: "Stock Dashboard", icon: "stocks" },
  { id: "portfolio", label: "Portfolio Builder", icon: "portfolio" },
  { id: "reports", label: "Reports Library", icon: "reports" },
  { id: "settings", label: "Settings", icon: "settings" },
];

export const RECENT_CHATS = [
  { id: "reliance", label: "Reliance Q4 deep-dive" },
  { id: "it", label: "IT services peer comp" },
  { id: "hdfc", label: "HDFC AMC scenarios" },
  { id: "adani", label: "Adani Ports filings" },
  { id: "tata", label: "Tata Motors DCF" },
  { id: "sbi", label: "SBI asset quality" },
  { id: "itc", label: "ITC demerger impact" },
  { id: "infy", label: "Infosys deal wins" },
  { id: "maruti", label: "Maruti volume trends" },
  { id: "bajaj", label: "Bajaj Finance AUM" },
  { id: "ltim", label: "LTIMindtree margins" },
  { id: "sunpharma", label: "Sun Pharma US pipeline" },
  { id: "dmart", label: "DMart store economics" },
  { id: "zomato", label: "Zomato unit economics" },
  { id: "ntpc", label: "NTPC capex plan" },
  { id: "airtel", label: "Airtel ARPU trend" },
];

/* ── Watchlist ── */
export interface WatchlistItem {
  name: string;
  symbol: string;
  exchange: string;
  price: string;
  delta: string;
  trend: "up" | "down";
  sparkPoints: string;
}

export const MOCK_WATCHLIST: WatchlistItem[] = [
  { name: "Reliance Industries", symbol: "RELIANCE", exchange: "NSE", price: "₹2,847.30", delta: "+1.84%", trend: "up", sparkPoints: "0,18 10,16 20,17 30,12 40,8 50,6 60,4" },
  { name: "HDFC Bank", symbol: "HDFCBANK", exchange: "NSE", price: "₹1,621.55", delta: "−0.42%", trend: "down", sparkPoints: "0,8 10,10 20,9 30,12 40,11 50,14 60,15" },
  { name: "Infosys", symbol: "INFY", exchange: "NSE", price: "₹1,432.10", delta: "+2.11%", trend: "up", sparkPoints: "0,16 10,14 20,12 30,10 40,9 50,5 60,3" },
  { name: "Tata Motors", symbol: "TATAMOTORS", exchange: "NSE", price: "₹932.85", delta: "+0.78%", trend: "up", sparkPoints: "0,14 10,15 20,13 30,11 40,12 50,9 60,8" },
  { name: "Adani Ports", symbol: "ADANIPORTS", exchange: "NSE", price: "₹1,346.20", delta: "−1.12%", trend: "down", sparkPoints: "0,6 10,8 20,10 30,9 40,12 50,14 60,16" },
];

/* ── Dashboard Stats ── */
export interface StatItem {
  title: string;
  value: string;
  delta: string;
  deltaType: "pos" | "neg";
  context: string;
  link: string;
}

export const MOCK_STATS: StatItem[] = [
  { title: "Filings monitored", value: "2,481", delta: "↑ 14 today", deltaType: "pos", context: "Across NSE · BSE · SEBI feeds", link: "View →" },
  { title: "Active research", value: "12", delta: "3 awaiting review", deltaType: "pos", context: "Last published: 2h ago", link: "All →" },
  { title: "Tool calls / 24h", value: "847", delta: "↓ 2 errors", deltaType: "neg", context: "98.4% success rate", link: "Logs →" },
];

/* ── Activity ── */
export interface ActivityItem {
  title: string;
  time: string;
  tag: string;
  color: string;
}

export const MOCK_ACTIVITY: ActivityItem[] = [
  { title: "Reliance Q4 filing summary completed", time: "14 min ago", tag: "T1 · Summary", color: "accent" },
  { title: "DCF model built for Tata Motors", time: "1h ago", tag: "T10 · Modelling", color: "info" },
  { title: "SEBI alert flagged on Adani Ports", time: "2h ago", tag: "T8 · Compliance", color: "warn" },
  { title: "Peer comp: 7 IT services companies", time: "3h ago", tag: "T12 · Peer", color: "pos" },
  { title: "Mutual fund holdings updated · 47 funds", time: "5h ago", tag: "T14 · MF", color: "accent" },
];

/* ── Tools ── */
export interface ToolItem {
  num: string;
  name: string;
  desc: string;
  icon: string;
  prompt: string;
  status: "active" | "beta" | "inactive";
}

export const MOCK_TOOLS: ToolItem[] = [
  { num: "T01", name: "Report Summary", desc: "Validated, cross-checked summaries with citations", icon: "report", prompt: "Summarise the latest filing of [pick a company]", status: "active" },
  { num: "T02", name: "KPI Extraction", desc: "Pull KPIs with provenance & validation", icon: "chart", prompt: "Extract KPIs from the most recent Reliance filing", status: "active" },
  { num: "T03", name: "Q&A on Reports", desc: "Answer any question grounded in filings", icon: "search", prompt: "Answer questions about Reliance Q4 FY26 report", status: "active" },
  { num: "T04", name: "Structured Data Gen", desc: "Tables, schemas & exports", icon: "grid", prompt: "Generate structured table of FY26 segment revenue", status: "active" },
  { num: "T05", name: "Report Builder", desc: "Compose research notes end-to-end", icon: "compose", prompt: "Build a research note on Tata Motors", status: "active" },
  { num: "T06", name: "Business Profile", desc: "Detailed business decomposition", icon: "cube", prompt: "Generate a detailed business profile for Reliance", status: "active" },
  { num: "T07", name: "News Capabilities", desc: "Real-time news with sentiment", icon: "news", prompt: "Show me latest news on Reliance", status: "active" },
  { num: "T08", name: "Regulatory & Compliance", desc: "NSE · BSE · SEBI alerts", icon: "shield", prompt: "Show me SEBI alerts and compliance updates this week", status: "active" },
  { num: "T09", name: "Filings Knowledge", desc: "Deep index on NSE/BSE filings", icon: "filings", prompt: "Search NSE filings for Reliance Q4 FY26", status: "active" },
  { num: "T10", name: "Financial Modelling", desc: "DCF, comparables, scenario builds", icon: "bar-chart", prompt: "Build a DCF model for Tata Motors", status: "beta" },
  { num: "T11", name: "Company Filtering", desc: "Screener with custom criteria", icon: "filter", prompt: "Filter mid-cap companies with ROCE > 25 and D/E < 0.3", status: "active" },
  { num: "T12", name: "Peer Comparison", desc: "Side-by-side benchmarking", icon: "compare", prompt: "Compare TCS, Infosys, Wipro on growth and margins", status: "active" },
  { num: "T13", name: "Fund Performance", desc: "Track funds within category", icon: "pulse", prompt: "Track HDFC AMC fund vs other AMCs in same category", status: "active" },
  { num: "T14", name: "Mutual Fund Holdings", desc: "Trace MF positions over time", icon: "globe", prompt: "Show mutual fund holdings of Adani Ports over last 4 quarters", status: "active" },
  { num: "T15", name: "Analyst Estimates", desc: "Consensus & dispersion data", icon: "book", prompt: "Show analyst consensus estimates for Tata Motors", status: "beta" },
];

/* ── Ask Screen Suggestions ── */
export interface Suggestion {
  label: string;
  text: string;
  icon: string;
}

export const MOCK_SUGGESTIONS: Suggestion[] = [
  { label: "Summary · T1 · T2 · T9", text: "Summarise Reliance Q4 FY26 with KPIs vs guidance", icon: "report" },
  { label: "Compare · T12 · T2", text: "TCS, Infosys, Wipro, HCLTech — growth & margins", icon: "compare" },
  { label: "Model · T10", text: "DCF for Tata Motors with scenarios", icon: "bar-chart" },
  { label: "Screen · T11", text: "Mid-caps · high ROCE · low debt · CAGR ≥ 15%", icon: "filter" },
];

/* ── Chat Intent Configs ── */
export type IntentType = "summary" | "compare" | "dcf" | "screen" | "news" | "mf" | "compliance";

export interface ToolCall {
  name: string;
  status: string;
  time: string;
  running?: boolean;
}

export interface IntentConfig {
  title: string;
  statusMsg: string;
  tools: ToolCall[];
  answer: string;
  contextTag: string;
  tabs: string[];
}

export const INTENT_CONFIGS: Record<IntentType, IntentConfig> = {
  summary: {
    title: "Reliance Industries — Q4 FY26 Review",
    statusMsg: "Live · running 4 tools",
    tools: [
      { name: "filings_fetch · T09", status: "Retrieved Q4 FY26 results filing from NSE", time: "1.2s" },
      { name: "kpi_extract · T02", status: "Extracted 14 KPIs · cross-checked vs prior 4 quarters", time: "2.4s" },
      { name: "summary_generate · T01", status: "Generated summary · 3 sections · 12 citations", time: "3.1s" },
      { name: "peer_compare · T12", status: "Building 5-quarter Jio segment trend", time: "running", running: true },
    ],
    answer: "Here's what's in the Q4 FY26 report. Reliance posted **consolidated revenue of ₹2.74 lakh crore** [1], up **11.8% YoY** — beating consensus of ₹2.69L cr [2]. EBITDA margin held at **17.4%**, in line with prior quarter [1].\n\n**Key callouts:** Jio ARPU lifted to ₹202 (from ₹196 in Q3). Retail saw a softer footfall growth at 8.2% vs the 10%+ trend. O2C segment was the surprise — margins compressed 90bps on weak GRMs.\n\nI've drafted the full report on the right →",
    contextTag: "RELIANCE Q4 FY26",
    tabs: ["report", "charts", "data", "sources"],
  },
  compare: {
    title: "Indian IT Services — Peer Comparison",
    statusMsg: "Live · running 3 tools",
    tools: [
      { name: "filings_fetch · T09", status: "Pulled latest filings for 4 IT services tickers", time: "1.8s" },
      { name: "kpi_extract · T02", status: "Extracted revenue, margin & growth metrics", time: "2.6s" },
      { name: "peer_compare · T12", status: "Built side-by-side comparison · 12 metrics", time: "3.4s" },
    ],
    answer: "Here's the peer comparison across **TCS, Infosys, Wipro and HCLTech** on the right. Quick read:\n\n**Growth:** Infosys leads constant-currency growth at 4.8% YoY [1]; HCLTech close behind at 4.2%. Wipro is the laggard at 1.1% [2].\n\n**Margins:** TCS still has the best EBIT margin at 24.6% [3], with all four guiding for stable bands.\n\n**Outlook:** Infosys is the only one tightening FY27 guidance to the top half of the range.",
    contextTag: "4 IT companies",
    tabs: ["compare", "charts", "data", "sources"],
  },
  dcf: {
    title: "Tata Motors — DCF Valuation",
    statusMsg: "Live · running 4 tools",
    tools: [
      { name: "filings_fetch · T09", status: "Pulled FY24-FY26 financials", time: "1.4s" },
      { name: "analyst_estimates · T15", status: "Fetched consensus FY27-FY29 forecasts", time: "2.1s" },
      { name: "financial_model · T10", status: "Built 3-stage DCF · 3 scenarios", time: "4.7s" },
      { name: "kpi_extract · T02", status: "Validated assumptions vs filings", time: "1.9s" },
    ],
    answer: "Built a 3-stage DCF for Tata Motors with bull/base/bear scenarios. Model is on the right.\n\n**Base case TP: ₹1,120** — +17.2% upside vs current ₹932 [1]. Assumes JLR margins stabilise at 7.5%, India CV 9% revenue CAGR.\n\n**Bull (₹1,348):** JLR margins expand to 9% as ICE mix improves, EV losses narrow.\n\n**Bear (₹786):** JLR remains volatile, India PV market shares slip to 12%.\n\nWACC of 11.8% used [2]; terminal growth 4.5%.",
    contextTag: "TATAMOTORS · DCF",
    tabs: ["model", "sensitivity", "assumptions", "sources"],
  },
  screen: {
    title: "Screener — High ROCE / Low Debt",
    statusMsg: "Live · running 2 tools",
    tools: [
      { name: "company_filter · T11", status: "Scanned 4,128 NSE-listed companies", time: "2.2s" },
      { name: "kpi_extract · T02", status: "Validated metrics on 62 matches", time: "3.1s" },
    ],
    answer: "Found **62 companies** matching your criteria. Top of the list on the right.\n\nFilters applied: ROCE > 25%, D/E < 0.3, m-cap ₹5K–25K cr, 3-year revenue CAGR > 15%.\n\nThe standouts: **Astral, KEI Industries, Polycab, Bajaj Electricals** — all combining 30%+ ROCE with negligible debt. Worth a closer look at sector clustering: Industrials/Capital Goods over-indexed.",
    contextTag: "62 companies",
    tabs: ["results", "sectors", "export", "sources"],
  },
  news: {
    title: "News — Reliance · sentiment",
    statusMsg: "Live · running 1 tool",
    tools: [
      { name: "news_search · T07", status: "Pulled 47 articles from last 24h · sentiment-scored", time: "2.8s" },
    ],
    answer: "Pulled 47 news items in the last 24 hours. Sentiment skews **positive (62%)**.\n\n**Key themes:** Jio AirFiber rollout (positive — coverage of 200K subscriber milestone), retail expansion in Tier-2 (mixed), and a regulatory mention around telecom spectrum (neutral).",
    contextTag: "RELIANCE · news",
    tabs: ["headlines", "sentiment", "sources"],
  },
  mf: {
    title: "Mutual Fund Holdings — Adani Ports",
    statusMsg: "Live · running 2 tools",
    tools: [
      { name: "mf_holdings · T14", status: "Tracked positions across 47 funds · 4 quarters", time: "3.4s" },
      { name: "fund_performance · T13", status: "Compared accumulators by category", time: "2.1s" },
    ],
    answer: "Across 47 funds tracking Adani Ports, here's the picture on the right.\n\n**Net buying signal** in Q4 FY26 — fund holdings up 8.2% QoQ. **SBI MF** is the top accumulator (+1.4M shares); **Nippon India** trimmed by 0.6M.\n\nPosition concentration is highest in large-cap value funds, suggesting the 'value' framing is driving new inflows.",
    contextTag: "ADANIPORTS · MF",
    tabs: ["holdings", "flows", "sources"],
  },
  compliance: {
    title: "SEBI · Compliance Watch",
    statusMsg: "Live · running 1 tool",
    tools: [
      { name: "compliance_alerts · T08", status: "Pulled 9 actionable disclosures · April 2026", time: "1.6s" },
    ],
    answer: "9 actionable disclosures across your watchlist this month. Detail on the right.\n\n**Highest priority:** insider trading disclosure on Adani Ports (promoter sold 2.1M shares); related-party transaction at HDFC Bank (within disclosed thresholds).",
    contextTag: "SEBI · alerts",
    tabs: ["alerts", "sources"],
  },
};

/* ── Reports Library ── */
export interface ReportTileData {
  category: string;
  categoryColor: string;
  title: string;
  desc: string;
  time: string;
  sources: string;
  extra: string;
  intentKey?: string;
}

export const MOCK_REPORTS: ReportTileData[] = [
  { category: "Quarterly Brief", categoryColor: "accent", title: "Reliance Industries — Q4 FY26 Review", desc: "Revenue beat consensus by 1.9%; Jio ARPU lift; O2C margin compression flagged.", time: "2h ago", sources: "12 sources", extra: "NSE: RELIANCE", intentKey: "reliance" },
  { category: "Peer Comparison", categoryColor: "info", title: "Indian IT Services — Margins & Growth", desc: "7-company side-by-side: TCS, Infosys, Wipro, HCLTech, LTIMindtree, Mphasis, Persistent.", time: "3h ago", sources: "21 sources", extra: "7 tickers", intentKey: "it" },
  { category: "DCF Model", categoryColor: "pos", title: "Tata Motors — Bull/Base/Bear scenario", desc: "JLR turnaround thesis tested. Base TP ₹1,120 with 17% upside under base case.", time: "1d ago", sources: "8 sources", extra: "3 scenarios", intentKey: "tata" },
  { category: "Quarterly Brief", categoryColor: "accent", title: "HDFC Bank — Q4 FY26 Quick Take", desc: "NIM compression; deposit growth lagged advances; provisioning normalised.", time: "2d ago", sources: "9 sources", extra: "NSE: HDFCBANK", intentKey: "hdfc" },
  { category: "Sector Note", categoryColor: "warn", title: "Capital Goods — Order book momentum", desc: "Mapping 14 companies' YoY order intake. L&T leads in absolute, Siemens in growth %.", time: "3d ago", sources: "32 sources", extra: "14 tickers" },
  { category: "MF Holdings", categoryColor: "info", title: "Adani Group — MF positioning Δ", desc: "47 funds tracked. Net buying signal post-March; SBI MF top accumulator.", time: "4d ago", sources: "15 sources", extra: "47 funds", intentKey: "adani" },
  { category: "Screener", categoryColor: "pos", title: "High ROCE · Low debt · Mid-cap", desc: "62 names matched. Filters: ROCE > 25%, D/E < 0.3, m-cap 5K–25K cr.", time: "5d ago", sources: "—", extra: "62 results" },
  { category: "Quarterly Brief", categoryColor: "accent", title: "Infosys — Q4 FY26 + FY27 Guidance", desc: "Constant currency revenue growth guidance of 3–5%; margin band held at 20–22%.", time: "6d ago", sources: "11 sources", extra: "NSE: INFY" },
  { category: "Compliance", categoryColor: "warn", title: "SEBI alerts · April 2026 digest", desc: "9 actionable disclosures across watchlist. Insider trading & related party.", time: "1w ago", sources: "9 alerts", extra: "SEBI" },
];

/* ── Intent Router (client-side) ── */
export function routeIntent(text: string): IntentType {
  const q = text.toLowerCase();
  if (/dcf|model|scenario|valuation|target price|fair value/.test(q)) return "dcf";
  if (/compare|peer|vs|side by side|benchmark/.test(q)) return "compare";
  if (/screen|filter|criteria|roce|cagr|d\/e|debt-to-equity/.test(q)) return "screen";
  if (/news|sentiment|headline/.test(q)) return "news";
  if (/mutual fund|mf|holding|amc/.test(q)) return "mf";
  if (/sebi|compliance|alert|insider/.test(q)) return "compliance";
  return "summary";
}

/* ── Recent chat → query mapping ── */
export const RECENT_CHAT_QUERIES: Record<string, string> = {
  reliance: "Summarise Reliance Q4 FY26 with KPIs and flag anomalies",
  it: "Compare TCS, Infosys, Wipro and HCLTech on growth and margins",
  hdfc: "Build scenarios for HDFC AMC",
  adani: "Show mutual fund holdings of Adani Ports over last 4 quarters",
  tata: "Build a DCF for Tata Motors with bull/base/bear scenarios",
  sbi: "Analyse SBI's asset quality and NIM trend over the last 8 quarters",
  itc: "What's the impact of the ITC hotels demerger on valuation?",
  infy: "Summarise Infosys large-deal TCV and FY26 guidance",
  maruti: "Break down Maruti Suzuki volume and realisation trends",
  bajaj: "Track Bajaj Finance AUM growth and credit costs",
  ltim: "Why are LTIMindtree operating margins compressing?",
  sunpharma: "Review Sun Pharma's US specialty pipeline and key risks",
  dmart: "Explain DMart store-level economics and same-store sales growth",
  zomato: "Assess Zomato's unit economics and path to profitability",
  ntpc: "Evaluate NTPC's renewable capex plan and funding mix",
  airtel: "Trend Bharti Airtel ARPU and subscriber additions",
};
