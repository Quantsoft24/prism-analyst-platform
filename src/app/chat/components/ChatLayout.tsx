"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

import { cn } from "@/lib/utils";
import { type IntentConfig, type IntentType } from "@/lib/mockData";
import { useAuthUser } from "@/lib/auth/useAuthUser";
import QuotaNotice from "@/components/QuotaNotice";
import ShareModal from "@/components/ShareModal";
import { useToast } from "@/components/Toast";
import ClarificationCard from "./ClarificationCard";
import TaskChecklist from "./TaskChecklist";
import FilingPdfViewer, { type FilingPdfSource } from "./FilingPdfViewer";
import { toolLabel } from "./toolLabels";
import {
  downloadTextFile,
  messagesToMarkdown,
  slugifyFilename,
} from "@/lib/chat/exportMarkdown";
import { messagesToPdf } from "@/lib/chat/exportPdf";
import { stripAnswerMeta } from "@/lib/chat/answerMeta";
import {
  useClearFeedback,
  useSubmitFeedback,
  type MessageFeedback,
} from "@/lib/api/conversations";
import type { Citation, DeepDiveSuggestion, FinalFinancials } from "@/lib/api/chat";
import type {
  AgentThought,
  AssistantChart,
  ChatMessage,
  Phase,
  RunMeta,
  ToolCallState,
} from "@/hooks/useChat";

import styles from "./ChatLayout.module.css";

/* ── Props ─────────────────────────────────────────────────────────────── */

interface ChatLayoutProps {
  messages: ChatMessage[];
  intentConfig: IntentConfig;
  /** Auto-detected intent (from useChat → routeIntent). Drives which
   *  segmented-control tab the Research-mode banner highlights. */
  activeIntent: IntentType | null;
  showWorkspace: boolean;
  phase: Phase;
  runMeta: RunMeta;
  onFollowUp: (q: string) => void;
  onStop: () => void;
  onRetry: () => void;
  /** Answer the agent's structured clarification (sends the pick back into the
   *  same session). */
  onRespondClarification: (answer: string) => void;
}

/* Lets a deeply-nested CitationMarker open a filing PDF in the workspace drawer
 * (the citation→exact-page deep link) without threading a callback through every
 * render layer. Provided by ChatLayout; null elsewhere (falls back to a new tab). */
const FilingPdfContext = createContext<((source: FilingPdfSource) => void) | null>(null);

/** Does this citation point at a filing PDF we can deep-link into? */
function isFilingDeepLink(c: Citation | undefined): c is Citation & { url: string } {
  return !!c && c.source_kind === "filing" && !!c.url;
}

/* ── Citation popover ──────────────────────────────────────────────────
 * A `[n]` marker in the prose surfaces a hover/focus card with the matching
 * Citation's label, source kind, date, and (if present) a link. Filing
 * citations open the PDF at the cited page IN-APP (Report drawer); others open
 * the source in a new tab. Pure CSS hover/focus — no Radix needed. */

function CitationMarker({
  index,
  citation,
}: {
  index: number;
  citation: Citation | undefined;
}) {
  const openFilingPdf = useContext(FilingPdfContext);
  const deepLink = isFilingDeepLink(citation) && !!openFilingPdf;
  const openPdf = () => {
    if (isFilingDeepLink(citation) && openFilingPdf) {
      openFilingPdf({ url: citation.url, page: citation.page ?? null, label: citation.label });
    }
  };

  return (
    <span className={styles.citeWrap} tabIndex={0}>
      {deepLink ? (
        // Filing → open the PDF at the cited page inside the workspace.
        <button
          type="button"
          className={cn(styles.cite, styles.citeLink)}
          onClick={openPdf}
          aria-describedby={`cite-${index}`}
          title={`Open PDF: ${citation!.label}`}
        >
          {index}
        </button>
      ) : citation?.url ? (
        // Non-filing → opens the original reference in a new tab.
        <a
          className={cn(styles.cite, styles.citeLink)}
          href={citation.url}
          target="_blank"
          rel="noreferrer noopener"
          aria-describedby={`cite-${index}`}
          title={`Open: ${citation.label}`}
        >
          {index}
        </a>
      ) : (
        <span
          className={styles.cite}
          aria-describedby={`cite-${index}`}
          title={citation?.label ?? `Source ${index}`}
        >
          {index}
        </span>
      )}
      {citation && (
        <span
          id={`cite-${index}`}
          role="tooltip"
          className={styles.citePopover}
        >
          <span className={styles.citePopoverLabel}>{citation.label}</span>
          <span className={styles.citePopoverMeta}>
            <span className={styles.citePopoverKind}>{citation.source_kind}</span>
            {citation.page != null && <span>· p.{citation.page}</span>}
            {citation.as_of && <span>· {citation.as_of}</span>}
          </span>
          {deepLink ? (
            <button type="button" className={styles.citePopoverLink} onClick={openPdf}>
              Open PDF at p.{citation!.page ?? 1} ↗
            </button>
          ) : (
            citation.url && (
              <a
                href={citation.url}
                target="_blank"
                rel="noreferrer noopener"
                className={styles.citePopoverLink}
              >
                Open source ↗
              </a>
            )
          )}
        </span>
      )}
    </span>
  );
}

const _normCite = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Find the evidence-derived filing citation behind an inline `[Company | p.N]`
 *  marker, so the marker can deep-link to that PDF page. Matches on page (a
 *  strong signal) + company-name overlap; falls back to same-page. */
function findFilingCitation(
  citations: Citation[],
  company: string,
  page: number,
): (Citation & { url: string }) | undefined {
  const nc = _normCite(company);
  const samePage = citations.filter(
    (c): c is Citation & { url: string } =>
      c.source_kind === "filing" && !!c.url && c.page === page,
  );
  return (
    samePage.find((c) => {
      const nl = _normCite(c.label);
      return nl.includes(nc) || nc.includes(nl.replace(/p\d+$/, ""));
    }) ?? samePage[0]
  );
}

/** Inline `[Company | p.N]` citation in the answer prose — including COMBINED
 *  markers like `[Company | p.44, p.45, p.14]` (the composer sometimes groups
 *  pages). Renders a SINGLE clean numbered badge + hover popover for the fact
 *  (the first page that resolves to a source), exactly like stock-chat's `[n]`
 *  — NOT a noisy string of per-page badges + `p.N` text. The full per-fact
 *  evidence (every page) lives on the /bmc canvas. */
function FilingCiteMarker({
  company,
  pages,
  citations,
}: {
  company: string;
  pages: number[];
  citations: Citation[];
}) {
  for (const page of pages) {
    const cite = findFilingCitation(citations, company, page);
    if (cite) {
      return <CitationMarker index={citations.indexOf(cite) + 1} citation={cite} />;
    }
  }
  // None of the pages resolved to a source — one compact muted marker.
  return (
    <sup className={styles.citeInlineText} title={`${company} · pp. ${pages.join(", ")}`}>
      p.{pages[0]}
    </sup>
  );
}

/** Split a text run on citation markers — numeric `[n]` and inline
 *  `[Company | p.N]` (incl. multi-page `[Company | p.5, p.10]`) — render each
 *  clickable. */
function renderTextWithCitations(
  text: string,
  citations: Citation[],
): React.ReactNode[] {
  const parts = text.split(/(\[\d+\]|\[[^\]|]+\|[^\]]*?\d\])/g);
  return parts.map((part, i) => {
    const numMatch = part.match(/^\[(\d+)\]$/);
    if (numMatch) {
      const n = Number(numMatch[1]);
      return (
        <CitationMarker key={i} index={n} citation={citations[n - 1]} />
      );
    }
    const fileMatch = part.match(/^\[([^\]|]+)\|([^\]]*\d)\]$/);
    if (fileMatch) {
      const pages = (fileMatch[2].match(/\d+/g) ?? []).map(Number);
      if (pages.length > 0) {
        return (
          <FilingCiteMarker
            key={i}
            company={fileMatch[1].trim()}
            pages={pages}
            citations={citations}
          />
        );
      }
    }
    return <span key={i}>{part}</span>;
  });
}

/** The "Open" affordance in a Sources list row. Filing citations open the PDF
 *  at the cited page IN the Report drawer; other sources open in a new tab. */
function SourceOpenLink({ citation }: { citation: Citation }) {
  const openFilingPdf = useContext(FilingPdfContext);
  if (!citation.url) return null;
  if (isFilingDeepLink(citation) && openFilingPdf) {
    return (
      <button
        type="button"
        className={styles.sourceLink}
        onClick={() =>
          openFilingPdf({ url: citation.url, page: citation.page ?? null, label: citation.label })
        }
      >
        Open{citation.page != null ? ` p.${citation.page}` : ""} ↗
      </button>
    );
  }
  return (
    <a href={citation.url} target="_blank" rel="noreferrer noopener" className={styles.sourceLink}>
      Open ↗
    </a>
  );
}

/* ── Fenced code block — syntax-highlighted (rehype-highlight) with a header
 *  bar carrying the language label + a per-block Copy button (GitHub pattern).
 *  Defined at module scope so its identity is stable across re-renders (a new
 *  component type each render would remount + drop the `copied` state while
 *  streaming). ───────────────────────────────────────────────────────────── */

