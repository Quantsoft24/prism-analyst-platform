"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import styles from "./stocks.module.css";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
}

interface DropdownProps<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** Accessible name for the trigger. */
  ariaLabel?: string;
  /** Min trigger width (px). */
  minWidth?: number;
}

/**
 * Themed select-style dropdown (reuses the `.md*` styles). A bordered trigger
 * + a floating menu with a check on the active option. Click-outside / Escape
 * close it; arrow keys + Enter navigate. Generic over the option value type.
 */
export default function Dropdown<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  minWidth,
}: DropdownProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.value === value) ?? options[0];

  React.useEffect(() => {
    if (!open) return;
    setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, value, options]);

  const choose = (v: T) => {
    onChange(v);
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
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (open && e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (open && e.key === "Enter") {
      e.preventDefault();
      choose(options[activeIndex].value);
    }
  };

  return (
    <div className={styles.mdRoot} ref={rootRef} style={minWidth ? { minWidth } : undefined}>
      <button
        type="button"
        className={cn(styles.mdButton, open && styles.mdButtonOpen)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span>{current?.label}</span>
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
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  styles.mdItem,
                  selected && styles.mdItemSelected,
                  i === activeIndex && styles.mdItemActive,
                )}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => choose(o.value)}
              >
                <span className={styles.mdCheck}>{selected ? "✓" : ""}</span>
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
