"use client";

import { useState, useRef, useEffect } from "react";
import { MOCK_SUGGESTIONS } from "@/lib/mockData";
import QuotaNotice from "@/components/QuotaNotice";
import styles from "./AskScreen.module.css";

interface AskScreenProps {
  onSend: (query: string) => void;
}

/** Icon for each suggestion card — keyed by the suggestion's ``icon``
 * field in mockData. Matches the Lakshya mockup's ``ask-sug-icon`` SVGs:
 * report (file), compare (bars), bar-chart (model), filter (screen). */
const SUGGESTION_ICONS: Record<string, React.ReactNode> = {
  report: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  compare: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="18" />
      <rect x="14" y="8" width="7" height="13" />
    </svg>
  ),
  "bar-chart": (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  filter: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
};

export default function AskScreen({ onSend }: AskScreenProps) {
  const [query, setQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [query]);

  const handleSend = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    onSend(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.askScreen}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>PRISM Research (βeta)</div>
        <h1 className={styles.title}>
          What would you like to{" "}
          <span className={styles.titleEm}>research</span> today?
        </h1>
      </div>

      <div className={styles.composerContainer}>
        <div className={styles.composerBox}>
          <textarea
            ref={textareaRef}
            className={styles.composerInput}
            placeholder="Ask about any company, filing, sector, or fund..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            aria-label="Research query"
          />
          <div className={styles.composerFooter}>
            <div className={styles.composerActions}>
              <button className={styles.composerActionBtn} title="Attach file">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <button className={styles.composerActionBtn} title="Available tools">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 2.82-1.17V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83" />
                </svg>
                15 tools
              </button>
              <span className={styles.composerActionBtn}>NSE · BSE</span>
            </div>
            <button
              className={query.trim() ? styles.sendBtn : styles.sendBtnDisabled}
              onClick={handleSend}
              aria-label="Send query"
              disabled={!query.trim()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
        <QuotaNotice />
      </div>

      <div className={styles.suggestions}>
        {MOCK_SUGGESTIONS.map((s, i) => (
          <div
            key={i}
            className={styles.suggestionCard}
            onClick={() => onSend(s.text)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSend(s.text);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <span className={styles.suggestionIcon} aria-hidden="true">
              {SUGGESTION_ICONS[s.icon] ?? SUGGESTION_ICONS.report}
            </span>
            <span className={styles.suggestionContent}>
              <span className={styles.suggestionLabel}>{s.label}</span>
              <span className={styles.suggestionText}>{s.text}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
