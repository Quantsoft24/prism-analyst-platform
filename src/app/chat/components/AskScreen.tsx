"use client";

import { useState, useRef, useEffect } from "react";
import { MOCK_SUGGESTIONS } from "@/lib/mockData";
import styles from "./AskScreen.module.css";

interface AskScreenProps {
  onSend: (query: string) => void;
}

const MODES = ["Single", "Compare", "Watchlist"];

export default function AskScreen({ onSend }: AskScreenProps) {
  const [query, setQuery] = useState("");
  const [activeMode, setActiveMode] = useState(0);
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
        <div className={styles.eyebrow}>PRISM Research · α</div>
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
      </div>

      <div className={styles.suggestions}>
        {MOCK_SUGGESTIONS.map((s, i) => (
          <div key={i} className={styles.suggestionCard} onClick={() => onSend(s.text)} role="button" tabIndex={0}>
            <span className={styles.suggestionLabel}>{s.label}</span>
            <span className={styles.suggestionText}>{s.text}</span>
          </div>
        ))}
      </div>

      <div className={styles.modeTabs}>
        {MODES.map((m, i) => (
          <button key={m} className={i === activeMode ? styles.modeTabActive : styles.modeTab} onClick={() => setActiveMode(i)}>
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
