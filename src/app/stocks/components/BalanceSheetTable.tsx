"use client";

import * as React from "react";

import {
  commonPct,
  formatFinValue,
  formatPct,
  yoyPct,
  type FinancialNode,
  type FinView,
} from "@/lib/api/stocks";
import { cn } from "@/lib/utils";

import styles from "./stocks.module.css";

/** "2025-03" → "FY25". */
function yearLabel(d: string): string {
  return `FY${d.slice(2, 4)}`;
}

// Discrete indent classes (depth ≤ 5) — avoids inline styles per convention.
const LEVEL_CLASS = [styles.bsL0, styles.bsL1, styles.bsL2, styles.bsL3, styles.bsL4, styles.bsL5];

interface BalanceSheetTableProps {
  years: string[];
  sections: FinancialNode[];
  view: FinView;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onAsk: (node: FinancialNode) => void;
}

/**
 * Tree table: line items (indented by depth, expandable) × fiscal-year columns.
 * Cells render per the active view — Value (₹ Cr), YoY %, or % of section total
 * (common-size). Large YoY moves are highlighted to surface "what changed".
 */
export default function BalanceSheetTable({
  years,
  sections,
  view,
  expanded,
  onToggle,
  onAsk,
}: BalanceSheetTableProps) {
  return (
    <div className={styles.bsScroll}>
      <table className={styles.bsTable}>
        <thead>
          <tr>
            <th className={cn(styles.bsHeadCell, styles.bsLabelCol)}>Line item</th>
            {years.map((y) => (
              <th key={y} className={styles.bsHeadCell}>{yearLabel(y)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((sec) => (
            <Rows
              key={sec.key}
              node={sec}
              base={sec.values}
              years={years}
              view={view}
              expanded={expanded}
              onToggle={onToggle}
              onAsk={onAsk}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rows({
  node,
  base,
  years,
  view,
  expanded,
  onToggle,
  onAsk,
}: {
  node: FinancialNode;
  base: Record<string, number | null>;
  years: string[];
  view: FinView;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  onAsk: (node: FinancialNode) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.key);

  return (
    <>
      <tr className={cn(styles.bsRow, node.level === 0 && styles.bsRowRoot)}>
        <td className={cn(styles.bsLabelCol, styles.bsLabelCell, LEVEL_CLASS[Math.min(node.level, 5)])}>
          {hasChildren ? (
            <button
              className={styles.bsCaret}
              onClick={() => onToggle(node.key)}
              aria-label={isOpen ? "Collapse" : "Expand"}
            >
              {isOpen ? "▾" : "▸"}
            </button>
          ) : (
            <span className={styles.bsCaretSpace} />
          )}
          <span className={styles.bsLabel}>{node.label}</span>
          <button
            className={styles.bsAsk}
            onClick={() => onAsk(node)}
            title="Ask PRISM about this line item"
          >
            Ask
          </button>
        </td>

        {years.map((y, i) => {
          const v = node.values[y];
          if (view === "value") {
            return <td key={y} className={styles.bsCell}>{formatFinValue(v)}</td>;
          }
          if (view === "yoy") {
            const p = i > 0 ? yoyPct(node.values[years[i - 1]], v) : null;
            return (
              <td
                key={y}
                className={cn(
                  styles.bsCell,
                  p != null && (p >= 0 ? styles.bsPos : styles.bsNeg),
                  p != null && Math.abs(p) >= 25 && styles.bsBig,
                )}
              >
                {formatPct(p)}
              </td>
            );
          }
          const c = commonPct(v, base[y]);
          return (
            <td key={y} className={styles.bsCell}>
              {c == null ? "—" : `${c.toFixed(1)}%`}
            </td>
          );
        })}
      </tr>

      {hasChildren &&
        isOpen &&
        node.children.map((ch) => (
          <Rows
            key={ch.key}
            node={ch}
            base={base}
            years={years}
            view={view}
            expanded={expanded}
            onToggle={onToggle}
            onAsk={onAsk}
          />
        ))}
    </>
  );
}
