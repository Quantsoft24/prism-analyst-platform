"use client";

import * as React from "react";
import dynamic from "next/dynamic";

import {
  STOCK_RANGES,
  formatChartValue,
  formatMetric,
  metricDef,
  metricValue,
  priceChange,
  rangeReturn,
  useStockPrices,
  type Security,
  type StockMetric,
  type StockRange,
} from "@/lib/api/stocks";
import { cn } from "@/lib/utils";

import AnnualFinancials from "./AnnualFinancials";
import MetricDropdown from "./MetricDropdown";
import LatestStrip from "./LatestStrip";
import ReportsViewer from "./ReportsViewer";
import SecuritySearch from "./SecuritySearch";
import styles from "./stocks.module.css";

// Chart is client-only (touches the DOM via lightweight-charts).
const PriceChart = dynamic(() => import("./PriceChart"), {
  ssr: false,
  loading: () => <div className={styles.chartLoading}>Loading chart…</div>,
});

/**
 * Stock Dashboard — search any NSE/BSE security, then explore its daily price
 * history. A metric dropdown drives the y-axis (line for scalar metrics, a
 * candlestick for OHLC); a range filter drives the x-axis window. Hover the
 * chart for the (date, value) readout; the latest bar is summarised below.
 * Built tab-ready so fundamentals / reports / announcements can slot in later.
 */
interface StockDashboardViewProps {
  /** Route a query into the chat page (Ask-PRISM about a financial line item). */
  onAsk?: (query: string) => void;
}

export default function StockDashboardView({ onAsk }: StockDashboardViewProps) {
  const [selected, setSelected] = React.useState<Security | null>(null);
  const [metric, setMetric] = React.useState<StockMetric>("close");
  const [range, setRange] = React.useState<StockRange>("1M");

  const prices = useStockPrices(selected?.security_id ?? null, range);
  const points = prices.data?.points ?? [];
  const header = prices.data?.security ?? selected;
  const latest = prices.data?.latest ?? null;
  const change = priceChange(points);

  const def = metricDef(metric);
  const rangeRet = rangeReturn(points, metric);
  const currentMetricValue = latest ? metricValue(latest, metric) : null;

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Stock Dashboard</h1>
          <p className={styles.pageSubtitle}>
            Daily price history for {selected ? "this security" : "any NSE/BSE-listed company"} — OHLC,
            volume, value &amp; market cap.
          </p>
        </div>
        <div className={styles.searchSlot}>
          <SecuritySearch onSelect={setSelected} selectedId={selected?.security_id} />
        </div>
      </header>

      {!selected ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 3 3 5-6" />
            </svg>
          </div>
          <div className={styles.emptyTitle}>Search for a company to begin</div>
          <div className={styles.emptyText}>
            Start typing a name, symbol, or ISIN. NSE and BSE listings appear separately —
            pick the one you want.
          </div>
        </div>
      ) : (
        <div className={styles.dashboard}>
          {/* Header card */}
          <div className={styles.secHeader}>
            <div className={styles.secIdentity}>
              <div className={styles.secNameRow}>
                <h2 className={styles.secName}>{header?.security_name ?? selected.security_name}</h2>
                <span
                  className={cn(
                    styles.exchBadge,
                    header?.exchange === "BSE" ? styles.exchBse : styles.exchNse,
                  )}
                >
                  {header?.exchange}
                </span>
                <span className={styles.secSymbol}>{header?.symbol}</span>
              </div>
              <div className={styles.secMeta}>
                {[header?.isin, header?.sector, prices.data?.security.industry]
                  .filter(Boolean)
                  .join("  ·  ")}
              </div>
            </div>

            <div className={styles.secQuote}>
              {latest?.close != null && (
                <span className={styles.secPrice}>{formatMetric(latest.close, "price")}</span>
              )}
              {change && (
                <span className={cn(styles.secChange, change.abs >= 0 ? styles.up : styles.down)}>
                  {change.abs >= 0 ? "▲" : "▼"} {formatMetric(Math.abs(change.abs), "price")} (
                  {change.pct >= 0 ? "+" : ""}
                  {change.pct.toFixed(2)}%)
                </span>
              )}
            </div>
          </div>

          {/* ── Overview section ── */}
          <section className={styles.dashSection}>
            <div className={styles.dashSectionHead}>
              <h2 className={styles.dashSectionTitle}>Overview</h2>
            </div>

          {/* Controls: metric dropdown (y-axis) + range pills (x-axis) */}
          <div className={styles.controls}>
            <div className={styles.metricSelect}>
              <span className={styles.metricLabel}>Metric</span>
              <MetricDropdown value={metric} onChange={setMetric} />
            </div>

            <div className={styles.rangePills}>
              {STOCK_RANGES.map((r) => (
                <button
                  key={r}
                  className={cn(styles.rangePill, range === r && styles.rangePillActive)}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div className={styles.chartCard}>
            <div className={styles.chartTop}>
              <div className={styles.chartTopMain}>
                <span className={styles.chartMetric}>{def.label}</span>
                {currentMetricValue != null && (
                  <span className={styles.chartValue}>
                    {formatChartValue(currentMetricValue, def.kind)}
                  </span>
                )}
                {rangeRet != null && (
                  <span className={cn(styles.retBadge, rangeRet >= 0 ? styles.up : styles.down)}>
                    {rangeRet >= 0 ? "▲" : "▼"} {Math.abs(rangeRet).toFixed(2)}% · {range}
                  </span>
                )}
              </div>
              {prices.isFetching && <span className={styles.refreshing}>updating…</span>}
            </div>

            {prices.isError ? (
              <div className={styles.chartLoading}>
                Couldn&apos;t load prices: {prices.error?.message ?? "unknown error"}.
              </div>
            ) : prices.isLoading ? (
              <div className={styles.chartLoading}>Loading prices…</div>
            ) : points.length === 0 ? (
              <div className={styles.chartLoading}>No price history in this range.</div>
            ) : (
              <PriceChart points={points} metric={metric} />
            )}
          </div>

          <LatestStrip latest={latest} />
          </section>

          {/* ── Annual Financials section (stacked below Overview) ── */}
          <section className={styles.dashSection}>
            <div className={styles.dashSectionHead}>
              <h2 className={styles.dashSectionTitle}>Annual Financials</h2>
            </div>
            <AnnualFinancials securityId={selected.security_id} security={header} onAsk={onAsk} />
          </section>

          {/* ── Reports Viewer + Announcements (two 50/50 panels) ── */}
          <section className={styles.dashSection}>
            <ReportsViewer
              company={header?.security_name ?? selected.security_name ?? selected.symbol}
            />
          </section>
        </div>
      )}
    </div>
  );
}
