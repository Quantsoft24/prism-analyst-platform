"use client";

import * as React from "react";

import {
  useBalanceSheet,
  type FinancialBasis,
  type FinancialNode,
  type FinView,
  type Security,
  type SecurityDetail,
} from "@/lib/api/stocks";
import { cn } from "@/lib/utils";

import BalanceSheetTable from "./BalanceSheetTable";
import styles from "./stocks.module.css";

const SUBTABS = [
  { id: "balance_sheet", label: "Balance Sheet", ready: true },
  { id: "income_statement", label: "Income Statement", ready: false },
  { id: "cash_flow", label: "Cash Flow", ready: false },
];

const VIEWS: { id: FinView; label: string }[] = [
  { id: "value", label: "Value" },
  { id: "yoy", label: "YoY %" },
  { id: "common", label: "% of total" },
];

function collectKeys(
  nodes: FinancialNode[],
  pred: (n: FinancialNode) => boolean,
  acc: Set<string>,
): Set<string> {
  for (const n of nodes) {
    if (pred(n)) acc.add(n.key);
    collectKeys(n.children, pred, acc);
  }
  return acc;
}

interface AnnualFinancialsProps {
  securityId: number;
  security: SecurityDetail | Security | null;
  onAsk?: (query: string) => void;
}

/**
 * Annual Financials section. Balance Sheet is live; Income Statement + Cash
 * Flow are present but disabled. A standalone/consolidated toggle, a view-mode
 * switch (Value / YoY % / % of total), and expand-all/collapse-all sit above a
 * 10-year tree table. Each row can be handed to the chat agent ("Ask PRISM").
 */
export default function AnnualFinancials({ securityId, security, onAsk }: AnnualFinancialsProps) {
  const [basis, setBasis] = React.useState<FinancialBasis>("consolidated");
  const [subTab, setSubTab] = React.useState("balance_sheet");
  const [view, setView] = React.useState<FinView>("value");

  const { data, isLoading, isError, error, isFetching } = useBalanceSheet(securityId, basis);
  const activeBasis = data?.basis ?? basis;
  const available = data?.available_bases ?? [];

  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  // Default: open the roots (level 0) → shows each root + its direct children.
  React.useEffect(() => {
    if (!data) return;
    setExpanded(collectKeys(data.sections, (n) => n.level === 0 && n.children.length > 0, new Set()));
  }, [data]);

  const toggle = React.useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const expandAll = () =>
    data && setExpanded(collectKeys(data.sections, (n) => n.children.length > 0, new Set()));
  const collapseAll = () => setExpanded(new Set());

  const askNode = React.useCallback(
    (node: FinancialNode) => {
      if (!onAsk || !data || data.years.length === 0) return;
      const name = security?.security_name ?? "this company";
      const ex = security?.exchange ? ` (${security.exchange})` : "";
      const fy = (d: string) => `FY${d.slice(0, 4)}`;
      const ys = data.years;
      const recent = ys
        .slice(-5)
        .map((y) => `${fy(y)} ${node.values[y] ?? "NA"}`)
        .join(", ");
      onAsk(
        `For ${name}${ex}, analyse "${node.label}" in the ${activeBasis} balance sheet over ` +
          `${fy(ys[0])}–${fy(ys[ys.length - 1])} (values in ₹ crore: ${recent}). ` +
          `What are the key trends and what is driving the changes?`,
      );
    },
    [onAsk, data, security, activeBasis],
  );

  return (
    <div className={styles.fin}>
      {/* Statement sub-tabs */}
      <div className={styles.subTabs}>
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            className={cn(styles.subTab, subTab === t.id && styles.subTabActive)}
            disabled={!t.ready}
            onClick={() => t.ready && setSubTab(t.id)}
            title={t.ready ? undefined : "Coming soon"}
          >
            {t.label}
            {!t.ready && <span className={styles.tabSoon}>soon</span>}
          </button>
        ))}
      </div>

      {/* Toolbar: basis toggle · view modes · expand controls */}
      <div className={styles.finToolbar}>
        <div className={styles.basisToggle}>
          {(["consolidated", "standalone"] as FinancialBasis[]).map((b) => {
            const disabled = available.length > 0 && !available.includes(b);
            return (
              <button
                key={b}
                className={cn(styles.basisBtn, activeBasis === b && styles.basisBtnActive)}
                disabled={disabled}
                onClick={() => setBasis(b)}
              >
                {b[0].toUpperCase() + b.slice(1)}
              </button>
            );
          })}
        </div>

        <div className={styles.finRight}>
          <div className={styles.viewPills}>
            {VIEWS.map((v) => (
              <button
                key={v.id}
                className={cn(styles.viewPill, view === v.id && styles.viewPillActive)}
                onClick={() => setView(v.id)}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button className={styles.finLink} onClick={expandAll}>Expand all</button>
          <button className={styles.finLink} onClick={collapseAll}>Collapse all</button>
          {isFetching && <span className={styles.refreshing}>updating…</span>}
        </div>
      </div>

      {isError ? (
        <div className={styles.chartLoading}>
          Couldn&apos;t load financials: {error?.message ?? "unknown error"}.
        </div>
      ) : isLoading ? (
        <div className={styles.chartLoading}>Loading financials…</div>
      ) : !data || data.sections.length === 0 ? (
        <div className={styles.chartLoading}>No annual financial data for this security.</div>
      ) : (
        <>
          <BalanceSheetTable
            years={data.years}
            sections={data.sections}
            view={view}
            expanded={expanded}
            onToggle={toggle}
            onAsk={askNode}
          />
          <div className={styles.finNote}>
            Figures in ₹ crore · {activeBasis} · fiscal year ending March
          </div>
        </>
      )}
    </div>
  );
}
