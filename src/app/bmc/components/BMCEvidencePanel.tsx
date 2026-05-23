"use client";

import { FileText, Loader2, Send, X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { bmcApi, type BMCBlock, type BMCChatMessage } from "@/lib/api/bmc";
import styles from "./BMCEvidencePanel.module.css";

interface BMCEvidencePanelProps {
  block: BMCBlock | null;
  /** Ticker of the canvas — needed for the drill-down chat endpoint. */
  ticker: string | null;
  /** Marker the user clicked (e.g. "[2]") to highlight; optional. */
  highlightMarker?: string | null;
  onClose: () => void;
}

/**
 * Side panel: the "show your work" surface + per-block drill-down chat.
 * - Top: each cited filing chunk with page number and excerpt.
 * - Bottom: ask follow-up questions about THIS block; answers are grounded
 *   only in the block's evidence (Phase 3). Thread is local (stateless API).
 */
export default function BMCEvidencePanel({
  block,
  ticker,
  highlightMarker,
  onClose,
}: BMCEvidencePanelProps) {
  const [thread, setThread] = React.useState<BMCChatMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Reset the conversation whenever the selected block changes.
  React.useEffect(() => {
    setThread([]);
    setInput("");
  }, [block?.block_id]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread, sending]);

  if (!block) return null;

  const send = async () => {
    const q = input.trim();
    if (!q || !ticker || sending) return;
    // Optimistic append; the server returns the canonical thread which we
    // adopt on success (chat history is now stored upstream in `bmc_chats`).
    setThread((t) => [...t, { role: "user", content: q }]);
    setInput("");
    setSending(true);
    try {
      const resp = await bmcApi.chatBlock(ticker, block.block_id, q);
      if (resp.history && resp.history.length > 0) {
        setThread(resp.history);
      } else {
        setThread((t) => [...t, { role: "assistant", content: resp.answer }]);
      }
    } catch (err) {
      setThread((t) => [
        ...t,
        { role: "assistant", content: `Sorry — that failed: ${(err as Error).message}` },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <div>
          <div className={styles.title}>{block.title}</div>
          <div className={styles.subtitle}>
            {block.evidence.length} cited source{block.evidence.length === 1 ? "" : "s"}
          </div>
        </div>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close evidence panel">
          <X size={16} />
        </button>
      </header>

      {/* Evidence */}
      <div className={styles.body}>
        {block.evidence.length === 0 ? (
          <p className={styles.empty}>No linked sources for this block.</p>
        ) : (
          <ul className={styles.list}>
            {block.evidence.map((ev) => (
              <li
                key={`${ev.marker}-${ev.newsid}`}
                className={cn(styles.item, highlightMarker === ev.marker && styles.itemHighlight)}
              >
                <div className={styles.itemHead}>
                  <span className={styles.marker}>{ev.marker}</span>
                  <span className={styles.page}>
                    <FileText size={12} />
                    {ev.page != null ? `Page ${ev.page}` : "Filing"}
                  </span>
                </div>
                <pre className={styles.excerpt}>{ev.excerpt}</pre>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Drill-down chat */}
      <div className={styles.chat}>
        <div className={styles.chatLabel}>Ask about this block</div>
        <div className={styles.chatMessages}>
          {thread.length === 0 && !sending && (
            <p className={styles.chatHint}>
              e.g. &quot;Why is this the largest segment?&quot; — answers are grounded in the
              evidence above.
            </p>
          )}
          {thread.map((m, i) => (
            <div key={i} className={m.role === "user" ? styles.msgUser : styles.msgAssistant}>
              {m.content}
            </div>
          ))}
          {sending && (
            <div className={styles.msgAssistant}>
              <Loader2 size={12} className={styles.spin} /> Thinking…
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <form
          className={styles.chatForm}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            className={styles.chatInput}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Follow-up question…"
            disabled={sending}
            aria-label="Ask about this block"
          />
          <button type="submit" className={styles.chatSend} disabled={sending || !input.trim()}>
            {sending ? <Loader2 size={14} className={styles.spin} /> : <Send size={14} />}
          </button>
        </form>
      </div>
    </aside>
  );
}
