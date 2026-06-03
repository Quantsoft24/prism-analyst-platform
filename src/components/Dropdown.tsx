"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

import styles from "./Dropdown.module.css";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  /** Optional group heading (consecutive options with the same group are grouped). */
  group?: string;
  /** Optional muted right-aligned detail (e.g. unit / source). */
  desc?: string;
}

interface DropdownProps<T extends string> {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  minWidth?: number;
}

const MENU_MAX_H = 320;

/**
 * Shared themed select-style dropdown — one source of truth across the app.
 * The menu is **portaled to <body>** and fixed-positioned from the trigger, so
 * it never gets clipped by a parent `overflow:hidden` (e.g. inside a card).
 * Click-outside / Escape close; arrow keys + Enter navigate.
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
  const [pos, setPos] = React.useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.value === value);

  const place = React.useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const spaceBelow = window.innerHeight - b.bottom;
    const openUp = spaceBelow < Math.min(MENU_MAX_H, 220) && b.top > spaceBelow;
    setPos(
      openUp
        ? { left: b.left, width: b.width, bottom: window.innerHeight - b.top + 6 }
        : { left: b.left, width: b.width, top: b.bottom + 6 },
    );
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    place();
    setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
    const onDown = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const reposition = () => place();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, value, options, place]);

  const choose = (v: T) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      setOpen(true);
    } else if (open && e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (open && e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (open && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      if (options[activeIndex]) choose(options[activeIndex].value);
    }
  };

  let lastGroup: string | undefined;

  return (
    <div className={styles.root} style={minWidth ? { minWidth } : undefined}>
      <button
        ref={btnRef}
        type="button"
        className={cn(styles.button, open && styles.buttonOpen)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        style={minWidth ? { minWidth } : undefined}
      >
        <span className={styles.buttonLabel}>{current?.label ?? "Select…"}</span>
        <svg className={cn(styles.chevron, open && styles.chevronOpen)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.menu}
            role="listbox"
            style={{
              position: "fixed",
              left: pos.left,
              minWidth: pos.width,
              top: pos.top ?? "auto",
              bottom: pos.bottom ?? "auto",
              maxHeight: MENU_MAX_H,
            }}
          >
            {options.map((o, i) => {
              const selected = o.value === value;
              const showGroup = o.group && o.group !== lastGroup;
              lastGroup = o.group;
              return (
                <React.Fragment key={o.value}>
                  {showGroup && <div className={styles.groupLabel}>{o.group}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn(styles.item, selected && styles.itemSelected, i === activeIndex && styles.itemActive)}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => choose(o.value)}
                  >
                    <span className={styles.check}>{selected ? "✓" : ""}</span>
                    {o.label}
                    {o.desc && <span className={styles.itemDesc}>{o.desc}</span>}
                  </button>
                </React.Fragment>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
