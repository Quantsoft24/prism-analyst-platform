"use client";

import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";
import { MOCK_USER, type IntentConfig } from "@/lib/mockData";
import { useToast } from "@/components/Toast";
import type { Citation } from "@/lib/api/chat";
import type {
  AgentThought,
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
        <svg
          className={cn(
            styles.toolCallIcon,
            isRunning && styles.toolCallRunning,
            !isRunning && !isError && styles.toolCallDone,
            isError && styles.toolCallFailed,
          )}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={isRunning ? 2 : 3}
        >
          {isRunning ? (
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          ) : isError ? (
            <>
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </>
          ) : (
            <polyline points="20 6 9 17 4 12" />
          )}
        </svg>
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
            <code className={styles.toolCallCode}>{formatArgs(tool.args)}</code>
          </div>
          <div className={styles.toolCallSection}>
            <span className={styles.toolCallLabel}>
              {isError ? "Error" : "Output"}
            </span>
            {isError ? (
              <div>
                <code className={cn(styles.toolCallCode, styles.toolCallCodeError)}>
                  {tool.error ?? "tool failed"}
                </code>
                {tool.error_code && (
                  <span className={styles.errorCodeChip}>{tool.error_code}</span>
                )}
                {tool.next_action && (
                  <span className={styles.nextActionChip}>
                    {NEXT_ACTION_HINTS[tool.next_action] ?? tool.next_action}
                  </span>
                )}
              </div>
            ) : (
              <code className={styles.toolCallCode}>
                {tool.result_summary ?? "(empty)"}
              </code>
            )}
          </div>
        </div>
      )}
    </div>
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

/* ── Workspace summary — derived from tool calls; no more MOCK arrays ── */

function WorkspaceSummary({ messages }: { messages: ChatMessage[] }) {
  // Aggregate tools across all assistant turns.
  const allTools = messages.flatMap((m) => m.toolCalls ?? []);
  const doneTools = allTools.filter((t) => t.status === "done");
  const errorTools = allTools.filter((t) => t.status === "error");
  const freshnessChips = doneTools
    .filter((t) => t.freshness)
    .slice(0, 6);

  // Pull citations from the most recent structured answer, if any.
  const latestStructured = [...messages]
    .reverse()
    .find((m) => m.structured)?.structured;
  const citations = latestStructured?.citations ?? [];

  if (allTools.length === 0) {
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

  return (
    <div className={styles.workspaceSummary}>
      <div className={styles.reportSection}>
        <div className={styles.reportTitle}>Tool activity</div>
        <div className={styles.reportMeta}>
          <span className={styles.reportBadge}>Live</span>
          <span>
            {doneTools.length} succeeded · {errorTools.length} failed
          </span>
        </div>
      </div>

      {freshnessChips.length > 0 && (
        <div className={styles.freshnessRow}>
          {freshnessChips.map((t, i) => (
            <span key={i} className={styles.freshnessChip}>
              {t.freshness?.source}: {t.freshness?.as_of ?? "n/a"}
            </span>
          ))}
        </div>
      )}

      {citations.length > 0 && (
        <div className={styles.sourceList}>
          <div className={styles.sourceListTitle}>Sources</div>
          {citations.map((c, i) => (
            <div key={i} className={styles.sourceItem}>
              <span className={styles.sourceNum}>{i + 1}</span>
              <div>
                <div className={styles.sourceTitle}>{c.label}</div>
                <div className={styles.sourceMeta}>
                  <span>{c.source_kind}</span>
                  {c.as_of && <span> · {c.as_of}</span>}
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={styles.sourceLink}
                    >
                      Open ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
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
    <div className={styles.chatLayout}>
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
          </div>
        </div>

        {/* Messages */}
        <div className={styles.messages}>
          {/* Mode banner */}
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

        {/* Follow-up composer */}
        <div className={styles.followUpComposer}>
          <div className={styles.followUpTags}>
            <span className={styles.followUpTag}>{intentConfig.contextTag}</span>
            <span className={styles.followUpTag}>all tools</span>
          </div>
          <input
            className={styles.followUpInput}
            placeholder="Follow-up question..."
            value={followUpText}
            onChange={(e) => setFollowUpText(e.target.value)}
            onKeyDown={handleFollowUpKeyDown}
            aria-label="Follow-up question"
            disabled={isRunning}
          />
          <button
            className={styles.followUpSendBtn}
            onClick={handleFollowUp}
            aria-label="Send follow-up"
            disabled={isRunning || !followUpText.trim()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
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
      {showWorkspace && (
        <div
          className={cn(
            styles.workspacePane,
            mobilePane === "workspace" && styles.workspacePaneVisible,
          )}
        >
          <div className={styles.workspaceHeader}>
            <div className={styles.workspaceTitle}>Workspace</div>
          </div>
          <div className={styles.workspaceContent}>
            <WorkspaceSummary messages={messages} />
          </div>
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
