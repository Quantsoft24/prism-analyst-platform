"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";
import { MOCK_USER, type IntentConfig, type IntentType } from "@/lib/mockData";
import { useToast } from "@/components/Toast";
import type { Citation } from "@/lib/api/chat";
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
}

/* ── Citation popover ──────────────────────────────────────────────────
 * A `[n]` marker in the prose surfaces a hover/focus card with the matching
 * Citation's label, source kind, date, and (if present) an external link.
 * Pure CSS hover/focus — no Radix needed for this one. */

function CitationMarker({
  index,
  citation,
}: {
  index: number;
  citation: Citation | undefined;
}) {
  return (
    <span className={styles.citeWrap} tabIndex={0}>
      <span
        className={styles.cite}
        aria-describedby={`cite-${index}`}
        title={citation?.label ?? `Source ${index}`}
      >
        {index}
      </span>
      {citation && (
        <span
          id={`cite-${index}`}
          role="tooltip"
          className={styles.citePopover}
        >
          <span className={styles.citePopoverLabel}>{citation.label}</span>
          <span className={styles.citePopoverMeta}>
            <span className={styles.citePopoverKind}>{citation.source_kind}</span>
            {citation.as_of && <span>· {citation.as_of}</span>}
          </span>
          {citation.url && (
            <a
              href={citation.url}
              target="_blank"
              rel="noreferrer noopener"
              className={styles.citePopoverLink}
            >
              Open source ↗
            </a>
          )}
        </span>
      )}
    </span>
  );
}