/** Recursively gather the plain text under a hast node (the raw code to copy). */
function hastNodeText(node: unknown): string {
  const n = node as { type?: string; value?: string; children?: unknown[] } | null;
  if (!n) return "";
  if (n.type === "text") return n.value ?? "";
  if (Array.isArray(n.children)) return n.children.map(hastNodeText).join("");
  return "";
}

/** Pull the fenced language off the inner `<code class="language-x">` node. */
function hastCodeLang(node: unknown): string | null {
  const n = node as
    | { children?: Array<{ tagName?: string; properties?: { className?: unknown } }> }
    | null;
  const code = n?.children?.find((c) => c.tagName === "code");
  const cls = code?.properties?.className;
  const list = Array.isArray(cls) ? cls : [];
  const lang = list.find((c) => typeof c === "string" && c.startsWith("language-")) as
    | string
    | undefined;
  return lang ? lang.replace("language-", "") : null;
}

function CodeBlock({ node, children }: { node?: unknown; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const lang = hastCodeLang(node);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hastNodeText(node));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (insecure context / denied) — silently no-op */
    }
  };

  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeBlockHeader}>
        <span className={styles.codeLang}>{lang ?? "code"}</span>
        <button
          type="button"
          className={styles.codeCopyBtn}
          onClick={copy}
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

/** ReactMarkdown component overrides — paragraphs / lists / inline + citation
 * markers. Closes over the citations list so paragraphs can resolve [n] refs. */
type MdProps = { children?: React.ReactNode };
type MdAnchorProps = MdProps & { href?: string };

function makeMarkdownComponents(citations: Citation[]) {
  function withCites(children: React.ReactNode): React.ReactNode {
    // Walk children: for each string node, replace [n] with CitationMarker.
    const out: React.ReactNode[] = [];
    React.Children.forEach(children, (child, i) => {
      if (typeof child === "string") {
        out.push(...renderTextWithCitations(child, citations));
      } else {
        out.push(<React.Fragment key={`mc-${i}`}>{child}</React.Fragment>);
      }
    });
    return out;
  }
  return {
    p: ({ children }: MdProps) => <p>{withCites(children)}</p>,
    li: ({ children }: MdProps) => <li>{withCites(children)}</li>,
    em: ({ children }: MdProps) => <em>{withCites(children)}</em>,
    strong: ({ children }: MdProps) => <strong>{withCites(children)}</strong>,
    // Comparison tables (GFM) — resolve citations inside cells too, so a
    // `[Company | p.N]` in a table cell is still a clickable PDF deep-link.
    td: ({ children }: MdProps) => <td>{withCites(children)}</td>,
    th: ({ children }: MdProps) => <th>{withCites(children)}</th>,
    a: ({ href, children }: MdAnchorProps) => (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    ),
    // Fenced code → highlighted block with a language label + Copy button.
    pre: CodeBlock,
  };
}

/* ── Answer block — markdown + confidence chip + copy + citation list ──── */

