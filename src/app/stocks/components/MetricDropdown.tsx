"use client";

import * as React from "react";

import { METRICS, metricDef, type StockMetric } from "@/lib/api/stocks";
import { cn } from "@/lib/utils";

import styles from "./stocks.module.css";

interface MetricDropdownProps {
  value: StockMetric;
  onChange: (metric: StockMetric) => void;
}

/**
 * Themed metric selector (replaces the native <select>). A bordered trigger
 * + a floating menu with a checkmark on the active option, matching the
 * Lakshya design tokens. Click-outside / Escape to close; arrow-key navigation.
 */
export default function MetricDropdown({ value, onChange }: MetricDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const current = metricDef(value);

  React.useEffect(() => {
    if (!open) return;
    setActiveIndex(Math.max(0, METRICS.findIndex((m) => m.value === value)));
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, value]);

  const choose = (m: StockMetric) => {
    onChange(m);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setOpen(true);
    } else if (open && e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, METRICS.length - 1));
    } else if (open && e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (open && e.key === "Enter") {
      e.preventDefault();
      choose(METRICS[activeIndex].value);
    }
  };

  return (
    <div className={styles.mdRoot} ref={rootRef}>
      <button
        type="button"
        className={cn(styles.mdButton, open && styles.mdButtonOpen)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{current.label}</span>
        <svg
          className={cn(styles.mdChevron, open && styles.mdChevronOpen)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className={styles.mdMenu} role="listbox">
          {METRICS.map((m, i) => {
            const selected = m.value === value;
            return (
              <button
                key={m.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  styles.mdItem,
                  selected && styles.mdItemSelected,
                  i === activeIndex && styles.mdItemActive,
                )}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => choose(m.value)}
              >
                <span className={styles.mdCheck}>{selected ? "✓" : ""}</span>
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
