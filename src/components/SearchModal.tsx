"use client";

import { useState, useRef, useEffect, useCallback } from "react";

import { NAV_ITEMS } from "@/lib/mockData";
import { useRecentConversations } from "@/lib/api/conversations";
import styles from "./SearchModal.module.css";

/* ── Command palette (⌘K / Ctrl+K) ────────────────────────────────────────
 *  A universal launcher: ask PRISM a question, jump to any workspace view,
 *  start a new chat, or reopen a recent conversation. Replaces the old mock
 *  company/tool search — recents are now the user's REAL history. */

type ItemType = "ask" | "action" | "nav" | "recent";

interface PaletteItem {
  key: string;
  type: ItemType;
  title: string;
  meta: string;
  run: () => void;
}

const TYPE_LABEL: Record<ItemType, string> = {
  ask: "ask",
  action: "action",
  nav: "go to",
  recent: "recent",
};

/* ── Type icon ── */
function TypeIcon({ type }: { type: ItemType }) {
  const icons: Record<ItemType, React.ReactNode> = {
    ask: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
    action: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>,
    nav: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
    recent: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  };
  return <span className={styles.typeIcon}>{icons[type]}</span>;
}

/* ── Main Component ── */
interface SearchModalProps {
  open: boolean;
  onClose: () => void;
  /** Ask the agent a free-text question (starts / continues a chat). */
  onQuery: (text: string) => void;
  /** Navigate to a workspace view id ("dashboard", "news", …). */
  onNavigate: (view: string) => void;
  /** Start a fresh research chat. */
  onNewResearch: () => void;
  /** Reopen a past conversation by session id. */
  onOpenConversation: (id: string) => void;
}

export default function SearchModal({
  open,
  onClose,
  onQuery,
  onNavigate,
  onNewResearch,
  onOpenConversation,
}: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Real recent conversations — server-filtered when a query is typed.
  const { items: recents } = useRecentConversations(query);

  const q = query.trim();
  const matches = (title: string) => !q || title.toLowerCase().includes(q.toLowerCase());

  const items: PaletteItem[] = [];
  // 1. Free-text ask — always first when something is typed.
  if (q) {
    items.push({
      key: "ask",
      type: "ask",
      title: `Ask PRISM: “${q}”`,
      meta: "Start a research question",
      run: () => onQuery(q),
    });
  }
  // 2. Actions + navigation (client-filtered by the query).
  const commands: PaletteItem[] = [
    { key: "new", type: "action", title: "New research", meta: "Start a fresh chat", run: onNewResearch },
    ...NAV_ITEMS.map((n) => ({
      key: `nav-${n.id}`,
      type: "nav" as const,
      title: n.label,
      meta: `/${n.id}`,
      run: () => onNavigate(n.id),
    })),
    { key: "nav-settings", type: "nav", title: "Settings", meta: "/settings", run: () => onNavigate("settings") },
    { key: "nav-account", type: "nav", title: "Account", meta: "/account", run: () => onNavigate("account") },
  ];
  commands.filter((c) => matches(c.title)).forEach((c) => items.push(c));
  // 3. Real recent conversations (already query-filtered by the hook).
  recents.slice(0, 6).forEach((r) =>
    items.push({
      key: `recent-${r.id}`,
      type: "recent",
      title: r.label || "Untitled conversation",
      meta: "Open conversation",
      run: () => onOpenConversation(r.id),
    }),
  );

  const results = items.slice(0, 12);

  /* Focus input + reset when the palette opens */
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keep the active row in range as the result set shrinks while typing.
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, results.length - 1)));
  }, [results.length]);

  /* Keyboard navigation */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[activeIndex]) {
        e.preventDefault();
        results[activeIndex].run();
        onClose();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [results, activeIndex, onClose],
  );

  if (!open) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.modal} role="dialog" aria-label="Command palette">
        <div className={styles.inputRow}>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Ask PRISM, or jump to a page or recent chat…"
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
                key={r.key}
                className={`${styles.resultItem} ${i === activeIndex ? styles.resultItemActive : ""}`}
                onClick={() => { r.run(); onClose(); }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <TypeIcon type={r.type} />
                <div className={styles.resultContent}>
                  <div className={styles.resultTitle}>{r.title}</div>
                  <div className={styles.resultMeta}>{r.meta}</div>
                </div>
                <span className={styles.resultType}>{TYPE_LABEL[r.type]}</span>
              </div>
            ))}
          </div>
        )}

        {q && results.length === 0 && (
          <div className={styles.empty}>
            Press <kbd className={styles.kbd}>Enter</kbd> to ask “{q}”
          </div>
        )}

        <div className={styles.hints}>
          <span className={styles.hint}>↑↓ navigate · ↵ select · esc close</span>
        </div>
      </div>
    </>
  );
}
