"use client";

import * as React from "react";

import {
  useBalanceSheet,
  useIncomeStatement,
  type FinancialBasis,
  type FinancialNode,
  type FinView,
  type Security,
  type SecurityDetail,
} from "@/lib/api/stocks";
import { cn } from "@/lib/utils";

import BalanceSheetTable from "./BalanceSheetTable";
import IncomeStatement from "./IncomeStatement";
import styles from "./stocks.module.css";

const SUBTABS = [
  { id: "balance_sheet", label: "Balance Sheet", ready: true },
  { id: "income_statement", label: "Income Statement", ready: true },
  { id: "cash_flow", label: "Cash Flow", ready: false },
];

const VIEWS: { id: FinView; label: string }[] = [
  { id: "value", label: "Value (Cr)" },
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
  // `security` + `onAsk` are kept for the parked per-row "Ask PRISM" feature
  // (see the commented askNode below) — re-enable in a future release.
  security?: SecurityDetail | Security | null;
  onAsk?: (query: string) => void;
}

/**
 * Annual Financials section. Balance Sheet is live; Income Statement + Cash
 * Flow are present but disabled. A standalone/consolidated toggle, a view-mode
 * switch (Value (Cr) / YoY % / % of total), and expand-all/collapse-all sit
 * above a 10-year tree table.
 */
export default function AnnualFinancials({ securityId }: AnnualFinancialsProps) {
  const [basis, setBasis] = React.useState<FinancialBasis>("consolidated");
  const [subTab, setSubTab] = React.useState("balance_sheet");
  const [view, setView] = React.useState<FinView>("value");

  const isBS = subTab === "balance_sheet";
  const isIS = subTab === "income_statement";

  // Each statement fetches only when its tab is active.
  const bs = useBalanceSheet(securityId, basis, { enabled: isBS });
  const is = useIncomeStatement(securityId, basis, { enabled: isIS });
  const active = isIS ? is : bs;

  const activeBasis = active.data?.basis ?? basis;
  const available = active.data?.available_bases ?? [];
  const hasData = isIS
    ? !!is.data && is.data.rows.length > 0
    : !!bs.data && bs.data.sections.length > 0;

  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  // Default (Balance Sheet): open the roots (level 0) → root + direct children.
  React.useEffect(() => {
    if (!bs.data) return;
    setExpanded(collectKeys(bs.data.sections, (n) => n.level === 0 && n.children.length > 0, new Set()));
  }, [bs.data]);

  const toggle = React.useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const expandAll = () =>
    bs.data && setExpanded(collectKeys(bs.data.sections, (n) => n.children.length > 0, new Set()));
  const collapseAll = () => setExpanded(new Set());

  // Per-row "Ask PRISM" — parked for a future release. Re-enable by restoring
  // `security`/`onAsk` in the props destructure above + passing `onAsk={askNode}`
  // to <BalanceSheetTable> (and uncommenting the button there).
  //
  // const askNode = React.useCallback(
  //   (node: FinancialNode) => {
  //     if (!onAsk || !data || data.years.length === 0) return;
  //     const name = security?.security_name ?? "this company";
  //     const ex = security?.exchange ? ` (${security.exchange})` : "";
  //     const fy = (d: string) => `FY${d.slice(0, 4)}`;
  //     const ys = data.years;
  //     const recent = ys.slice(-5).map((y) => `${fy(y)} ${node.values[y] ?? "NA"}`).join(", ");
  //     onAsk(
  //       `For ${name}${ex}, analyse "${node.label}" in the ${activeBasis} balance sheet over ` +
  //         `${fy(ys[0])}–${fy(ys[ys.length - 1])} (values in ₹ crore: ${recent}). ` +
  //         `What are the key trends and what is driving the changes?`,
  //     );
  //   },
  //   [onAsk, data, security, activeBasis],
  // );

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
          {isBS && (
            <>
              <button className={styles.finLink} onClick={expandAll}>Expand all</button>
              <button className={styles.finLink} onClick={collapseAll}>Collapse all</button>
            </>
          )}
          {active.isFetching && <span className={styles.refreshing}>updating…</span>}
        </div>
      </div>

      {active.isError ? (
        <div className={styles.chartLoading}>
          Couldn&apos;t load financials: {active.error?.message ?? "unknown error"}.
        </div>
      ) : active.isLoading ? (
        <div className={styles.chartLoading}>Loading financials…</div>
      ) : !hasData ? (
        <div className={styles.chartLoading}>No annual financial data for this security.</div>
      ) : (
        <>
          {isIS ? (
            <IncomeStatement years={is.data!.years} rows={is.data!.rows} view={view} />
          ) : (
            <BalanceSheetTable
              years={bs.data!.years}
              sections={bs.data!.sections}
              view={view}
              expanded={expanded}
              onToggle={toggle}
            />
          )}
          <div className={styles.finNote}>
            Figures in ₹ crore · {activeBasis} · fiscal year ending March
          </div>
        </>
      )}
    </div>
  );
}
