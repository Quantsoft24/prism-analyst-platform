"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MOCK_WATCHLIST, MOCK_TOOLS, MOCK_REPORTS, RECENT_CHATS } from "@/lib/mockData";
import styles from "./SearchModal.module.css";

/* ── Search Result Item ── */
interface SearchResult {
  type: "company" | "tool" | "report" | "chat";
  title: string;
  meta: string;
  action: string;
}

/* Build search index */
function buildResults(query: string): SearchResult[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  /* Companies */
  MOCK_WATCHLIST.forEach((w) => {
    if (w.name.toLowerCase().includes(q) || w.symbol.toLowerCase().includes(q)) {
      results.push({ type: "company", title: w.name, meta: `${w.exchange}: ${w.symbol} · ${w.price}`, action: `Deep-dive on ${w.name}` });
    }
  });

  /* Tools */
  MOCK_TOOLS.forEach((t) => {
    if (t.name.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)) {
      results.push({ type: "tool", title: `${t.num} · ${t.name}`, meta: t.desc, action: t.prompt });
    }
  });

  /* Reports */
  MOCK_REPORTS.forEach((r) => {
    if (r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q)) {
      results.push({ type: "report", title: r.title, meta: `${r.category} · ${r.time}`, action: r.title });
    }
  });

  /* Recent chats */
  RECENT_CHATS.forEach((c) => {
    if (c.label.toLowerCase().includes(q)) {
      results.push({ type: "chat", title: c.label, meta: "Recent research", action: c.label });
    }
  });

  return results.slice(0, 8);
}

/* ── Type icon ── */
function TypeIcon({ type }: { type: string }) {
  const icons: Record<string, React.ReactNode> = {
    company: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
    tool: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg>,
    report: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>,
    chat: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
  };
  return <span className={styles.typeIcon}>{icons[type]}</span>;
}

/* ── Main Component ── */
interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (action: string) => void;
}

export default function SearchModal({ open, onClose, onSelect }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = buildResults(query);

  /* Focus input when modal opens */
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  /* Keyboard navigation */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      onSelect(results[activeIndex].action);
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  }, [results, activeIndex, onSelect, onClose]);

  if (!open) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.modal}>
        <div className={styles.inputRow}>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search companies, tools, reports…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
          />
          <kbd className={styles.kbd}>ESC</kbd>
        </div>

        {results.length > 0 && (
          <div className={styles.results}>
            {results.map((r, i) => (
              <div
                key={i}
                className={`${styles.resultItem} ${i === activeIndex ? styles.resultItemActive : ""}`}
                onClick={() => { onSelect(r.action); onClose(); }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <TypeIcon type={r.type} />
                <div className={styles.resultContent}>
                  <div className={styles.resultTitle}>{r.title}</div>
                  <div className={styles.resultMeta}>{r.meta}</div>
                </div>
                <span className={styles.resultType}>{r.type}</span>
              </div>
            ))}
          </div>
        )}

        {query && results.length === 0 && (
          <div className={styles.empty}>
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {!query && (
          <div className={styles.hints}>
            <span className={styles.hint}>Try: Reliance, DCF, KPI, HDFC, peer</span>
          </div>
        )}
      </div>
    </>
  );
}
