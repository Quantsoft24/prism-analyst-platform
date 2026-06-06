"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import {
  formatRegDate,
  typeMeta,
  type RegDocSummary,
  type RegTone,
} from "@/lib/api/regulatory";

import styles from "./regulatory.module.css";

/** tone → the matching `.toneX` color class. */
export function toneClass(tone: RegTone): string {
  switch (tone) {
    case "cir":
      return styles.toneCir;
    case "mc":
      return styles.toneMc;
    case "reg":
      return styles.toneReg;
    case "ord":
      return styles.toneOrd;
    case "con":
      return styles.toneCon;
    case "bm":
      return styles.toneBm;
    default:
      return styles.toneGen;
  }
}

export function sevClass(sev?: string | null): string {
  if (sev === "High") return styles.sevHi;
  if (sev === "Medium") return styles.sevMed;
  if (sev === "Low") return styles.sevLow;
  return "";
}

/** A distinct, meaningful glyph for each SEBI content type. */
export function TypeGlyph({ type }: { type: string }) {
  const c = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "ORDER":
    case "GENERAL_ORDER":
      // Scales of justice — enforcement / adjudication.
      return (
        <svg {...c}>
          <path d="M12 3v18" /><path d="M7 21h10" /><path d="M5 7h14" />
          <path d="M6.5 7 4 13a3 3 0 0 0 5 0z" /><path d="M17.5 7 15 13a3 3 0 0 0 5 0z" />
        </svg>
      );
    case "REGULATION":
    case "RULES":
      // Shield-check — binding rules.
      return (
        <svg {...c}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "ACT":
      // Book — legislation.
      return (
        <svg {...c}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "MASTER_CIRCULAR":
      // Layers — consolidated circular.
      return (
        <svg {...c}>
          <path d="m12 2 9 5-9 5-9-5z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" />
        </svg>
      );
    case "GUIDELINE":
      // Clipboard-check.
      return (
        <svg {...c}>
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="m9 14 2 2 4-4" />
        </svg>
      );
    case "BOARD_MEETING":
      // People — board.
      return (
        <svg {...c}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "PRESS_RELEASE":
      // Megaphone — announcement.
      return (
        <svg {...c}>
          <path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
      );
    case "GAZETTE_NOTIFICATION":
      // Award seal — official gazette.
      return (
        <svg {...c}>
          <circle cx="12" cy="8" r="6" /><path d="M15.5 12.5 17 22l-5-3-5 3 1.5-9.5" />
        </svg>
      );
    case "ADVISORY":
      // Info.
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    case "MUTUAL_FUND":
      // Pie chart.
      return (
        <svg {...c}>
          <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
        </svg>
      );
    case "CONSULTATION_PAPER":
      // Message — open for comments.
      return (
        <svg {...c}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case "FAQ":
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
    case "SPEECH":
      // Mic.
      return (
        <svg {...c}>
          <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
        </svg>
      );
    case "CIRCULAR":
    default:
      // Document — circular / fallback.
      return (
        <svg {...c}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
  }
}

/** A document row used by the dashboard "Latest" list. */
export function DocRow({
  doc,
  onOpen,
}: {
  doc: RegDocSummary;
  onOpen: (id: number) => void;
}) {
  const meta = typeMeta(doc.type);
  return (
    <button type="button" className={styles.docRow} onClick={() => onOpen(doc.id)}>
      <span className={cn(styles.docIcon, toneClass(meta.tone))}>
        <TypeGlyph type={doc.type} />
      </span>
      <span className={styles.docMain}>
        <span className={styles.docTitle}>{doc.title}</span>
        <span className={styles.docMeta}>
          <span>{formatRegDate(doc.date) || "Undated"}</span>
          {doc.ai_tags.severity && (
            <>
              <span className={styles.dotSep} />
              <span className={cn(styles.sev, sevClass(doc.ai_tags.severity))}>
                {doc.ai_tags.severity}
              </span>
            </>
          )}
          {doc.ai_tags.action_required && (
            <>
              <span className={styles.dotSep} />
              <span className={styles.actionFlag}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Action
              </span>
            </>
          )}
          {doc.sebi_department && (
            <>
              <span className={styles.dotSep} />
              <span>{doc.sebi_department}</span>
            </>
          )}
        </span>
      </span>
      <span className={cn(styles.docTag, toneClass(meta.tone))}>{meta.short}</span>
    </button>
  );
}

/** Numbered pager (← Prev · 1 2 3 · Next →). */
export function Pager({
  page,
  totalPages,
  disabled,
  onGo,
}: {
  page: number;
  totalPages: number;
  disabled?: boolean;
  onGo: (p: number) => void;
}) {
  const count = Math.min(5, totalPages);
  let start = Math.max(1, page - 2);
  if (start + count - 1 > totalPages) start = Math.max(1, totalPages - count + 1);
  const nums = Array.from({ length: count }, (_, i) => start + i);
  return (
    <div className={styles.pager}>
      <button
        className={styles.pageBtn}
        disabled={page <= 1 || disabled}
        onClick={() => onGo(page - 1)}
      >
        ← Prev
      </button>
      {nums.map((p) => (
        <button
          key={p}
          className={cn(styles.pageBtn, p === page && styles.pageBtnActive)}
          disabled={disabled}
          onClick={() => onGo(p)}
        >
          {p}
        </button>
      ))}
      <button
        className={styles.pageBtn}
        disabled={page >= totalPages || disabled}
        onClick={() => onGo(page + 1)}
      >
        Next →
      </button>
      <span className={styles.pageInfo}>
        Page {page} of {totalPages.toLocaleString()}
      </span>
    </div>
  );
}

export function SkeletonRows({ n = 6 }: { n?: number }) {
  return (
    <div className={styles.skeletonList}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className={styles.skeletonRow} />
      ))}
    </div>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyTitle}>{title}</div>
      <div className={styles.emptyText}>{text}</div>
    </div>
  );
}
