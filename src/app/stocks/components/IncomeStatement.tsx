"use client";

import * as React from "react";

import {
  commonPct,
  formatCrorePlain,
  formatPct,
  yoyPct,
  type FinView,
  type IncomeRow,
} from "@/lib/api/stocks";
import { cn } from "@/lib/utils";
import Tooltip from "@/components/Tooltip";

import { useColumnResize } from "./useColumnResize";
import styles from "./stocks.module.css";

/** "2025-03" → "FY25". */
function yearLabel(d: string): string {
  return `FY${d.slice(2, 4)}`;
}

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

interface IncomeStatementProps {
  years: string[];
  rows: IncomeRow[];
  view: FinView;
}

/**
 * Sequential income statement (Revenue → … → PAT) — flat table sharing the
 * Balance Sheet's chrome (same CSS, resizable first column). Input rows carry a
 * muted −/+ operator; computed subtotals (Operating Profit / PBT / PAT) are
 * highlighted with an info-icon tooltip explaining the formula. "% of total" is
 * common-size against Revenue.
 */
export default function IncomeStatement({ years, rows, view }: IncomeStatementProps) {
  const { startResize, tableStyle } = useColumnResize(years.length);
  const revenue = React.useMemo(
    () => rows.find((r) => r.key === "revenue")?.values ?? {},
    [rows],
  );

  return (
    <div className={styles.bsScroll}>
      <table className={styles.bsTable} style={tableStyle}>
        <thead>
          <tr>
            <th className={cn(styles.bsHeadCell, styles.bsLabelCol)}>
              Line item
              <span
                className={styles.bsResizer}
                onPointerDown={startResize}
                role="separator"
                aria-label="Resize column"
              />
            </th>
            {years.map((y) => (
              <th key={y} className={styles.bsHeadCell}>{yearLabel(y)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.key}
              className={cn(
                styles.bsRow,
                row.emphasis && styles.isSubtotal,
                row.key === "pat" && styles.isPat,
              )}
            >
              <td className={cn(styles.bsLabelCol, styles.bsLabelCell, styles.isLabelCell)}>
                {row.sign && (
                  <span className={styles.isOperator}>{row.sign === "minus" ? "−" : "+"}</span>
                )}
                <span className={styles.bsLabel}>{row.label}</span>
                {row.info && (
                  <Tooltip label={row.info} side="top">
                    <span className={styles.isInfo} tabIndex={0} aria-label={row.info}>
                      <InfoIcon />
                    </span>
                  </Tooltip>
                )}
              </td>

              {years.map((y, i) => {
                const v = row.values[y];
                if (view === "value") {
                  return <td key={y} className={styles.bsCell}>{formatCrorePlain(v)}</td>;
                }
                if (view === "yoy") {
                  const p = i > 0 ? yoyPct(row.values[years[i - 1]], v) : null;
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
                const c = commonPct(v, revenue[y]);
                return (
                  <td key={y} className={styles.bsCell}>
                    {c == null ? "—" : `${c.toFixed(1)}%`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
