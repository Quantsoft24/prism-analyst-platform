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
  useSecurities,
  useStockPrices,
  type Security,
  type StockMetric,
  type StockRange,
} from "@/lib/api/stocks";
import { useRecentSecurities } from "@/hooks/useRecentSecurities";
import { cn } from "@/lib/utils";

import AnnualFinancials from "./AnnualFinancials";
import MarketOverview from "./MarketOverview";
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
  const recents = useRecentSecurities();

  // Select a security AND record it in "recently viewed". Single entry point for
  // the search box, the market-overview tiles, and the deep-link.
  const recentsPush = recents.push;
  const handleSelect = React.useCallback(
    (s: Security) => {
      setSelected(s);
      recentsPush(s);
    },
    [recentsPush],
  );

  // Deep-link: `/stocks?security=<security_id>` (e.g. clicking a holding in the
  // Portfolio Builder) pre-selects that security once its row is loaded. Read
  // from the URL client-side so the page stays statically prerenderable.
  const securities = useSecurities();
  const appliedDeepLink = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (typeof window === "undefined" || !securities.data) return;
    const id = new URLSearchParams(window.location.search).get("security");
    if (!id || appliedDeepLink.current === id) return;
    const match = securities.data.find((s) => String(s.security_id) === id);
    if (match) {
      handleSelect(match);
      appliedDeepLink.current = id;
    }
  }, [securities.data, handleSelect]);

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
          {selected && (
            <button className={styles.backBtn} onClick={() => setSelected(null)}>
              ← Market overview
            </button>
          )}
          <h1 className={styles.pageTitle}>Stock Dashboard</h1>
          <p className={styles.pageSubtitle}>
            {selected
              ? "Daily price history — OHLC, volume, value & market cap."
              : "Indian markets at a glance — indices, top movers, and any NSE/BSE company."}
          </p>
        </div>
        <div className={styles.searchSlot}>
          <SecuritySearch onSelect={handleSelect} selectedId={selected?.security_id} />
        </div>
      </header>

      {!selected ? (
        <MarketOverview recent={recents.recent} onSelect={handleSelect} onAsk={onAsk} />
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
