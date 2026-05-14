"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { MOCK_USER, type IntentConfig, type ToolCall } from "@/lib/mockData";
import styles from "./ChatLayout.module.css";

/* ── Mock workspace data ── */
const MOCK_KPIS = [
  { label: "Revenue", value: "₹2.74L cr", delta: "+11.8% YoY", pos: true },
  { label: "EBITDA Margin", value: "17.4%", delta: "flat QoQ", pos: true },
  { label: "PAT", value: "₹19,407 cr", delta: "+12.1% YoY", pos: true },
  { label: "Jio ARPU", value: "₹202", delta: "+3.1% QoQ", pos: true },
];

const MOCK_SOURCES = [
  { num: "1", title: "Q4 FY26 Results — BSE Filing", meta: "NSE: RELIANCE · 2 May 2026" },
  { num: "2", title: "Analyst consensus — Bloomberg", meta: "Last updated 1 May 2026" },
  { num: "3", title: "Jio Platform quarterly update", meta: "Company website · April 2026" },
];

/* ── Types ── */
interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  toolCalls?: ToolCall[];
  visibleToolCount?: number;
  showAnswer?: boolean;
  isThinking?: boolean;
  streamedText?: string;
}

interface ChatLayoutProps {
  messages: ChatMessage[];
  intentConfig: IntentConfig;
  showWorkspace: boolean;
  phase: string;
  onFollowUp: (q: string) => void;
}

/* ── Citation renderer ── */
function renderTextWithCitations(text: string): React.ReactNode[] {
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[(\d+)\]$/);
    if (match) {
      return (
        <span key={i} className={styles.cite} title={`Source ${match[1]}`}>
          {match[1]}
        </span>
      );
    }
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return boldParts.map((bp, j) => {
      if (bp.startsWith("**") && bp.endsWith("**")) {
        return <strong key={`${i}-${j}`}>{bp.slice(2, -2)}</strong>;
      }
      return <span key={`${i}-${j}`}>{bp}</span>;
    });
  });
}

