"use client";

/**
 * Interactive financials charts (recharts) — hover tooltips, highlight, entry
 * animation, responsive. Theme-aware: reads the design-token CSS vars at runtime
 * (recharts needs concrete colors, not `var(--…)`, in SVG attributes) and
 * re-reads on a light/dark toggle. One default export `FinChart` switches on
 * `kind` so the caller (FinancialsBlock) can stay declarative.
 */

import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart, Area,
  BarChart, Bar, Cell, LabelList,
  RadialBarChart, RadialBar, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

import styles from "./FinancialsCharts.module.css";

// ── Theme tokens → concrete colors (recharts can't use var() in attributes) ──
interface TokenColors {
  accent: string; accentSoft: string; neg: string;
  ink: string; inkMute: string; line: string; bgElev: string; bgSunken: string;
}
const FALLBACK: TokenColors = {
  accent: "#8b6f3f", accentSoft: "#efe7d8", neg: "#c0392b",
  ink: "#1a1a1a", inkMute: "#6b7785", line: "rgba(0,0,0,0.1)", bgElev: "#ffffff", bgSunken: "#f1ece3",
};

function useTokenColors(): TokenColors {
  const [c, setC] = React.useState<TokenColors>(FALLBACK);
  // Read tokens BEFORE paint (component is dynamic-imported ssr:false, so no SSR
  // warning) → the fallback hex is never actually shown; colors come from theme.
  React.useLayoutEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.documentElement);
      const v = (name: string, fb: string) => s.getPropertyValue(name).trim() || fb;
      setC({
        accent: v("--accent", FALLBACK.accent),
        accentSoft: v("--accent-soft", FALLBACK.accentSoft),
        neg: v("--neg", FALLBACK.neg),
        ink: v("--ink", FALLBACK.ink),
        inkMute: v("--ink-mute", FALLBACK.inkMute),
        line: v("--line", FALLBACK.line),
        bgElev: v("--bg-elev", FALLBACK.bgElev),
        bgSunken: v("--bg-sunken", FALLBACK.bgSunken),
      });
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => obs.disconnect();
  }, []);
  return c;
}

