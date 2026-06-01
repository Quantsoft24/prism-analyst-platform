"use client";

import * as React from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";

import {
  formatChartValue,
  metricDef,
  metricValue,
  type PricePoint,
  type StockMetric,
} from "@/lib/api/stocks";

import styles from "./stocks.module.css";

interface PriceChartProps {
  points: PricePoint[];
  metric: StockMetric;
}

interface TooltipState {
  x: number;
  y: number;
  date: string;
  rows: { label: string; value: string }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-05-29" → "29 May 2026" (readable tooltip date). */
function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Read a Lakshya design token off the document root (theme-aware). */
function readVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function readColors() {
  return {
    ink: readVar("--ink-mute", "#6B7785"),
    line: readVar("--line-soft", "#ECECE6"),
    grid: readVar("--line-soft", "#ECECE6"),
    accent: readVar("--accent", "#8B6F3F"),
    pos: readVar("--pos", "#2F6B47"),
    neg: readVar("--neg", "#A53F2D"),
    crosshair: readVar("--ink-faint", "#9AA3AD"),
  };
}

/**
 * Interactive price chart (lightweight-charts). Scalar metrics render as a
 * gradient area tinted green/red by the range's direction; the OHLC metric
 * renders as a candlestick. Axis ticks and the hover tooltip share one
 * formatter (compact ₹ / ₹ Cr / counts) so they always read identically.
 * Theme-reactive (recreates on light/dark toggle). Client-only.
 */
export default function PriceChart({ points, metric }: PriceChartProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Area"> | ISeriesApi<"Candlestick"> | null>(null);
  const [tooltip, setTooltip] = React.useState<TooltipState | null>(null);

  // Current metric in a ref so the (long-lived) crosshair handler + axis
  // formatter always use the latest value, not the one captured at creation.
  const metricRef = React.useRef(metric);
  metricRef.current = metric;

  const isCandle = metricDef(metric).kind === "ohlc";

  // Track the active theme so the chart recreates with fresh token colours.
  const [theme, setTheme] = React.useState<string | null>(
    typeof document !== "undefined" ? document.documentElement.getAttribute("data-theme") : null,
  );
  React.useEffect(() => {
    const mo = new MutationObserver(() =>
      setTheme(document.documentElement.getAttribute("data-theme")),
    );
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);

  // Create the chart + series. Recreate when the series kind flips (line ⇄
  // candle) or the theme changes.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const c = readColors();

    const chart = createChart(el, {
      width: el.clientWidth,
      height: el.clientHeight,
      autoSize: false,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: c.ink,
        fontFamily: "var(--font-body), system-ui, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: c.grid, style: LineStyle.Dotted },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: c.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: c.accent },
        horzLine: { color: c.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: c.accent },
      },
      handleScale: false,
      handleScroll: false,
    });
    chartRef.current = chart;

    const priceFormat = {
      type: "custom" as const,
      minMove: 0.01,
      formatter: (v: number) => formatChartValue(v, metricDef(metricRef.current).kind),
    };

    seriesRef.current = isCandle
      ? chart.addSeries(CandlestickSeries, {
          upColor: c.pos,
          downColor: c.neg,
          borderUpColor: c.pos,
          borderDownColor: c.neg,
          wickUpColor: c.pos,
          wickDownColor: c.neg,
          priceFormat,
        })
      : chart.addSeries(AreaSeries, {
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerRadius: 4,
          crosshairMarkerBorderWidth: 2,
          priceFormat,
        });

    chart.subscribeCrosshairMove((param: MouseEventParams) => {
      const series = seriesRef.current;
      if (!series || !param.point || param.time == null || !param.seriesData.has(series)) {
        setTooltip(null);
        return;
      }
      const def = metricDef(metricRef.current);
      const d = param.seriesData.get(series) as
        | { value?: number }
        | { open: number; high: number; low: number; close: number };
      const rows =
        def.kind === "ohlc"
          ? (["open", "high", "low", "close"] as const).map((k) => ({
              label: k[0].toUpperCase() + k.slice(1),
              value: formatChartValue((d as Record<string, number>)[k], "price"),
            }))
          : [{ label: def.label, value: formatChartValue((d as { value?: number }).value, def.kind) }];
      setTooltip({ x: param.point.x, y: param.point.y, date: prettyDate(String(param.time)), rows });
    });

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCandle, theme]);

  // Feed data; tint the area by the range's direction.
  React.useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    const c = readColors();

    if (isCandle) {
      const data = points
        .filter((p) => p.open != null && p.high != null && p.low != null && p.close != null)
        .map((p) => ({
          time: p.time as Time,
          open: p.open as number,
          high: p.high as number,
          low: p.low as number,
          close: p.close as number,
        }));
      (series as ISeriesApi<"Candlestick">).setData(data);
    } else {
      const data = points
        .map((p) => ({ time: p.time as Time, value: metricValue(p, metric) }))
        .filter((d): d is { time: Time; value: number } => d.value != null);
      (series as ISeriesApi<"Area">).setData(data);

      const up = data.length < 2 || data[data.length - 1].value >= data[0].value;
      const col = up ? c.pos : c.neg;
      (series as ISeriesApi<"Area">).applyOptions({
        lineColor: col,
        topColor: hexToRgba(col, 0.26),
        bottomColor: hexToRgba(col, 0.0),
        crosshairMarkerBorderColor: col,
        crosshairMarkerBackgroundColor: col,
      });
    }
    chart.timeScale().fitContent();
    setTooltip(null);
  }, [points, metric, isCandle, theme]);

  return (
    <div className={styles.chartWrap}>
      <div ref={containerRef} className={styles.chartCanvas} />
      {tooltip && (
        <div
          className={styles.chartTooltip}
          style={{ transform: `translate(${tooltip.x + 16}px, ${tooltip.y + 12}px)` }}
        >
          <div className={styles.tooltipDate}>{tooltip.date}</div>
          {tooltip.rows.map((r) => (
            <div key={r.label} className={styles.tooltipRow}>
              <span className={styles.tooltipLabel}>{r.label}</span>
              <span className={styles.tooltipValue}>{r.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
