"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { runChatStream, type ChatStreamHandle } from "@/lib/api/chat";
import { cn } from "@/lib/utils";

import styles from "./news.module.css";

/**
 * "Why is X moving?" — the agentic differentiator of the news page.
 *
 * Opening this drawer fires a single agent run (the same SSE chat stream the
 * chat page uses) with a focused investigation prompt. The agent has
 * news_sentiment + financials_query + stock_technicals + stock_filings tools,
 * so it composes a *cause* analysis — not just a label. We stream the tool
 * timeline + the prose answer inline. Read-only; aborts its stream on close /
 * company-change / unmount. CSS Modules.
 */

interface InvestigationDrawerProps {
  company: string | null; // null = closed
  onClose: () => void;
}

interface ToolStep {
  call_id: string;
  tool: string;
  status: "running" | "done" | "error";
}

function buildPrompt(company: string): string {
  return (
    `Why is ${company} moving in the news right now? Investigate: ` +
    `(1) the current news sentiment and the strongest positive and negative ` +
    `headlines, (2) whether any recent filings or results explain it, and ` +
    `(3) the latest price action if relevant. Give a tight cause analysis ` +
    `in 3-4 sentences, cite the sources, and be explicit if the data is thin. ` +
    `Do not give a buy/sell recommendation.`
  );
}

export default function InvestigationDrawer({ company, onClose }: InvestigationDrawerProps) {
  const [text, setText] = React.useState("");
  const [steps, setSteps] = React.useState<ToolStep[]>([]);
  const [phase, setPhase] = React.useState<"idle" | "running" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const streamRef = React.useRef<ChatStreamHandle | null>(null);

  React.useEffect(() => {
    if (!company) return;

    setText("");
    setSteps([]);
    setErrorMsg(null);
    setPhase("running");

    streamRef.current?.abort();
    const handle = runChatStream(
      { message: buildPrompt(company), session_id: null },
      {
        onToolCall: (e) =>
          setSteps((prev) => [...prev, { call_id: e.call_id, tool: e.tool, status: "running" }]),
        onToolResult: (e) =>
          setSteps((prev) =>
            prev.map((s) => (s.call_id === e.call_id ? { ...s, status: e.ok ? "done" : "error" } : s)),
          ),
        onToken: (e) => setText((prev) => prev + e.text),
        onFinal: (e) => {
          if (e.answer) setText(e.answer);
          setPhase("done");
        },
        onError: (e) => {
          setErrorMsg(e.message || "The investigation could not be completed.");
          setPhase("error");
        },
      },
    );
    streamRef.current = handle;

    return () => {
      handle.abort();
      streamRef.current = null;
    };
  }, [company]);

  React.useEffect(() => {
    if (!company) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [company, onClose]);

  if (!company) return null;

  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden />
      <aside className={styles.drawer} role="dialog" aria-label={`Why is ${company} moving`}>
        <header className={styles.drawerHeader}>
          <div className={styles.drawerTitleWrap}>
            <div className={styles.drawerEyebrow}>PRISM Investigation</div>
            <h2 className={styles.drawerTitle}>Why is {company} moving?</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close investigation">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className={styles.drawerBody}>
          {steps.length > 0 && (
            <div className={styles.steps}>
              {steps.map((s) => (
                <div key={s.call_id} className={styles.step}>
                  <span className={cn(styles.dot, stepClass(s.status))} />
                  <span className={styles.stepTool}>{s.tool}</span>
                </div>
              ))}
            </div>
          )}

          {phase === "running" && !text && (
            <div className={styles.thinking}>
              <span className={styles.thinkingDots}>
                <span /><span /><span />
              </span>
              Investigating {company}…
            </div>
          )}

          {text && (
            <div className={styles.answer}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            </div>
          )}

          {phase === "error" && <div className={styles.drawerError}>{errorMsg}</div>}
        </div>

        <footer className={styles.drawerFooter}>
          Cause analysis from live news + filings + price. Not investment advice.
        </footer>
      </aside>
    </>
  );
}

function stepClass(status: ToolStep["status"]): string {
  if (status === "done") return styles.stepDone;
  if (status === "error") return styles.stepError;
  return styles.stepRunning;
}