// ── Number formatting (axis ticks compact; tooltip full) ────────────────────
// Indian for ₹ values (lakh/crore — figures are already in ₹ crore), Western
// k/M/B otherwise (%, x, counts). The unit also lives in caption + tooltip.
function compact(n: number, unit?: string | null): string {
  const a = Math.abs(n);
  if (unit && unit.includes("₹")) {
    if (a >= 1e5) return `${(n / 1e5).toFixed(a >= 1e6 ? 1 : 2)}L`;  // lakh crore
    if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k`;                  // thousand crore
    return `${Math.round(n * 100) / 100}`;
  }
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return `${Math.round(n * 100) / 100}`;
}
function full(n: number, unit?: string | null): string {
  const s = Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const u = unit ?? "";
  if (u === "%") return `${s}%`;
  if (u.startsWith("₹")) return `₹${s}${u.slice(1) ? " " + u.slice(1) : ""}`;
  return u ? `${s} ${u}` : s;
}

// ── Shared tooltip card ──────────────────────────────────────────────────────
function FinTooltip({ active, payload, label, unit }: {
  active?: boolean; payload?: { value: number; payload: { label?: string; period?: string } }[]; label?: string; unit?: string | null;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const name = label ?? p.payload?.label ?? p.payload?.period ?? "";
  return (
    <div className={styles.tip}>
      {name && <div className={styles.tipLabel}>{name}</div>}
      <div className={styles.tipValue}>{full(p.value, unit)}</div>
    </div>
  );
}

// ── Public API ───────────────────────────────────────────────────────────────
type Props =
  | { kind: "trend"; series: { period: string; value: number }[]; unit?: string | null }
  | { kind: "bars"; items: { label: string; value: number }[]; unit?: string | null; horizontal?: boolean }
  | { kind: "gauge"; value: number };

/** Screen-reader text summary of a chart — recharts SVGs are otherwise opaque to
 *  assistive tech. Applied as `role="img" aria-label=…` on the chart wrapper. */
function buildAria(p: Props): string {
  if (p.kind === "gauge") return `Gauge showing ${full(p.value, "%")}`;
  if (p.kind === "trend") {
    const s = p.series;
    if (!s.length) return "Trend chart";
    const f = s[0], l = s[s.length - 1];
    return `Trend line chart, ${s.length} points, from ${f.period} ${full(f.value, p.unit)} to ${l.period} ${full(l.value, p.unit)}`;
  }
  const items = p.items.slice(0, 8);
  return `Bar chart: ${items.map((d) => `${d.label} ${full(d.value, p.unit)}`).join("; ")}${p.items.length > 8 ? "; and more" : ""}`;
}

export default function FinChart(props: Props) {
  const c = useTokenColors();
  const aria = buildAria(props);

  if (props.kind === "trend") {
    return (
      <div className={styles.wrap} role="img" aria-label={aria}>
        <ResponsiveContainer width="100%" height={210}>
          <AreaChart data={props.series} margin={{ top: 12, right: 18, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="finArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.accent} stopOpacity={0.35} />
                <stop offset="100%" stopColor={c.accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={c.line} vertical={false} />
            <XAxis dataKey="period" tick={{ fontSize: 11, fill: c.inkMute }} tickLine={false} axisLine={{ stroke: c.line }} />
            {/* Y-axis tick labels hidden: the per-point value labels already show
                the numbers, and the axis ticks collided with the first label. */}
            <YAxis tick={false} tickLine={false} axisLine={false} width={6} />
            <Tooltip cursor={{ stroke: c.accent, strokeWidth: 1, strokeDasharray: "3 3" }} content={<FinTooltip unit={props.unit} />} />
            <Area
              type="monotone" dataKey="value" stroke={c.accent} strokeWidth={2.4}
              fill="url(#finArea)" dot={{ r: 3, fill: c.accent, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: c.accent }} animationDuration={550}
            >
              <LabelList dataKey="value" position="top" offset={10} formatter={(v) => compact(Number(v), props.unit)} style={{ fill: c.inkMute, fontSize: 10.5 }} />
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (props.kind === "bars") {
    const { items, unit, horizontal } = props;
    const height = horizontal ? Math.max(160, items.length * 34 + 30) : 230;
    return (
      <div className={styles.wrap} role="img" aria-label={aria}>
        <ResponsiveContainer width="100%" height={height}>
          {horizontal ? (
            <BarChart data={items} layout="vertical" margin={{ top: 6, right: 44, left: 6, bottom: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.line} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: c.inkMute }} tickLine={false} axisLine={{ stroke: c.line }} tickFormatter={(v) => compact(v, unit)} />
              <YAxis
                type="category" dataKey="label" width={184}
                tick={{ fontSize: 11.5, fill: c.ink }} tickLine={false} axisLine={false}
                tickFormatter={(v) => (typeof v === "string" && v.length > 26 ? v.slice(0, 25) + "…" : v)}
              />
              <Tooltip cursor={{ fill: c.accentSoft, opacity: 0.4 }} content={<FinTooltip unit={unit} />} />
              <Bar dataKey="value" radius={[0, 5, 5, 0]} animationDuration={550}>
                {items.map((d, i) => <Cell key={i} fill={d.value < 0 ? c.neg : c.accent} />)}
                <LabelList dataKey="value" position="right" formatter={(v) => compact(Number(v), unit)} style={{ fill: c.inkMute, fontSize: 11 }} />
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={items} margin={{ top: 12, right: 12, left: 4, bottom: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.line} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: c.inkMute }} tickLine={false} axisLine={{ stroke: c.line }} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: c.inkMute }} tickLine={false} axisLine={false} width={46} tickFormatter={(v) => compact(v, unit)} />
              <Tooltip cursor={{ fill: c.accentSoft, opacity: 0.4 }} content={<FinTooltip unit={unit} />} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]} animationDuration={550}>
                {items.map((d, i) => <Cell key={i} fill={d.value < 0 ? c.neg : c.accent} />)}
                <LabelList dataKey="value" position="top" formatter={(v) => compact(Number(v), unit)} style={{ fill: c.inkMute, fontSize: 11 }} />
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  }

  // gauge
  const pct = Math.max(0, Math.min(100, props.value));
  return (
    <div className={styles.gaugeWrap} role="img" aria-label={aria}>
      <ResponsiveContainer width={140} height={140}>
        <RadialBarChart
          innerRadius="72%" outerRadius="100%" data={[{ name: "v", value: pct }]}
          startAngle={90} endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar dataKey="value" cornerRadius={10} fill={c.accent} background={{ fill: c.bgSunken }} animationDuration={650} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className={styles.gaugeCenter}>{full(props.value, "%")}</div>
    </div>
  );
}