/** Split a text run on `[n]` markers and render each as a CitationMarker. */
function renderTextWithCitations(
  text: string,
  citations: Citation[],
): React.ReactNode[] {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      const n = Number(match[1]);
      return (
        <CitationMarker key={i} index={n} citation={citations[n - 1]} />
      );
    }
    return <span key={i}>{part}</span>;
  });
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
    a: ({ href, children }: MdAnchorProps) => (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    ),
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
  structured: { confidence?: "high" | "medium" | "low"; data_freshness?: string | null } | null;
}) {
  const { toast } = useToast();
  const components = React.useMemo(
    () => makeMarkdownComponents(citations),
    [citations],
  );

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

  const confidence = structured?.confidence;
  const freshness = structured?.data_freshness;

  return (
    <div className={styles.answerBlock}>
      <div
        className={cn(
          styles.msgBodyText,
          shimmer && styles.msgBodyShimmer,
          styles.answerProse,
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {text}
        </ReactMarkdown>
        {shimmer && <span className={styles.streamCursor} />}
      </div>
      {(confidence || freshness || citations.length > 0 || !shimmer) && (
        <div className={styles.answerFooter}>
          <div className={styles.answerChips}>
            {confidence && (
              <span
                className={cn(
                  styles.confidenceChip,
                  confidence === "high" && styles.confidenceHigh,
                  confidence === "medium" && styles.confidenceMedium,
                  confidence === "low" && styles.confidenceLow,
                )}
                title="Agent's self-reported confidence"
              >
                {confidence} confidence
              </span>
            )}
            {freshness && (
              <span className={styles.freshnessChip} title="Earliest source date">
                as of {freshness}
              </span>
            )}
            {citations.length > 0 && (
              <span className={styles.citeCountChip}>
                {citations.length} citation{citations.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {!shimmer && (
            <button
              type="button"
              className={styles.copyBtn}
              onClick={handleCopy}
              aria-label="Copy answer to clipboard"
              title="Copy"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </button>
          )}
        </div>
      )}
    </div>
  );
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

/* ── Tool Call card — real input / output / status / freshness ────────── */

function ToolCallItem({
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

  // Compact status line shown when collapsed.
  const headerStatus = isRunning
    ? "running…"
    : isError
      ? (tool.error ?? "error")
      : (tool.result_summary ?? "ok");

  return (
    <div
      className={cn(
        styles.toolCall,
        expanded && styles.toolCallExpanded,
        isError && styles.toolCallError,
      )}
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <div className={styles.toolCallHeader}>
        <span
          className={cn(
            styles.toolCallBadge,
            isRunning && styles.toolCallBadgeRunning,
            !isRunning && !isError && styles.toolCallBadgeDone,
            isError && styles.toolCallBadgeError,
          )}
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={isRunning ? 2 : 2.5}
          >
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
        <div className={styles.toolCallMeta}>
          <span className={styles.toolCallName}>
            {tool.tool}
            {tool.retry_attempt > 0 && (
              <span className={styles.toolCallRetry} title="Retried">
                {" "}
                ↻{tool.retry_attempt}
              </span>
            )}
          </span>
          <span className={styles.toolCallStatus}>{headerStatus}</span>
        </div>
        {tool.freshness && (
          <span
            className={styles.freshnessChip}
            title={`Source: ${tool.freshness.source}`}
          >
            as of {tool.freshness.as_of ?? "n/a"}
          </span>
        )}
        <span className={styles.toolCallTime}>
          {formatLatency(tool.latency_ms)}
        </span>
        <svg
          className={styles.toolCallChevron}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
      {expanded && (
        <div className={styles.toolCallBody}>
          <div className={styles.toolCallSection}>
            <span className={styles.toolCallLabel}>Input</span>
            <span className={styles.toolCallValue}>
              <HighlightedArgs args={tool.args} />
            </span>
          </div>
          <div className={styles.toolCallSection}>
            <span className={styles.toolCallLabel}>
              {isError ? "Error" : "Output"}
            </span>
            {isError ? (
              <div>
                <span
                  className={cn(styles.toolCallValue, styles.toolCallCodeError)}
                >
                  {tool.error ?? "tool failed"}
                </span>
                <div style={{ marginTop: 6 }}>
                  {tool.error_code && (
                    <span className={styles.errorCodeChip}>
                      {tool.error_code}
                    </span>
                  )}
                  {tool.next_action && (
                    <span className={styles.nextActionChip}>
                      {NEXT_ACTION_HINTS[tool.next_action] ?? tool.next_action}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <span className={styles.toolCallValue}>
                {tool.result_summary ?? "(empty)"}
              </span>
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

function ThinkingBlock({ thoughts }: { thoughts: AgentThought[] }) {
  const [open, setOpen] = useState(true);
  if (thoughts.length === 0) return null;
  return (
    <div className={styles.thinkingBlock}>
      <button
        className={styles.thinkingBlockHeader}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>
          Thinking · {thoughts.length} step{thoughts.length === 1 ? "" : "s"}
        </span>
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
  const citations = lastAssistant?.structured?.citations ?? [];
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

  const tabs: { id: WorkspaceTab; label: string; count?: number }[] = [
    { id: "report", label: "Report" },
    { id: "charts", label: "Charts", count: allCharts.length },
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
        <div className={styles.wsTabsSpacer} />
        <button
          type="button"
          className={styles.wsAction}
          title="Export as PDF (coming soon)"
          disabled
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export
        </button>
        <button
          type="button"
          className={styles.wsActionPrimary}
          title="Save to Reports Library (coming soon)"
          disabled
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          Save
        </button>
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
        {activeTab === "charts" && <ChartsView charts={allCharts} />}
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
function ChartsView({ charts }: { charts: AssistantChart[] }) {
  if (charts.length === 0) {
    return (
      <div className={styles.wsEmptyState}>
        No charts yet. Charts surface when a tool returns a series (price
        trend, KPI band, etc.). Real tools don&apos;t emit these today — the
        mock-mode happy path does, to validate the rendering pipeline.
      </div>
    );
  }
  return (
    <div className={styles.chartsGrid}>
      {charts.map((c) => (
        <ChartCard key={c.chart_id} chart={c} />
      ))}
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
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className={styles.sourceLink}
                >
                  Open ↗
                </a>
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

/* ── Main Component ────────────────────────────────────────────────────── */

export default function ChatLayout({
  messages,
  intentConfig,
  activeIntent,
  showWorkspace,
  phase,
  runMeta,
  onFollowUp,
  onStop,
  onRetry,
}: ChatLayoutProps) {
  const [followUpText, setFollowUpText] = useState("");
  const [mobilePane, setMobilePane] = useState<"chat" | "workspace">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // call_id → expanded? (default: first call open, others closed).
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase]);

  // Open the first tool call by default whenever a new assistant turn begins.
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role !== "assistant") return;
    const first = last.toolCalls?.[0];
    if (first && !expandedTools.has(first.call_id)) {
      setExpandedTools((prev) => new Set(prev).add(first.call_id));
    }
  }, [messages, expandedTools]);

  // Workspace pane collapse — local pref persisted across reloads.
  // Symmetric with the left-sidebar collapse pattern.
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false);
  useEffect(() => {
    try {
      setWorkspaceCollapsed(
        window.localStorage.getItem("prism.workspaceCollapsed") === "1",
      );
    } catch {
      /* ignore */
    }
  }, []);
  const toggleWorkspace = () => {
    setWorkspaceCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          "prism.workspaceCollapsed",
          next ? "1" : "0",
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const workspaceVisible = showWorkspace && !workspaceCollapsed;

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

  // Header status: prefer running/done state from phase; show tool count.
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const toolCount = lastAssistant?.toolCalls?.length ?? 0;
  const isRunning = phase !== "done";
  const cost = formatTokensCost(runMeta);

  return (
    <div
      className={cn(
        styles.chatLayout,
        !workspaceVisible && styles.chatLayoutFull,
      )}
    >
      {/* ── Left: Chat Pane ── */}
      <div
        className={cn(
          styles.chatPane,
          mobilePane === "workspace" && styles.chatPaneHidden,
        )}
      >
        {/* Header */}
        <div className={styles.chatHeader}>
          <div className={styles.chatHeaderMain}>
            <span className={styles.chatTitle}>{intentConfig.title}</span>
            <div className={styles.chatStatus}>
              {isRunning && <span className={styles.statusPulse} />}
              {phase === "done"
                ? `Completed · ${toolCount} tools`
                : `Live · ${toolCount} tool${toolCount === 1 ? "" : "s"}`}
            </div>
          </div>
          <div className={styles.chatHeaderActions}>
            {runMeta.agent_run_id && (
              <span
                className={styles.runIdPill}
                title={`run ${runMeta.agent_run_id}`}
              >
                {runMeta.agent_run_id.slice(0, 8)}
              </span>
            )}
            {cost && <span className={styles.runCostPill}>{cost}</span>}
            {isRunning ? (
              <button
                className={styles.stopBtn}
                onClick={onStop}
                aria-label="Stop the agent"
                title="Stop"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop
              </button>
            ) : null}
            {/* Workspace pane collapse — symmetric with the left sidebar's
                chevron. Hidden on mobile (the pane-switcher handles it). */}
            {showWorkspace && (
              <button
                type="button"
                className={styles.workspaceToggleBtn}
                onClick={toggleWorkspace}
                title={
                  workspaceCollapsed
                    ? "Open the workspace pane"
                    : "Collapse the workspace pane"
                }
                aria-label={
                  workspaceCollapsed
                    ? "Open workspace"
                    : "Collapse workspace"
                }
                aria-expanded={!workspaceCollapsed}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{
                    transform: workspaceCollapsed ? "rotate(180deg)" : "none",
                    transition: "transform 200ms ease",
                  }}
                >
                  <polyline points="13 17 18 12 13 7" />
                  <polyline points="6 17 11 12 6 7" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className={styles.messages}>
          {/* Mode banner — research mode label + multi-company mode tabs.
              Compare auto-activates when the intent router (mockData.ts →
              routeIntent) detects a compare query ("vs", "compare", "peer",
              "benchmark"). Watchlist is still backend-pending — kept
              disabled until the multi-ticker streaming path lands. Single
              is the default for everything else. The user can't manually
              switch modes today (the router is the single source of
              truth); a future iteration will add a click-to-override. */}
          <div className={styles.modeBanner}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
            </svg>
            <span>Research mode</span>
            <div className={styles.modeBannerTabs}>
              <button
                type="button"
                className={cn(
                  styles.modeTab,
                  activeIntent !== "compare" && styles.modeTabActive,
                )}
                aria-current={activeIntent !== "compare" ? "true" : undefined}
              >
                Single
              </button>
              <button
                type="button"
                className={cn(
                  styles.modeTab,
                  activeIntent === "compare" && styles.modeTabActive,
                )}
                aria-current={activeIntent === "compare" ? "true" : undefined}
                title="Compare mode — auto-detected from queries like 'compare X and Y', 'X vs Y', 'peer benchmark'"
              >
                Compare
              </button>
              <button
                type="button"
                className={styles.modeTab}
                disabled
                title="Watchlist mode — coming soon"
              >
                Watchlist
              </button>
            </div>
          </div>

          {messages.map((msg, mi) => {
            if (msg.role === "user") {
              return (
                <div key={mi} className={styles.msgUser}>
                  <div className={styles.msgRole}>
                    <div className={styles.msgRoleIconUser}>
                      {MOCK_USER.initials.charAt(0)}
                    </div>
                    {MOCK_USER.name.split(" ")[0]} · just now
                  </div>
                  <div className={styles.msgUserBody}>{msg.text}</div>
                </div>
              );
            }

            /* Assistant message */
            const showShimmer =
              mi === messages.length - 1 && phase === "answering";
            return (
              <div key={mi} className={styles.msgAssistant}>
                <div className={styles.msgRole}>
                  <div className={styles.msgRoleIconAssistant}>P</div>
                  PRISM{" "}
                  {msg.isThinking && <ThinkingDots />}
                  {!msg.isThinking && msg.toolCalls && msg.toolCalls.length > 0 && (
                    <span className={styles.msgRoleInfo}>
                      · {msg.toolCalls.length} tool
                      {msg.toolCalls.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>

                {/* Visible reasoning (when available) */}
                {msg.thoughts && msg.thoughts.length > 0 && (
                  <ThinkingBlock thoughts={msg.thoughts} />
                )}

                {/* Tool calls */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className={styles.toolCalls}>
                    {msg.toolCalls.map((tool) => (
                      <ToolCallItem
                        key={tool.call_id}
                        tool={tool}
                        expanded={expandedTools.has(tool.call_id)}
                        onToggle={() => toggleTool(tool.call_id)}
                      />
                    ))}
                  </div>
                )}

                {/* Answer — markdown rendered (GFM tables/lists/code),
                    with [n] markers turning into hover citation popovers. */}
                {msg.showAnswer && (msg.streamedText || msg.text) && (
                  <AnswerBlock
                    text={msg.streamedText || msg.text}
                    citations={msg.structured?.citations ?? []}
                    shimmer={showShimmer}
                    structured={msg.structured ?? null}
                  />
                )}

                {/* Defensive empty-answer fallback — the backend now
                    synthesizes a message for this case (see runner's
                    _synthesize_empty_answer_fallback), but if anything
                    slips through we still surface SOMETHING. */}
                {phase === "done" &&
                  !msg.error &&
                  !msg.streamedText &&
                  !msg.text &&
                  msg.toolCalls &&
                  msg.toolCalls.length > 0 && (
                    <div className={styles.errorBlock} role="status">
                      <div className={styles.errorBlockTitle}>
                        The agent finished without writing an answer.
                      </div>
                      <div className={styles.errorBlockMessage}>
                        {msg.toolCalls.length} tool
                        {msg.toolCalls.length === 1 ? "" : "s"} ran but the
                        model returned no text — usually a sign the query was
                        ambiguous. Try a more specific question (a ticker
                        like RELIANCE, a fiscal period like FY24, or a
                        focused sub-question).
                      </div>
                      <button
                        className={styles.retryBtn}
                        onClick={onRetry}
                        type="button"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
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
                    <div className={styles.errorBlockMessage}>
                      {msg.error.message}
                    </div>
                    {msg.error.retriable && (
                      <button
                        className={styles.retryBtn}
                        onClick={onRetry}
                        type="button"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <polyline points="23 4 23 10 17 10" />
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                        Retry
                      </button>
                    )}
                  </div>
                )}

                {/* Follow-up thinking (no tool calls scheduled yet) */}
                {msg.isThinking &&
                  (!msg.toolCalls || msg.toolCalls.length === 0) && (
                    <div className={styles.msgBodyThinking}>
                      Looking that up against the current context…
                    </div>
                  )}
              </div>
            );
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Composer — Lakshya mockup pattern: textarea + tag chips below + dark send */}
        <div className={styles.composerBar}>
          <div className={styles.composerBox}>
            <textarea
              className={styles.composerTextarea}
              placeholder="Ask a follow-up… or @-mention a tool"
              value={followUpText}
              onChange={(e) => setFollowUpText(e.target.value)}
              onKeyDown={handleFollowUpKeyDown}
              aria-label="Follow-up question"
              disabled={isRunning}
              rows={1}
            />
            <div className={styles.composerToolbar}>
              {/* contextTag chip removed 2026-05-27 — it was hardcoded
                  to "RELIANCE Q4 FY26" via mockData.INTENT_CONFIGS and
                  surfaced regardless of actual conversation context.
                  Bring back as a resolved-ticker pill driven by agent
                  state when the feature provides real value. */}
              <span className={styles.composerTag} title="All registered tools available">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                </svg>
                All tools
              </span>
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

        {/* Mobile pane switcher */}
        <div className={styles.paneSwitcher}>
          <button
            className={
              mobilePane === "chat" ? styles.paneSwitcherBtnActive : styles.paneSwitcherBtn
            }
            onClick={() => setMobilePane("chat")}
          >
            Chat
          </button>
          <button
            className={
              mobilePane === "workspace"
                ? styles.paneSwitcherBtnActive
                : styles.paneSwitcherBtn
            }
            onClick={() => setMobilePane("workspace")}
          >
            Workspace
          </button>
        </div>
      </div>

      {/* ── Right: Workspace Pane ── */}
      {workspaceVisible && (
        <div
          className={cn(
            styles.workspacePane,
            mobilePane === "workspace" && styles.workspacePaneVisible,
          )}
        >
          <WorkspacePane
            messages={messages}
            intentConfig={intentConfig}
            runMeta={runMeta}
          />
          <div className={styles.paneSwitcher}>
            <button
              className={
                mobilePane === "chat"
                  ? styles.paneSwitcherBtnActive
                  : styles.paneSwitcherBtn
              }
              onClick={() => setMobilePane("chat")}
            >
              Chat
            </button>
            <button
              className={
                mobilePane === "workspace"
                  ? styles.paneSwitcherBtnActive
                  : styles.paneSwitcherBtn
              }
              onClick={() => setMobilePane("workspace")}
            >
              Workspace
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