/* ── Tool Call Component ── */
function ToolCallItem({ tool, visible, index }: { tool: ToolCall; visible: boolean; index: number }) {
  const [expanded, setExpanded] = useState(index === 0);

  if (!visible) return null;

  return (
    <div className={cn(styles.toolCall, expanded && styles.toolCallExpanded)} onClick={() => setExpanded(!expanded)}>
      <div className={styles.toolCallHeader}>
        <svg
          className={cn(styles.toolCallIcon, tool.running ? styles.toolCallRunning : styles.toolCallDone)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={tool.running ? 2 : 3}
        >
          {tool.running ? (
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          ) : (
            <polyline points="20 6 9 17 4 12" />
          )}
        </svg>
        <div className={styles.toolCallMeta}>
          <span className={styles.toolCallName}>{tool.name}</span>
          <span className={styles.toolCallStatus}>{tool.status}</span>
        </div>
        <span className={styles.toolCallTime}>{tool.time}</span>
        <svg className={styles.toolCallChevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
      {expanded && (
        <div className={styles.toolCallBody}>
          <div className={styles.toolCallSection}>
            <span className={styles.toolCallLabel}>Input</span>
            <span className={styles.toolCallValue}>
              <span className={styles.key}>params</span>: {"{"} auto-routed by LLM based on context {"}"}
            </span>
          </div>
          <div className={styles.toolCallSection}>
            <span className={styles.toolCallLabel}>Output</span>
            <span className={styles.toolCallValue}>→ structured data attached to workspace</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Thinking Dots ── */
function ThinkingDots() {
  return (
    <span className={styles.thinking}>
      <span className={styles.thinkingDot} />
      <span className={styles.thinkingDot} />
      <span className={styles.thinkingDot} />
    </span>
  );
}

/* ── Main Component ── */
export default function ChatLayout({ messages, intentConfig, showWorkspace, phase, onFollowUp }: ChatLayoutProps) {
  const [followUpText, setFollowUpText] = useState("");
  const [activeTab, setActiveTab] = useState(0);
  const [mobilePane, setMobilePane] = useState<"chat" | "workspace">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* Auto-scroll to bottom on any message update */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, phase]);

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

  const tabs = intentConfig.tabs;
  const toolCount = intentConfig.tools.length;

  return (
    <div className={styles.chatLayout}>
      {/* ── Left: Chat Pane ── */}
      <div className={cn(styles.chatPane, mobilePane === "workspace" && styles.chatPaneHidden)}>
        {/* Header */}
        <div className={styles.chatHeader}>
          <span className={styles.chatTitle}>{intentConfig.title}</span>
          <div className={styles.chatStatus}>
            {phase !== "done" && <span className={styles.statusPulse} />}
            {phase === "done"
              ? `Completed · ${toolCount} tools`
              : `Live · running ${toolCount} tools`}
          </div>
        </div>

        {/* Messages */}
        <div className={styles.messages}>
          {/* Mode banner */}
          <div className={styles.modeBanner}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                    <div className={styles.msgRoleIconUser}>{MOCK_USER.initials.charAt(0)}</div>
                    {MOCK_USER.name.split(" ")[0]} · just now
                  </div>
                  <div className={styles.msgUserBody}>{msg.text}</div>
                </div>
              );
            }

            /* Assistant message */
            return (
              <div key={mi} className={styles.msgAssistant}>
                <div className={styles.msgRole}>
                  <div className={styles.msgRoleIconAssistant}>P</div>
                  PRISM{" "}
                  {msg.isThinking && <ThinkingDots />}
                  {!msg.isThinking && msg.toolCalls && msg.visibleToolCount !== undefined && (
                    <span className={styles.msgRoleInfo}>
                      · running {msg.visibleToolCount}/{msg.toolCalls.length} tools
                    </span>
                  )}
                </div>

                {/* Tool calls — revealed one by one */}
                {msg.toolCalls && (
                  <div className={styles.toolCalls}>
                    {msg.toolCalls.map((tool, ti) => (
                      <ToolCallItem
                        key={ti}
                        tool={tool}
                        visible={ti < (msg.visibleToolCount || 0)}
                        index={ti}
                      />
                    ))}
                  </div>
                )}

                {/* Answer — streams in word-by-word */}
                {msg.showAnswer && msg.text && (
                  <div className={styles.msgBodyText}>
                    {renderTextWithCitations(msg.streamedText ?? msg.text)}
                    {phase === "answering" && <span className={styles.streamCursor} />}
                  </div>
                )}
                {msg.showAnswer && !msg.text && msg.toolCalls && (
                  <div className={styles.msgBodyText}>
                    {renderTextWithCitations(msg.streamedText ?? intentConfig.answer)}
                    {phase === "answering" && <span className={styles.streamCursor} />}
                  </div>
                )}

                {/* Follow-up thinking */}
                {msg.isThinking && !msg.toolCalls && (
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
            disabled={phase !== "done"}
          />
          <button className={styles.followUpSendBtn} onClick={handleFollowUp} aria-label="Send follow-up" disabled={phase !== "done"}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        {/* Mobile pane switcher */}
        <div className={styles.paneSwitcher}>
          <button className={mobilePane === "chat" ? styles.paneSwitcherBtnActive : styles.paneSwitcherBtn} onClick={() => setMobilePane("chat")}>Chat</button>
          <button className={mobilePane === "workspace" ? styles.paneSwitcherBtnActive : styles.paneSwitcherBtn} onClick={() => setMobilePane("workspace")}>Workspace</button>
        </div>
      </div>

      {/* ── Right: Workspace Pane ── */}
      {showWorkspace && (
        <div className={cn(styles.workspacePane, mobilePane === "workspace" && styles.workspacePaneVisible)}>
          <div className={styles.workspaceHeader}>
            <div className={styles.workspaceTabs}>
              {tabs.map((tab, i) => (
                <button key={tab} className={i === activeTab ? styles.workspaceTabActive : styles.workspaceTab} onClick={() => setActiveTab(i)}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className={styles.workspaceActions}>
              <button className={styles.workspaceActionBtn} title="Export">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export
              </button>
              <button className={styles.workspaceActionBtn} title="Save">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                Save
              </button>
            </div>
          </div>

          <div className={styles.workspaceContent}>
            <div className={styles.reportSection}>
              <div className={styles.reportTitle}>{intentConfig.title}</div>
              <div className={styles.reportMeta}>
                <span className={styles.reportBadge}>Auto-generated</span>
                <span>Generated just now</span>
                <span>{MOCK_SOURCES.length} sources</span>
              </div>
            </div>

            <div className={styles.kpiGrid}>
              {MOCK_KPIS.map((kpi, i) => (
                <div key={i} className={styles.kpiCard}>
                  <div className={styles.kpiLabel}>{kpi.label}</div>
                  <div className={styles.kpiValue}>{kpi.value}</div>
                  <div className={kpi.pos ? styles.kpiDeltaPos : styles.kpiDeltaNeg}>{kpi.delta}</div>
                </div>
              ))}
            </div>

            <div className={styles.chartContainer}>
              <div className={styles.chartTitle}>Revenue Trend — 5 Quarters</div>
              <svg className={styles.chartSvg} viewBox="0 0 400 120" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polyline fill="none" stroke="var(--accent)" strokeWidth="2" points="0,90 80,75 160,60 240,45 320,35 400,20" />
                <polygon fill="url(#areaGrad)" points="0,90 80,75 160,60 240,45 320,35 400,20 400,120 0,120" />
              </svg>
            </div>

            <div className={styles.sourceList}>
              {MOCK_SOURCES.map((src) => (
                <div key={src.num} className={styles.sourceItem}>
                  <span className={styles.sourceNum}>{src.num}</span>
                  <div>
                    <div className={styles.sourceTitle}>{src.title}</div>
                    <div className={styles.sourceMeta}>{src.meta}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.paneSwitcher}>
            <button className={mobilePane === "chat" ? styles.paneSwitcherBtnActive : styles.paneSwitcherBtn} onClick={() => setMobilePane("chat")}>Chat</button>
            <button className={mobilePane === "workspace" ? styles.paneSwitcherBtnActive : styles.paneSwitcherBtn} onClick={() => setMobilePane("workspace")}>Workspace</button>
          </div>
        </div>
      )}
    </div>
  );
}