function AnswerBlock({
  text,
  citations,
  shimmer,
  structured,
}: {
  text: string;
  citations: Citation[];
  shimmer: boolean;
  structured:
    | { confidence?: "high" | "medium" | "low"; data_freshness?: string | null; financials?: FinalFinancials | null }
    | null;
}) {
  const components = React.useMemo(
    () => makeMarkdownComponents(citations),
    [citations],
  );

  const freshness = structured?.data_freshness;
  const financials = structured?.financials;

  return (
    <div className={styles.answerBlock}>
      <div className={cn(styles.msgBodyText, styles.answerProse)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
          components={components}
        >
          {text}
        </ReactMarkdown>
        {shimmer && <span className={styles.streamCursor} />}
      </div>
      {/* Structured numeric result (financials_query) — value card / chart /
          tables under the prose. Only when not shimmering (final answer). */}
      {!shimmer && financials && <FinancialsBlock fin={financials} />}
      {freshness && (
        <div className={styles.answerFooter}>
          <div className={styles.answerChips}>
            <span className={styles.freshnessChip} title="Earliest source date">
              as of {freshness}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Format a financial number compactly — prefer the service's own `display`
 *  string; else render the value with its unit (₹ cr / % / x). */
function finNum(value: number | null | undefined, unit?: string | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const u = (unit ?? "").trim();
  const n = Math.abs(value) >= 1000
    ? value.toLocaleString("en-IN", { maximumFractionDigits: 0 })
    : value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (u === "%") return `${n}%`;
  if (u.startsWith("₹")) return `₹${n}${u.slice(1) ? " " + u.slice(1) : ""}`;
  return u ? `${n} ${u}` : n;
}

/** Tiny dependency-free SVG line+area chart for a financial trend (period→value).
 *  Scales to its container (viewBox), token-themed via CSS classes. */
function FinLineChart({ series }: { series: { period: string; value: number }[] }) {
  const W = 580, H = 150, padX = 12, padT = 14, padB = 26;
  const n = series.length;
  const vals = series.map((s) => s.value ?? 0);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || Math.abs(max) || 1;
  const x = (i: number) => (n <= 1 ? W / 2 : padX + (i / (n - 1)) * (W - 2 * padX));
  const y = (v: number) => padT + (1 - (v - min) / span) * (H - padT - padB);
  const base = H - padB;
  const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.value ?? 0).toFixed(1)}`);
  const line = `M ${pts.join(" L ")}`;
  const area = `M ${x(0).toFixed(1)},${base} L ${pts.join(" L ")} L ${x(n - 1).toFixed(1)},${base} Z`;
  // For >8 points, label every other to avoid crowding.
  const labelEvery = n > 8 ? 2 : 1;
  return (
    <svg className={styles.finChart} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trend chart">
      {n > 1 && <path className={styles.finChartArea} d={area} />}
      {n > 1 && <path className={styles.finChartLine} d={line} />}
      {series.map((s, i) => (
        <circle key={`d${i}`} className={styles.finChartDot} cx={x(i)} cy={y(s.value ?? 0)} r={3.2} />
      ))}
      {series.map((s, i) => {
        // Always label the first + last point; thin the middle when crowded.
        if (i !== 0 && i !== n - 1 && i % labelEvery !== 0) return null;
        // Anchor edges inward so they don't clip the SVG viewport.
        const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
        return (
          <text key={`t${i}`} className={styles.finChartLabel} x={x(i)} y={H - 9} textAnchor={anchor}>
            {s.period}
          </text>
        );
      })}
    </svg>
  );
}

/** Deterministic structured render of a `financials_query` result — value card,
 *  trend line-chart, comparison/ranking bar-charts, or a statement table. Renders
 *  by which array is populated (compare can carry `operation:"lookup"`), NOT the
 *  op label. The agent's prose answer stays above; this is the auditable data. */
/** Compact value for a bar label — prefer the service's display but drop the
 *  long "(₹X lakh cr)" parenthetical so it fits the bar's value column. */
function finBarValue(d: { value: number; display?: string }, unit?: string | null): string {
  if (d.display) return d.display.split(" (")[0].trim();
  return finNum(d.value, unit);
}

/** Vertical bars — for comparing a FEW short-labelled categories on one metric.
 *  Sign-aware fill (negative → neg color). */
function FinVBars({ items, unit }: { items: { label: string; value: number; display?: string }[]; unit?: string | null }) {
  const max = Math.max(...items.map((d) => Math.abs(d.value || 0)), 1);
  return (
    <div className={styles.finVBars}>
      {items.map((d, i) => (
        <div key={i} className={styles.finVBar}>
          <span className={styles.finVBarVal}>{finBarValue(d, unit)}</span>
          <span className={styles.finVBarTrack}>
            <span
              className={styles.finVBarFill}
              style={{
                height: `${Math.max(3, (Math.abs(d.value || 0) / max) * 100)}%`,
                background: d.value < 0 ? "var(--neg)" : "var(--accent)",
              }}
            />
          </span>
          <span className={styles.finVBarLabel} title={d.label}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars — for rankings (sorted) or MANY / long-named categories.
 *  Optional rank index. Sign-aware fill. */
function FinHBars({
  items, unit, ranked,
}: { items: { label: string; value: number; display?: string; rank?: number }[]; unit?: string | null; ranked?: boolean }) {
  const max = Math.max(...items.map((d) => Math.abs(d.value || 0)), 1);
  return (
    <div className={styles.finBars}>
      {items.map((d, i) => (
        <div key={i} className={styles.finRankRow}>
          {ranked && <span className={styles.finRank}>{d.rank ?? i + 1}</span>}
          <span className={styles.finRankName} title={d.label}>{d.label}</span>
          <span className={styles.finBarTrack}>
            <span
              className={styles.finBarFill}
              style={{
                width: `${Math.max(3, (Math.abs(d.value || 0) / max) * 100)}%`,
                background: d.value < 0 ? "var(--neg)" : "var(--accent)",
              }}
            />
          </span>
          <span className={styles.finBarVal}>{finBarValue(d, unit)}</span>
        </div>
      ))}
    </div>
  );
}

/** Radial gauge — for a single bounded percentage (margin / ROE / ratio %). */
function FinGauge({ value, label, sub }: { value: number; label: string; sub?: string | null }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 34;
  const circ = 2 * Math.PI * r;
  return (
    <div className={styles.finGaugeWrap}>
      <svg className={styles.finGauge} viewBox="0 0 90 90" role="img" aria-label={`${label} gauge`}>
        <circle className={styles.finGaugeTrack} cx="45" cy="45" r={r} />
        <circle
          className={styles.finGaugeFill}
          cx="45" cy="45" r={r}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct / 100)}
          transform="rotate(-90 45 45)"
        />
        <text className={styles.finGaugeNum} x="45" y="49" textAnchor="middle">{finNum(value, "%")}</text>
      </svg>
      <div className={styles.finGaugeMeta}>
        <div className={styles.finValueLabel}>{label}</div>
        {sub && <div className={styles.finValuePeriod}>{sub}</div>}
      </div>
    </div>
  );
}

/** Does this financials result render as an actual CHART (vs a value card /
 *  statement table)? Used to decide what surfaces in the workspace Charts tab. */
function isFinChart(fin: FinalFinancials): boolean {
  return (
    (fin.series?.length ?? 0) > 0 ||
    (fin.comparison?.length ?? 0) > 0 ||
    (fin.ranking?.length ?? 0) > 0 ||
    (fin.value != null && fin.field?.unit === "%")
  );
}

function FinancialsBlock({ fin }: { fin: FinalFinancials }) {
  const unit = fin.field?.unit ?? null;

  // 1) TIME SERIES → a LINE chart (≥3 points) or vertical bars (2 points).
  //    Time-ordered data reads best as a line; 2 points aren't a line.
  if (fin.series && fin.series.length > 0) {
    const cap = `${fin.field?.label ?? "Trend"}${fin.company?.name ? ` · ${fin.company.name}` : ""}`;
    const long = fin.series.length >= 3;
    return (
      <div className={styles.finBlock}>
        <div className={styles.finCaption}>{cap}</div>
        {long ? (
          <FinLineChart series={fin.series} />
        ) : (
          <FinVBars items={fin.series.map((s) => ({ label: s.period, value: s.value }))} unit={unit} />
        )}
        {long && (
          <table className={styles.finTable}><tbody>
            {fin.series.map((s, i) => (
              <tr key={i}>
                <td className={styles.finTableName}>{s.period}</td>
                <td className={styles.finTableVal}>{finNum(s.value, unit)}</td>
              </tr>
            ))}
          </tbody></table>
        )}
      </div>
    );
  }

  // 2) CATEGORICAL (comparison / ranking) → a BAR chart. Orientation chosen from
  //    the data: rankings (sorted) and many/long-named sets go HORIZONTAL; a few
  //    short-labelled companies go VERTICAL.
  const ranked = !!(fin.ranking && fin.ranking.length);
  const cat = ranked
    ? fin.ranking!.map((r) => ({ label: r.name ?? "", value: r.value ?? 0, display: r.display, rank: r.rank }))
    : fin.comparison && fin.comparison.length
      ? fin.comparison.map((r) => ({ label: r.name ?? "", value: r.value ?? 0 }))
      : null;
  if (cat && cat.length) {
    const longest = Math.max(...cat.map((d) => d.label.length), 0);
    const horizontal = ranked || cat.length > 6 || longest > 12;
    return (
      <div className={styles.finBlock}>
        <div className={styles.finCaption}>
          {ranked
            ? fin.field?.label ?? "Ranking"
            : `${fin.field?.label ?? "Comparison"}${fin.comparison?.[0]?.period ? ` · ${fin.comparison[0].period}` : ""}`}
        </div>
        {horizontal ? <FinHBars items={cat} unit={unit} ranked={ranked} /> : <FinVBars items={cat} unit={unit} />}
      </div>
    );
  }

  // 3) STATEMENT → line-item table (balance sheet / P&L).
  if (fin.line_items && fin.line_items.length > 0) {
    return (
      <div className={styles.finBlock}>
        <div className={styles.finCaption}>
          {fin.company?.name ? `${fin.company.name} — ` : ""}Statement{fin.period ? ` · ${fin.period}` : ""}
        </div>
        <table className={styles.finTable}><tbody>
          {fin.line_items.map((li, i) => (
            <tr key={i}>
              <td className={styles.finTableName}>{li.label ?? li.key}</td>
              <td className={styles.finTableVal}>{li.display ?? finNum(li.value, li.unit ?? unit)}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
    );
  }

  // 4) SINGLE VALUE → a GAUGE for a bounded percentage (margin/ROE/ratio %),
  //    otherwise a value card.
  if (fin.value != null) {
    const label = `${fin.field?.label ?? "Value"}${fin.company?.name ? ` · ${fin.company.name}` : ""}`;
    if (unit === "%" && fin.value >= 0 && fin.value <= 100) {
      return (
        <div className={styles.finBlock}>
          <FinGauge value={fin.value} label={label} sub={fin.period} />
        </div>
      );
    }
    return (
      <div className={styles.finBlock}>
        <div className={styles.finValueCard}>
          <div className={styles.finValueLabel}>{label}</div>
          <div className={styles.finValueNum}>{finNum(fin.value, unit)}</div>
          {fin.period && <div className={styles.finValuePeriod}>{fin.period}</div>}
        </div>
      </div>
    );
  }

  return null;
}

/* ── Format helpers ────────────────────────────────────────────────────── */

function formatLatency(ms: number | null): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function formatArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args);
  if (entries.length === 0) return "(no args)";
  return entries
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(", ");
}

function formatTokensCost(meta: RunMeta): string | null {
  if (meta.input_tokens == null && meta.output_tokens == null) return null;
  const tokens = `${(meta.input_tokens ?? 0).toLocaleString()} / ${(
    meta.output_tokens ?? 0
  ).toLocaleString()} tok`;
  if (!meta.cost_usd) return tokens;
  return `${tokens} · $${meta.cost_usd.toFixed(4)}`;
}

const NEXT_ACTION_HINTS: Record<string, string> = {
  ask_user_to_retry_later: "Try again in a moment",
  try_alternate_tool: "Trying alternative…",
  ask_user_to_clarify: "Needs clarification",
  give_up_gracefully: "Couldn't recover",
};

/* ── Tool step — lightweight inline activity row (Claude-style) ────────── */

function ToolStep({
  tool,
  expanded,
  onToggle,
}: {
  tool: ToolCallState;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isError = tool.status === "error";
  const isRunning = tool.status === "running";
  const label = toolLabel(tool.tool, isError ? "error" : isRunning ? "running" : "done");

  return (
    <div
      className={cn(
        styles.step,
        isRunning && styles.stepRunning,
        isError && styles.stepError,
        expanded && styles.stepExpanded,
      )}
    >
      <button
        type="button"
        className={styles.stepHeader}
        onClick={onToggle}
        aria-expanded={expanded}
        title={tool.tool}
      >
        <span
          className={cn(
            styles.stepGlyph,
            isRunning && styles.stepGlyphRunning,
            !isRunning && !isError && styles.stepGlyphDone,
            isError && styles.stepGlyphError,
          )}
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isRunning ? 2 : 2.5}>
            {isRunning ? (
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            ) : isError ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <polyline points="20 6 9 17 4 12" />
            )}
          </svg>
        </span>
        <span className={styles.stepLabel}>
          {label}
          {tool.retry_attempt > 0 && (
            <span className={styles.stepRetry} title="Retried">
              {" "}
              ↻{tool.retry_attempt}
            </span>
          )}
        </span>
        {tool.freshness && (
          <span className={styles.stepFresh} title={`Source: ${tool.freshness.source}`}>
            as of {tool.freshness.as_of ?? "n/a"}
          </span>
        )}
        {!isRunning && <span className={styles.stepTime}>{formatLatency(tool.latency_ms)}</span>}
        <svg
          className={cn(styles.stepChevron, expanded && styles.stepChevronOpen)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {/* Surface the error on the collapsed row so failures aren't hidden. */}
      {isError && !expanded && tool.error && (
        <div className={styles.stepErrorLine}>{tool.error}</div>
      )}

      {expanded && (
        <div className={styles.stepBody}>
          <div className={styles.stepField}>
            <span className={styles.stepFieldLabel}>Input</span>
            <span className={styles.stepCode}>
              <HighlightedArgs args={tool.args} />
            </span>
          </div>
          <div className={styles.stepField}>
            <span className={styles.stepFieldLabel}>{isError ? "Error" : "Output"}</span>
            {isError ? (
              <div>
                <span className={cn(styles.stepCode, styles.stepCodeError)}>
                  {tool.error ?? "tool failed"}
                </span>
                {(tool.error_code || tool.next_action) && (
                  <div className={styles.stepErrorChips}>
                    {tool.error_code && (
                      <span className={styles.errorCodeChip}>{tool.error_code}</span>
                    )}
                    {tool.next_action && (
                      <span className={styles.nextActionChip}>
                        {NEXT_ACTION_HINTS[tool.next_action] ?? tool.next_action}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <span className={styles.stepCode}>{tool.result_summary ?? "(empty)"}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Render a tool's args dict as colored JSON — keys in info color, string
 * values in pos, numeric in accent. Matches the Lakshya mockup's pattern
 * (.tool-call-value .key/.str/.num). */
function HighlightedArgs({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args);
  if (entries.length === 0) {
    return <span className={styles.punct}>{"{}"}</span>;
  }
  return (
    <span>
      <span className={styles.punct}>{"{ "}</span>
      {entries.map(([k, v], i) => (
        <React.Fragment key={k}>
          <span className={styles.key}>{k}</span>
          <span className={styles.punct}>: </span>
          {renderJsonValue(v)}
          {i < entries.length - 1 && (
            <span className={styles.punct}>, </span>
          )}
        </React.Fragment>
      ))}
      <span className={styles.punct}>{" }"}</span>
    </span>
  );
}

function renderJsonValue(v: unknown): React.ReactNode {
  if (typeof v === "string") {
    return <span className={styles.str}>{JSON.stringify(v)}</span>;
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return <span className={styles.num}>{String(v)}</span>;
  }
  if (v === null) {
    return <span className={styles.punct}>null</span>;
  }
  if (Array.isArray(v)) {
    return (
      <span>
        <span className={styles.punct}>[</span>
        {v.map((item, i) => (
          <React.Fragment key={i}>
            {renderJsonValue(item)}
            {i < v.length - 1 && <span className={styles.punct}>, </span>}
          </React.Fragment>
        ))}
        <span className={styles.punct}>]</span>
      </span>
    );
  }
  // Object — recursive
  return (
    <span>
      <HighlightedArgs args={v as Record<string, unknown>} />
    </span>
  );
}

/* ── Thinking block — agent's reasoning, collapsible ──────────────────── */

function ThinkingBlock({ thoughts, active }: { thoughts: AgentThought[]; active: boolean }) {
  const [open, setOpen] = useState(active);
  // Expanded while the agent is thinking; auto-collapse to a one-line summary
  // once the answer (or tools) take over — click to re-open.
  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);
  if (thoughts.length === 0) return null;
  const label = active
    ? "Thinking…"
    : `Thought · ${thoughts.length} step${thoughts.length === 1 ? "" : "s"}`;
  return (
    <div className={cn(styles.thinkingBlock, active && styles.thinkingActive)}>
      <button
        className={styles.thinkingBlockHeader}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{label}</span>
        <svg
          className={cn(styles.thinkingChevron, open && styles.thinkingChevronOpen)}
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <ul className={styles.thinkingList}>
          {thoughts.map((t, i) => (
            <li key={i} className={styles.thinkingItem}>
              <span className={styles.thinkingKind}>{t.kind}</span>
              <span>{t.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Per-answer feedback (👍/👎) ─────────────────────────────────────────────
 *  Beside Copy in the answer footer. 👍 records +1; 👎 records -1 immediately
 *  and opens an optional reason picker (chips + free text). Re-rating upserts on
 *  the backend (keyed by agent_run_id). The pressed state restores on replay. */

const FEEDBACK_REASONS = [
  "Inaccurate",
  "Incomplete",
  "Wrong source",
  "Not helpful",
  "Other",
] as const;

function FeedbackControls({
  agentRunId,
  initial,
}: {
  agentRunId: string | null;
  initial: MessageFeedback | null;
}) {
  const { toast } = useToast();
  const submit = useSubmitFeedback();
  const clear = useClearFeedback();
  const [rating, setRating] = useState<1 | -1 | null>(initial?.rating ?? null);
  const [reasons, setReasons] = useState<string[]>(initial?.reasons ?? []);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the reason picker on an outside click (mirrors the menu pattern).
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  // No run id (a turn that never carried one) or a mock/demo run (no real row
  // to rate) → no feedback target.
  if (!agentRunId || agentRunId.startsWith("mock-")) return null;

  const persist = (r: 1 | -1, rs: string[], c: string, onOk?: () => void) => {
    submit.mutate(
      { agentRunId, rating: r, reasons: rs, comment: c.trim() || null },
      {
        onSuccess: () => onOk?.(),
        onError: () => toast("Couldn't save your feedback", "error"),
      },
    );
  };

  // Toggle a rating back to neutral (industry-standard: click the active thumb
  // again to remove your rating). Clears the persisted row server-side.
  const clearRating = () => {
    setRating(null);
    setReasons([]);
    setComment("");
    setPickerOpen(false);
    clear.mutate(
      { agentRunId },
      { onError: () => toast("Couldn't remove your feedback", "error") },
    );
  };

  const onThumbUp = () => {
    if (rating === 1) {
      clearRating(); // un-like
      return;
    }
    setPickerOpen(false);
    setRating(1);
    setReasons([]);
    setComment("");
    persist(1, [], "", () => toast("Thanks for the feedback", "success"));
  };

  const onThumbDown = () => {
    if (rating === -1) {
      clearRating(); // un-dislike (and close the reason form)
      return;
    }
    // Record the down-vote immediately; reasons/comment are optional detail.
    setRating(-1);
    setReasons([]);
    setComment("");
    persist(-1, [], "");
    setPickerOpen(true); // open the reason form once (never toggles on re-click)
  };

  const toggleReason = (reason: string) =>
    setReasons((rs) =>
      rs.includes(reason) ? rs.filter((x) => x !== reason) : [...rs, reason],
    );

  const submitDetail = () => {
    persist(-1, reasons, comment, () => {
      toast("Thanks — we'll use this to improve", "success");
    });
    setPickerOpen(false);
  };

  return (
    <div className={styles.feedbackGroup} ref={wrapRef}>
      <button
        type="button"
        className={cn(
          styles.feedbackBtn,
          rating === 1 && styles.feedbackBtnUpActive,
        )}
        onClick={onThumbUp}
        aria-pressed={rating === 1}
        aria-label="Good answer"
        title="Good answer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 10v12" />
          <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
        </svg>
      </button>
      <button
        type="button"
        className={cn(
          styles.feedbackBtn,
          rating === -1 && styles.feedbackBtnDownActive,
        )}
        onClick={onThumbDown}
        aria-pressed={rating === -1}
        aria-expanded={pickerOpen}
        aria-label="Bad answer"
        title="Bad answer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 14V2" />
          <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
        </svg>
      </button>

      {pickerOpen && (
        <div className={styles.feedbackPicker} role="dialog" aria-label="What went wrong?">
          <div className={styles.feedbackPickerTitle}>What went wrong?</div>
          <div className={styles.feedbackChips}>
            {FEEDBACK_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                className={cn(
                  styles.feedbackChip,
                  reasons.includes(reason) && styles.feedbackChipActive,
                )}
                onClick={() => toggleReason(reason)}
                aria-pressed={reasons.includes(reason)}
              >
                {reason}
              </button>
            ))}
          </div>
          <textarea
            className={styles.feedbackComment}
            placeholder="Add details (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={2000}
            rows={3}
          />
          <div className={styles.feedbackActions}>
            <button
              type="button"
              className={styles.feedbackCancel}
              onClick={() => setPickerOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.feedbackSubmit}
              onClick={submitDetail}
              disabled={submit.isPending}
            >
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Deep-dive "Explore further" chips ──────────────────────────────────────
 *  Compact chips that deep-link a chat answer into a dedicated tool interface.
 *  The list is curated server-side (rule-based; see backend deep_dive.py); here
 *  we just map each ``action`` → a route + icon via ACTION_ROUTES and seed the
 *  lightweight context params the route already supports. Unknown actions are
 *  dropped silently, so the backend can ship a new tool registry-first without
 *  a frontend deploy. To add a tool: add ONE entry to ACTION_ROUTES. */

const ACTION_ROUTES: Record<
  DeepDiveSuggestion["action"],
  { href: (ctx: Record<string, string | number>) => string; icon: React.ReactNode }
> = {
  bmc: {
    href: (c) => (c.ticker ? `/bmc?ticker=${encodeURIComponent(String(c.ticker))}` : "/bmc"),
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
      </svg>
    ),
  },
  stock_dashboard: {
    href: (c) =>
      c.security_id != null
        ? `/stocks?security=${encodeURIComponent(String(c.security_id))}`
        : "/stocks",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" />
      </svg>
    ),
  },
  news: {
    href: (c) => (c.company ? `/news?company=${encodeURIComponent(String(c.company))}` : "/news"),
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4h13v16H4zM17 8h3v10a2 2 0 0 1-2 2M8 8h5M8 12h5M8 16h3" />
      </svg>
    ),
  },
  regulatory: {
    href: () => "/regulatory?view=library",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" />
      </svg>
    ),
  },
  portfolio: {
    href: () => "/portfolio",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
  },
};

function DeepDiveActions({ actions }: { actions?: DeepDiveSuggestion[] }) {
  // Drop any action we don't have a route for (graceful degradation — a newer
  // backend may emit an action this client doesn't know yet).
  const items = (actions ?? []).filter((a) => a.action in ACTION_ROUTES);
  if (items.length === 0) return null;
  return (
    <div className={styles.deepDive}>
      <span className={styles.deepDiveLabel}>Explore</span>
      {items.map((a, i) => {
        const def = ACTION_ROUTES[a.action];
        return (
          <Link key={`${a.action}-${i}`} href={def.href(a.context ?? {})} className={styles.deepDiveChip}>
            {def.icon}
            <span>{a.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

/* ── Answer footer — sources toggle + open-report on one row; the expanded
 *  source list drops full-width below (no horizontal cramming). ─────────── */

function AnswerFooter({
  citations,
  tools,
  showWorkspace,
  onOpenReport,
  text,
  agentRunId,
  feedback,
}: {
  citations: Citation[];
  tools: ToolCallState[];
  showWorkspace: boolean;
  onOpenReport: () => void;
  text: string;
  agentRunId: string | null;
  feedback: MessageFeedback | null;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const dataSources = tools.filter((t) => t.freshness);
  const total = citations.length + dataSources.length;

  const handleCopy = async () => {
    try {
      // Plain answer + citation footnotes appended as markdown.
      const footnotes = citations.length
        ? "\n\n---\n" +
          citations
            .map((c, i) => `[${i + 1}] ${c.label}${c.url ? ` — ${c.url}` : ""}`)
            .join("\n")
        : "";
      await navigator.clipboard.writeText(text + footnotes);
      toast("Answer copied", "success");
    } catch {
      toast("Copy failed", "error");
    }
  };

  return (
    <div className={styles.answerFooterBar}>
      <div className={styles.answerFooterRow}>
        {total > 0 && (
          <button
            type="button"
            className={cn(styles.footerToggle, open && styles.footerToggleOpen)}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            {total} source{total === 1 ? "" : "s"}
            <svg
              className={cn(styles.footerChevron, open && styles.footerChevronOpen)}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
        {showWorkspace && (
          <button type="button" className={styles.footerReport} onClick={onOpenReport}>
            Open report ↗
          </button>
        )}
        <button
          type="button"
          className={cn(styles.copyBtn, styles.footerCopy)}
          onClick={handleCopy}
          aria-label="Copy answer to clipboard"
          title="Copy"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copy
        </button>
        <FeedbackControls agentRunId={agentRunId} initial={feedback} />
      </div>
      {open && total > 0 && (
        <div className={styles.sourcesList}>
          {citations.map((c, i) => (
            <div key={`cite-${i}`} className={styles.sourceRow}>
              <span className={styles.sourceNum}>{i + 1}</span>
              <div className={styles.sourceMain}>
                <div className={styles.sourceTitle}>{c.label}</div>
                <div className={styles.sourceMeta}>
                  <span className={styles.sourceKindTag}>{c.source_kind}</span>
                  {c.as_of && <span>· {c.as_of}</span>}
                  {c.url && (
                    <>
                      <span>·</span>
                      <SourceOpenLink citation={c} />
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
          {dataSources.map((t) => (
            <div key={t.call_id} className={cn(styles.sourceRow, styles.sourceRowData)}>
              <span className={cn(styles.sourceNum, styles.sourceNumMuted)}>·</span>
              <div className={styles.sourceMain}>
                <div className={styles.sourceTitle}>{t.freshness?.source}</div>
                <div className={styles.sourceMeta}>
                  <span className={styles.sourceKindTag}>via {toolLabel(t.tool, "done")}</span>
                  {t.freshness?.as_of && <span>· {t.freshness.as_of}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Thinking dots (initial placeholder, before the first event) ──────── */

function ThinkingDots() {
  return (
    <span className={styles.thinking}>
      <span className={styles.thinkingDot} />
      <span className={styles.thinkingDot} />
      <span className={styles.thinkingDot} />
    </span>
  );
}

/* ── Agent activity — thinking + tool steps. Live (expanded) while the agent
 *  works; collapses to a one-line "Worked through N steps" summary once the
 *  turn is done, so the answer leads and the work recedes (Claude-style). ── */

function AgentActivity({
  thoughts,
  tools,
  active,
  expandedTools,
  onToggleTool,
}: {
  thoughts: AgentThought[];
  tools: ToolCallState[];
  active: boolean;
  expandedTools: Set<string>;
  onToggleTool: (id: string) => void;
}) {
  const [showSteps, setShowSteps] = useState(active);
  useEffect(() => {
    setShowSteps(active);
  }, [active]);

  const hasThoughts = thoughts.length > 0;
  const hasTools = tools.length > 0;
  if (!hasThoughts && !hasTools) return null;
  const errCount = tools.filter((t) => t.status === "error").length;

  return (
    <div className={styles.activity}>
      {hasThoughts && <ThinkingBlock thoughts={thoughts} active={active} />}
      {hasTools &&
        (showSteps ? (
          <>
            <div className={styles.steps}>
              {tools.map((tool) => (
                <ToolStep
                  key={tool.call_id}
                  tool={tool}
                  expanded={expandedTools.has(tool.call_id)}
                  onToggle={() => onToggleTool(tool.call_id)}
                />
              ))}
            </div>
            {!active && (
              <button
                type="button"
                className={styles.activityCollapse}
                onClick={() => setShowSteps(false)}
              >
                Hide steps
              </button>
            )}
          </>
        ) : (
          <button type="button" className={styles.activitySummary} onClick={() => setShowSteps(true)}>
            <span className={styles.activitySummaryGlyph}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            Worked through {tools.length} step{tools.length === 1 ? "" : "s"}
            {errCount > 0 ? ` · ${errCount} failed` : ""}
            <svg
              className={styles.activitySummaryChevron}
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        ))}
    </div>
  );
}

/* ── Workspace pane — multi-tab right-side panel (Lakshya mockup pattern)
 * Three tabs, each driven by real agent state — no MOCK arrays.
 *   • Report   — auto-generated research note built from the agent's final
 *                answer + extracted KPIs from compute_* tool results
 *   • Tools    — full tool call timeline (input / output / latency / freshness)
 *   • Sources  — numbered citations list with source kind + as_of + URL
 * ──────────────────────────────────────────────────────────────────────── */

type WorkspaceTab = "report" | "charts" | "tools" | "sources";

interface WorkspacePaneProps {
  messages: ChatMessage[];
  intentConfig: IntentConfig;
  runMeta: RunMeta;
}

/** Parse a "= NN.NN%" / "= NN.NNx" style result_summary into a structured
 * KPI when the underlying tool was a compute_* call. Returns null otherwise. */
function tryExtractKpi(tool: ToolCallState): { label: string; value: string; unit: string } | null {
  if (!tool.tool.startsWith("compute_")) return null;
  if (tool.status !== "done" || !tool.result_summary) return null;
  // result_summary shape from runner: "= 12.5%" or "= 0.84x"
  const m = tool.result_summary.match(/^=\s*(-?[\d.,]+)\s*([%x]?)$/);
  if (!m) return null;
  const labels: Record<string, string> = {
    compute_growth: "Growth",
    compute_cagr: "CAGR",
    compute_margin: "Margin",
    compute_ratio: "Ratio",
    compute_percent_of: "% of total",
  };
  return {
    label: labels[tool.tool] ?? tool.tool.replace("compute_", ""),
    value: m[1],
    unit: m[2] || "",
  };
}

function WorkspacePane({ messages, intentConfig, runMeta }: WorkspacePaneProps) {
  const [activeTab, setActiveTab] = React.useState<WorkspaceTab>("report");

  // Pull the latest assistant turn — the workspace mirrors its state.
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const allTools = messages.flatMap((m) => m.toolCalls ?? []);
  const doneTools = allTools.filter((t) => t.status === "done");
  const errorTools = allTools.filter((t) => t.status === "error");
  // Aggregate sources across the WHOLE conversation (consistent with Tools /
  // Charts), deduped — so the Sources tab isn't limited to the last answer.
  const seenCite = new Set<string>();
  const citations = messages
    .flatMap((m) => m.structured?.citations ?? [])
    .filter((c) => {
      const k = `${c.url ?? ""}|${c.page ?? ""}|${c.label ?? ""}`;
      if (seenCite.has(k)) return false;
      seenCite.add(k);
      return true;
    });
  const kpis = allTools
    .map(tryExtractKpi)
    .filter((k): k is { label: string; value: string; unit: string } => k !== null);

  // Empty state — nothing to show yet.
  if (!lastAssistant && allTools.length === 0) {
    return (
      <div className={styles.workspaceEmpty}>
        <div className={styles.workspaceEmptyTitle}>Workspace</div>
        <div className={styles.workspaceEmptyText}>
          The workspace fills in as the agent runs tools, gathers evidence,
          and cites sources. Ask a question to get started.
        </div>
      </div>
    );
  }

  // Charts surfaced on this turn (across all assistant messages)
  const allCharts = messages.flatMap((m) => m.charts ?? []);

  // Financials visuals from the conversation → also surface in the Charts tab,
  // each paired with the question that produced it (the nearest preceding user
  // message). This links the inline answers to the workspace Charts tab.
  const finCharts = messages
    .map((m, i) => {
      const fin = m.role === "assistant" ? m.structured?.financials : null;
      if (!fin || !isFinChart(fin)) return null;
      let q = "";
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j].role === "user") { q = messages[j].text; break; }
      }
      return { key: m.agentRunId ?? `fin-${i}`, title: q || fin.field?.label || "Financials", fin };
    })
    .filter((x): x is { key: string; title: string; fin: FinalFinancials } => x !== null);

  const chartsCount = allCharts.length + finCharts.length;

  const tabs: { id: WorkspaceTab; label: string; count?: number }[] = [
    { id: "report", label: "Report" },
    { id: "charts", label: "Charts", count: chartsCount },
    { id: "tools", label: "Tools", count: allTools.length },
    { id: "sources", label: "Sources", count: citations.length },
  ];

  return (
    <div className={styles.workspacePaneInner}>
      {/* ── Tabs row ──────────────────────────────────────────── */}
      <div className={styles.wsTabs}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn(
              styles.wsTab,
              activeTab === t.id && styles.wsTabActive,
            )}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={styles.wsTabCount}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ───────────────────────────────────────── */}
      <div className={styles.wsContent}>
        {activeTab === "report" && (
          <ReportView
            answer={lastAssistant}
            kpis={kpis}
            intentTitle={intentConfig.title}
            runMeta={runMeta}
            toolsSummary={{
              total: allTools.length,
              ok: doneTools.length,
              failed: errorTools.length,
            }}
          />
        )}
        {activeTab === "charts" && <ChartsView charts={allCharts} financials={finCharts} />}
        {activeTab === "tools" && <ToolsView tools={allTools} />}
        {activeTab === "sources" && (
          <SourcesView citations={citations} tools={allTools} />
        )}
      </div>
    </div>
  );
}

/** Report tab — research-note formatted view. */
function ReportView({
  answer,
  kpis: legacyKpis,
  intentTitle,
  runMeta,
  toolsSummary,
}: {
  answer: ChatMessage | undefined;
  /** KPIs extracted from compute_* tools — legacy fallback. The
   *  preferred source is ``answer.structured.kpis`` (FinalAnswer). */
  kpis: { label: string; value: string; unit: string }[];
  intentTitle: string;
  runMeta: RunMeta;
  toolsSummary: { total: number; ok: number; failed: number };
}) {
  const text = answer?.text || answer?.streamedText || "";
  const structured = answer?.structured ?? null;
  const confidence = structured?.confidence;
  const freshness = structured?.data_freshness;
  const citations = structured?.citations ?? [];

  // Prefer structured KPIs from FinalAnswer.kpis; fall back to the
  // compute_* extraction so older code paths still surface something.
  const structuredKpis = structured?.kpis ?? [];
  const kpiRows =
    structuredKpis.length > 0
      ? structuredKpis.map((k) => ({
          label: k.label,
          value: k.value,
          unit: k.unit ?? "",
          cite: k.cite_label ?? null,
        }))
      : legacyKpis.map((k) => ({
          label: k.label,
          value: k.value,
          unit: k.unit,
          cite: "compute · NRE",
        }));

  const sections = structured?.sections ?? [];

  return (
    <div className={styles.reportCard}>
      <div className={styles.reportCardHeader}>
        <div className={styles.reportEyebrow}>— Research note · Auto-generated</div>
        <div className={styles.reportCardTitle}>{intentTitle}</div>
        <div className={styles.reportCardMeta}>
          {confidence && (
            <span
              className={cn(
                styles.confidenceChip,
                confidence === "high" && styles.confidenceHigh,
                confidence === "medium" && styles.confidenceMedium,
                confidence === "low" && styles.confidenceLow,
              )}
            >
              ● {confidence} confidence
            </span>
          )}
          {freshness && <span>· as of {freshness}</span>}
          {runMeta.cost_usd !== null && runMeta.cost_usd > 0 && (
            <span>· ${runMeta.cost_usd.toFixed(4)}</span>
          )}
          <span>
            · {toolsSummary.ok}/{toolsSummary.total} tools succeeded
          </span>
        </div>
      </div>

      <div className={styles.reportCardBody}>
        {kpiRows.length > 0 && (
          <div className={styles.kpiGrid}>
            {kpiRows.slice(0, 4).map((kpi, i) => (
              <div key={i} className={styles.kpiCard}>
                <div className={styles.kpiLabel}>{kpi.label}</div>
                <div className={styles.kpiValue}>
                  {kpi.value}
                  {kpi.unit && (
                    <span className={styles.kpiUnit}>{kpi.unit}</span>
                  )}
                </div>
                {kpi.cite && (
                  <span className={styles.kpiCite}>{kpi.cite}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Structured financials (chart / table) for this answer. */}
        {structured?.financials && <FinancialsBlock fin={structured.financials} />}

        {/* Named sections from FinalAnswer.sections — Executive summary,
            Anomaly flags, etc. Anomaly callouts get the warn accent. */}
        {sections.map((s, i) => (
          <div
            key={i}
            className={cn(
              styles.reportSection,
              s.kind === "anomaly" && styles.reportSectionAnomaly,
            )}
          >
            <h4 className={styles.reportSectionTitle}>{s.title}</h4>
            <div className={styles.reportProse}>
              {renderTextWithCitations(s.body, citations)}
            </div>
          </div>
        ))}

        {/* Always show the prose Summary if there's text AND no
            structured sections cover it. Avoids double-rendering. */}
        {text && sections.length === 0 && (
          <div className={styles.reportSection}>
            <h4 className={styles.reportSectionTitle}>Summary</h4>
            <div className={styles.reportProse}>
              {renderTextWithCitations(text, citations)}
            </div>
          </div>
        )}

        {!text && sections.length === 0 && (
          <div className={styles.reportPending}>
            Drafting your research note…
          </div>
        )}
      </div>
    </div>
  );
}

/** Tools tab — vertical timeline. Reuses ToolCallItem cards from the chat. */
function ToolsView({ tools }: { tools: ToolCallState[] }) {
  if (tools.length === 0) {
    return (
      <div className={styles.wsEmptyState}>
        No tool calls yet. The agent will populate this as it runs.
      </div>
    );
  }
  return (
    <div className={styles.wsToolsTimeline}>
      {tools.map((t) => (
        <WorkspaceToolRow key={t.call_id} tool={t} />
      ))}
    </div>
  );
}

function WorkspaceToolRow({ tool }: { tool: ToolCallState }) {
  const isError = tool.status === "error";
  const isRunning = tool.status === "running";
  return (
    <div className={cn(styles.wsToolRow, isError && styles.wsToolRowError)}>
      <div className={styles.wsToolRowHeader}>
        <span
          className={cn(
            styles.wsToolStatus,
            isRunning && styles.wsToolStatusRunning,
            !isRunning && !isError && styles.wsToolStatusOk,
            isError && styles.wsToolStatusErr,
          )}
        >
          {isRunning ? "●" : isError ? "✕" : "✓"}
        </span>
        <span className={styles.wsToolName}>{tool.tool}</span>
        {tool.freshness && (
          <span className={styles.freshnessChip}>
            as of {tool.freshness.as_of ?? "n/a"}
          </span>
        )}
        <span className={styles.wsToolLatency}>
          {tool.latency_ms != null
            ? tool.latency_ms < 1000
              ? `${tool.latency_ms}ms`
              : `${(tool.latency_ms / 1000).toFixed(1)}s`
            : "—"}
        </span>
      </div>
      <div className={styles.wsToolBody}>
        <div className={styles.wsToolField}>
          <span className={styles.wsToolFieldLabel}>Input</span>
          <code className={styles.wsToolFieldCode}>
            {Object.entries(tool.args)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(", ") || "(no args)"}
          </code>
        </div>
        <div className={styles.wsToolField}>
          <span className={styles.wsToolFieldLabel}>
            {isError ? "Error" : "Output"}
          </span>
          <code
            className={cn(
              styles.wsToolFieldCode,
              isError && styles.wsToolFieldCodeError,
            )}
          >
            {isError
              ? tool.error ?? "tool failed"
              : tool.result_summary ?? "(empty)"}
          </code>
        </div>
      </div>
    </div>
  );
}

/** Sources tab — numbered citations from the structured final answer +
 *  any data-bearing tool calls that yielded a freshness signal. */
/** Charts tab — one card per ChartEvent, hand-rolled SVG to keep deps light. */
function ChartsView({
  charts,
  financials = [],
}: {
  charts: AssistantChart[];
  financials?: { key: string; title: string; fin: FinalFinancials }[];
}) {
  if (charts.length === 0 && financials.length === 0) {
    return (
      <div className={styles.wsEmptyState}>
        No charts yet. Charts surface when an answer returns a series, comparison,
        ranking, or ratio — ask a financial question (e.g. &quot;Infosys EPS over
        5 years&quot; or &quot;top 10 IT companies by revenue&quot;).
      </div>
    );
  }
  return (
    <div className={styles.wsChartsList}>
      {/* Financials visuals from the conversation, newest interactions last. */}
      {financials.map((f) => (
        <div key={f.key} className={styles.wsChartItem}>
          <div className={styles.wsChartQuestion}>{f.title}</div>
          <FinancialsBlock fin={f.fin} />
        </div>
      ))}
      {/* Legacy tool-emitted line/area charts (AssistantChart). */}
      {charts.length > 0 && (
        <div className={styles.chartsGrid}>
          {charts.map((c) => (
            <ChartCard key={c.chart_id} chart={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChartCard({ chart }: { chart: AssistantChart }) {
  const W = 400;
  const H = 100;
  const PAD_X = 14;
  const PAD_Y = 18;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_Y * 2;
  const ys = chart.points.map((p) => p.y);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const range = yMax - yMin || 1;
  const n = chart.points.length;

  const xy = (i: number, y: number) => {
    const x = PAD_X + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const yy = PAD_Y + (innerH - ((y - yMin) / range) * innerH);
    return { x, y: yy };
  };

  const points = chart.points.map((p, i) => xy(i, p.y));
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = chart.kind === "area"
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)},${H - 4} L ${points[0].x.toFixed(1)},${H - 4} Z`
    : null;

  const last = points[points.length - 1];

  return (
    <div className={styles.chartCard}>
      <div className={styles.chartCardHeader}>
        <div className={styles.chartCardEyebrow}>{chart.title}</div>
        <div className={styles.chartCardCurrent}>
          <span className={styles.chartCardValue}>
            {chart.unit && !chart.unit.match(/^[%x]/) && (
              <span className={styles.chartCardUnit}>{chart.unit}</span>
            )}
            {chart.current_value}
            {chart.unit && chart.unit.match(/^[%x]/) && (
              <span className={styles.chartCardUnit}>{chart.unit}</span>
            )}
          </span>
          {chart.current_delta && (
            <span
              className={cn(
                styles.chartCardDelta,
                chart.delta_kind === "pos" && styles.chartCardDeltaPos,
                chart.delta_kind === "neg" && styles.chartCardDeltaNeg,
              )}
            >
              {chart.current_delta}
            </span>
          )}
        </div>
      </div>
      <svg
        className={styles.chartSvg}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={chart.title}
      >
        <defs>
          <linearGradient id={`grad-${chart.chart_id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* dashed grid lines */}
        <line x1="0" y1={PAD_Y} x2={W} y2={PAD_Y} stroke="var(--line)" strokeDasharray="2 4" />
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--line)" strokeDasharray="2 4" />
        <line x1="0" y1={H - PAD_Y} x2={W} y2={H - PAD_Y} stroke="var(--line)" strokeDasharray="2 4" />
        {/* area fill (area kind only) */}
        {areaPath && <path d={areaPath} fill={`url(#grad-${chart.chart_id})`} />}
        {/* line */}
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* point dots */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === points.length - 1 ? 3.5 : 2.5}
            fill="var(--accent)"
            stroke={i === points.length - 1 ? "var(--bg-elev)" : "none"}
            strokeWidth={i === points.length - 1 ? 2 : 0}
          />
        ))}
        {/* end value label above the last point */}
        {last && (
          <text
            x={last.x}
            y={last.y - 8}
            fontSize="9"
            textAnchor="middle"
            fill="var(--ink-mute)"
            fontFamily="var(--font-mono)"
          >
            {chart.current_value}
          </text>
        )}
        {/* x-axis labels */}
        {chart.points.map((p, i) => (
          <text
            key={i}
            x={xy(i, p.y).x}
            y={H - 2}
            fontSize="9"
            textAnchor="middle"
            fill="var(--ink-mute)"
            fontFamily="var(--font-mono)"
          >
            {p.x}
          </text>
        ))}
      </svg>
    </div>
  );
}

function SourcesView({
  citations,
  tools,
}: {
  citations: Citation[];
  tools: ToolCallState[];
}) {
  // Tool calls with freshness become "data sources" even when no citation
  // was emitted by the LLM — they prove the agent reached real data.
  const dataSources = tools.filter((t) => t.freshness);

  if (citations.length === 0 && dataSources.length === 0) {
    return (
      <div className={styles.wsEmptyState}>
        No sources yet. The agent populates this as it cites filings, web
        results, and tool outputs.
      </div>
    );
  }

  return (
    <div className={styles.sourceListPane}>
      <div className={styles.sourceListEyebrow}>
        Sources · {citations.length + dataSources.length} total
        {citations.length > 0 && ` · ${citations.length} cited`}
      </div>
      {citations.map((c, i) => (
        <div key={`cite-${i}`} className={styles.sourceCard}>
          <span className={styles.sourceCite}>cite {i + 1}</span>
          <div className={styles.sourceCardTitle}>{c.label}</div>
          <div className={styles.sourceCardMeta}>
            <span className={styles.sourceKindTag}>{c.source_kind}</span>
            {c.as_of && (
              <>
                <span className={styles.sourceDot}>·</span>
                <span>{c.as_of}</span>
              </>
            )}
            {c.url && (
              <>
                <span className={styles.sourceDot}>·</span>
                <SourceOpenLink citation={c} />
              </>
            )}
          </div>
        </div>
      ))}
      {dataSources.length > 0 && (
        <>
          <div
            className={cn(styles.sourceListEyebrow, styles.sourceListEyebrowSecondary)}
          >
            Data reached but not cited
          </div>
          {dataSources.map((t, i) => (
            <div key={t.call_id} className={cn(styles.sourceCard, styles.sourceCardData)}>
              <span className={cn(styles.sourceCite, styles.sourceCiteMuted)}>
                data {i + 1}
              </span>
              <div className={styles.sourceCardTitle}>
                {t.freshness?.source}
              </div>
              <div className={styles.sourceCardMeta}>
                <span className={styles.sourceKindTag}>via {t.tool}</span>
                {t.freshness?.as_of && (
                  <>
                    <span className={styles.sourceDot}>·</span>
                    <span>{t.freshness.as_of}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ── Export menu — Markdown or PDF (header dropdown). ───────────────────── */

function ExportMenu({ title, messages }: { title: string; messages: ChatMessage[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Title from the first user message (falls back to the conversation title).
  const exportTitle = messages.find((m) => m.role === "user")?.text ?? title;
  const asMarkdown = () => {
    downloadTextFile(`${slugifyFilename(exportTitle)}.md`, messagesToMarkdown(exportTitle, messages));
    setOpen(false);
  };
  const asPdf = () => {
    messagesToPdf(exportTitle, messages); // opens the browser print → Save as PDF
    setOpen(false);
  };

  return (
    <div className={styles.exportWrap} ref={ref}>
      <button
        type="button"
        className={styles.reportBtn}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Export this conversation"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Export
        <svg className={cn(styles.exportChevron, open && styles.exportChevronOpen)} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className={styles.exportMenu} role="menu">
          <button type="button" role="menuitem" className={styles.exportItem} onClick={asMarkdown}>
            Markdown (.md)
          </button>
          <button type="button" role="menuitem" className={styles.exportItem} onClick={asPdf}>
            PDF
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────────────────── */

export default function ChatLayout({
  messages,
  intentConfig,
  showWorkspace,
  phase,
  runMeta,
  onFollowUp,
  onStop,
  onRetry,
  onRespondClarification,
}: ChatLayoutProps) {
  const authUser = useAuthUser();
  const userFirstName = (authUser.name || "You").split(" ")[0];
  const userInitial = (authUser.initials || "Y").charAt(0);
  const [followUpText, setFollowUpText] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // The filing PDF a citation deep-linked into (opens in the workspace drawer).
  const [pdfSource, setPdfSource] = useState<FilingPdfSource | null>(null);
  const openFilingPdf = React.useCallback((source: FilingPdfSource) => {
    setPdfSource(source);
    setDrawerOpen(true);
  }, []);
  const closeDrawer = React.useCallback(() => {
    setDrawerOpen(false);
    setPdfSource(null);
  }, []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // call_id → expanded? Tool steps start collapsed; click to inspect I/O.
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  // Is the thread scrolled to (near) the bottom? Drives both the auto-scroll
  // gate and the floating "jump to latest" button.
  const [atBottom, setAtBottom] = useState(true);

  const onThreadScroll = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // 80px slack so "almost at the bottom" still counts (avoids a flickering
    // button on sub-pixel/rounding gaps during streaming).
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(near);
  }, []);

  const scrollToBottom = React.useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Auto-scroll on new content — but ONLY when the user is already at the
  // bottom. If they've scrolled up to read scrollback, don't yank them down
  // mid-stream; the floating button lets them jump back when ready.
  useEffect(() => {
    if (atBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, phase, atBottom]);

  const toggleTool = (call_id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(call_id)) next.delete(call_id);
      else next.add(call_id);
      return next;
    });
  };

  const handleFollowUp = () => {
    const trimmed = followUpText.trim();
    if (!trimmed) return;
    onFollowUp(trimmed);
    setFollowUpText("");
  };

  const handleFollowUpKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleFollowUp();
    }
  };

  const isRunning = phase !== "done";
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const toolCount = lastAssistant?.toolCalls?.length ?? 0;
  const cost = formatTokensCost(runMeta);

  // Pending clarification — the agent paused for input. Rendered DOCKED above the
  // composer ("tied to the chat box"); it vanishes once the user answers (a new
  // turn starts → phase leaves "done" / a new message has no clarification).
  const lastMsg = messages.length ? messages[messages.length - 1] : undefined;
  const activeClarification =
    !isRunning && lastMsg?.clarification ? lastMsg.clarification : null;

  // What is the agent doing right now? — drives the header + composer status.
  const runningTool = lastAssistant?.toolCalls?.find((t) => t.status === "running");
  const workingLabel =
    phase === "thinking"
      ? "Thinking…"
      : phase === "tools"
        ? runningTool
          ? toolLabel(runningTool.tool, "running")
          : "Using tools…"
        : phase === "answering"
          ? "Writing the answer…"
          : "Working…";

  return (
    <FilingPdfContext.Provider value={openFilingPdf}>
    <div className={cn(styles.chatRoot, drawerOpen && styles.chatRootSplit)}>
      <div className={styles.chat}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerMain}>
            <span className={styles.headerTitle}>{intentConfig.title}</span>
            <div className={styles.headerStatus}>
              {isRunning && <span className={styles.statusPulse} />}
              <span>
                {isRunning
                  ? workingLabel
                  : `Done · ${toolCount} tool${toolCount === 1 ? "" : "s"}${cost ? ` · ${cost}` : ""}`}
              </span>
            </div>
          </div>
          <div className={styles.headerActions}>
            {isRunning && (
              <button className={styles.stopBtn} onClick={onStop} aria-label="Stop the agent" title="Stop">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop
              </button>
            )}
            {!isRunning && messages.some((m) => m.role === "assistant") && (
              <ExportMenu title={intentConfig.title} messages={messages} />
            )}
            {!isRunning && runMeta.session_id && messages.some((m) => m.role === "assistant") && (
              <button
                type="button"
                className={styles.reportBtn}
                onClick={() => setShareOpen(true)}
                title="Share a read-only link to this conversation"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                Share
              </button>
            )}
            {showWorkspace && (
              <button
                type="button"
                className={styles.reportBtn}
                onClick={() => setDrawerOpen(true)}
                title="Open the research workspace"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                Report
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Conversation (single centered column) ── */}
      <div className={styles.scroll} ref={scrollRef} onScroll={onThreadScroll}>
        <div className={styles.thread}>
          {messages.map((msg, mi) => {
            if (msg.role === "user") {
              return (
                <div key={mi} className={styles.msgUser}>
                  <div className={styles.msgRole}>
                    <div className={styles.msgRoleIconUser}>{userInitial}</div>
                    {userFirstName}
                  </div>
                  <div className={styles.msgUserBody}>{msg.text}</div>
                </div>
              );
            }

            const isLast = mi === messages.length - 1;
            const streaming = isLast && phase === "answering";
            const thinkingActive = isLast && (phase === "thinking" || phase === "tools");
            const citations = msg.structured?.citations ?? [];
            const tools = msg.toolCalls ?? [];
            const answerText = msg.streamedText || msg.text;
            // While streaming, hide the trailing <answer_meta> block so the raw
            // JSON never flashes before the final swap. Final/replayed text is
            // already server-split, so this is a no-op there.
            const displayText = streaming ? stripAnswerMeta(answerText) : answerText;

            return (
              <div key={mi} className={styles.msgAssistant}>
                <div className={styles.msgRole}>
                  <div className={styles.msgRoleIconAssistant}>P</div>
                  PRISM
                  {msg.isThinking && tools.length === 0 && !msg.thoughts?.length && <ThinkingDots />}
                </div>

                {/* Live task checklist (the agent's plan, ticks off as it works) */}
                {msg.plan && msg.plan.length > 0 && <TaskChecklist steps={msg.plan} />}

                {/* Inline agent activity: thinking → tool steps (collapses
                    to a one-line summary once the turn is done) */}
                <AgentActivity
                  thoughts={msg.thoughts ?? []}
                  tools={tools}
                  active={thinkingActive}
                  expandedTools={expandedTools}
                  onToggleTool={toggleTool}
                />

                {/* Answer */}
                {msg.showAnswer && (msg.streamedText || msg.text) && (
                  <>
                    <AnswerBlock
                      text={displayText}
                      citations={citations}
                      shimmer={streaming}
                      structured={msg.structured ?? null}
                    />
                    {!streaming && (
                      <AnswerFooter
                        citations={citations}
                        tools={tools}
                        showWorkspace={showWorkspace}
                        onOpenReport={() => setDrawerOpen(true)}
                        text={msg.streamedText || msg.text}
                        agentRunId={msg.agentRunId ?? null}
                        feedback={msg.feedback ?? null}
                      />
                    )}
                    {/* Continue generating — the model hit its output cap and the
                        answer is cut off. Only on the latest answer, idle. */}
                    {!streaming &&
                      !isRunning &&
                      mi === messages.length - 1 &&
                      msg.truncated && (
                        <div className={styles.continueRow}>
                          <button
                            type="button"
                            className={styles.continueBtn}
                            onClick={() => onFollowUp("Continue from where you left off.")}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            Continue generating
                          </button>
                          <span className={styles.continueHint}>
                            The previous answer was cut off at the length limit.
                          </span>
                        </div>
                      )}
                    {/* Suggested follow-ups — only on the latest answer, idle. */}
                    {!streaming &&
                      !isRunning &&
                      mi === messages.length - 1 &&
                      (msg.structured?.suggestions?.length ?? 0) > 0 && (
                        <div className={styles.suggestions}>
                          {msg.structured!.suggestions!.map((s, si) => (
                            <button
                              key={si}
                              type="button"
                              className={styles.suggestionChip}
                              onClick={() => onFollowUp(s)}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}

                    {/* "Explore further" deep-dive chips — curated server-side
                        (rule-based) handoffs into the tool UIs (BMC / stock
                        dashboard / news / regulatory / portfolio). Distinct from
                        the follow-up chips above; rendered per-answer (incl.
                        replay) since each links to that answer's topic. */}
                    {!streaming && (
                      <DeepDiveActions actions={msg.structured?.suggested_actions} />
                    )}
                  </>
                )}

                {/* Clarification renders DOCKED above the composer (not inline) —
                    see the activeClarification block near the composer. */}

                {/* Empty-answer fallback */}
                {phase === "done" &&
                  !msg.error &&
                  !msg.clarification &&
                  !msg.isClarificationTurn &&
                  !msg.streamedText &&
                  !msg.text &&
                  tools.length > 0 && (
                    <div className={styles.errorBlock} role="status">
                      <div className={styles.errorBlockTitle}>
                        The agent finished without writing an answer.
                      </div>
                      <div className={styles.errorBlockMessage}>
                        {tools.length} tool{tools.length === 1 ? "" : "s"} ran but the model returned
                        no text — usually a sign the query was ambiguous. Try a more specific question
                        (a ticker like RELIANCE, a fiscal period like FY24, or a focused sub-question).
                      </div>
                      <button className={styles.retryBtn} onClick={onRetry} type="button">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="23 4 23 10 17 10" />
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                        Retry
                      </button>
                    </div>
                  )}

                {/* Inline error w/ retry — persistent, not a toast */}
                {msg.error && (
                  <div className={styles.errorBlock} role="alert">
                    <div className={styles.errorBlockTitle}>
                      {msg.error.code === "timeout"
                        ? "The agent took too long to respond."
                        : msg.error.code === "user_aborted"
                          ? "Stopped."
                          : "Something went wrong."}
                    </div>
                    <div className={styles.errorBlockMessage}>{msg.error.message}</div>
                    {msg.error.retriable && (
                      <button className={styles.retryBtn} onClick={onRetry} type="button">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="23 4 23 10 17 10" />
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                        Retry
                      </button>
                    )}
                  </div>
                )}

                {/* Brief follow-up thinking line (no tools/thoughts yet) */}
                {msg.isThinking && tools.length === 0 && !msg.thoughts?.length && (
                  <div className={styles.msgBodyThinking}>
                    Looking that up against the current context…
                  </div>
                )}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Composer ── */}
      <div className={styles.composerWrap}>
        {/* Jump to latest — only when scrolled up off the bottom. */}
        {!atBottom && (
          <button
            type="button"
            className={styles.scrollToLatest}
            onClick={scrollToBottom}
            aria-label="Scroll to latest"
            title="Scroll to latest"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </button>
        )}
        <div className={styles.composerInner}>
          {/* Clarification form — docked right above the input, themed light/dark. */}
          {activeClarification && (
            <ClarificationCard
              key={activeClarification.agent_run_id ?? messages.length}
              clarification={activeClarification}
              onRespond={onRespondClarification}
            />
          )}
          <QuotaNotice />
          {isRunning && (
            <div className={styles.workingRow}>
              <span className={styles.workingDot} />
              <span className={styles.workingLabel}>PRISM is working · {workingLabel}</span>
              <button type="button" className={styles.workingStop} onClick={onStop}>
                Stop
              </button>
            </div>
          )}
          <div className={styles.composerField}>
            <textarea
              className={styles.composerTextarea}
              placeholder="Ask a follow-up…"
              value={followUpText}
              onChange={(e) => setFollowUpText(e.target.value)}
              onKeyDown={handleFollowUpKeyDown}
              aria-label="Follow-up question"
              disabled={isRunning}
              rows={1}
            />
            <button
              type="button"
              className={styles.composerSend}
              onClick={handleFollowUp}
              aria-label="Send follow-up"
              disabled={isRunning || !followUpText.trim()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      </div>
      {/* /.chat */}

      {/* ── Workspace — splits the screen (canvas), inline like Claude's
          Artifacts; becomes a full-screen sheet on tablet/mobile. ── */}
      {drawerOpen && (
        <>
          <div className={styles.panelBackdrop} onClick={closeDrawer} />
          <aside className={styles.workspacePanel} aria-label="Research workspace">
            <div className={styles.panelHeader}>
              <span className={styles.panelTitle}>
                {pdfSource ? "Source filing" : "Research workspace"}
              </span>
              <button
                type="button"
                className={styles.panelClose}
                onClick={closeDrawer}
                aria-label="Close workspace"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className={styles.panelBody}>
              {pdfSource ? (
                <FilingPdfViewer source={pdfSource} onClose={() => setPdfSource(null)} />
              ) : (
                <WorkspacePane messages={messages} intentConfig={intentConfig} runMeta={runMeta} />
              )}
            </div>
          </aside>
        </>
      )}
    </div>
    {runMeta.session_id && (
      <ShareModal
        sessionId={runMeta.session_id}
        label={intentConfig.title}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    )}
    </FilingPdfContext.Provider>
  );
}
