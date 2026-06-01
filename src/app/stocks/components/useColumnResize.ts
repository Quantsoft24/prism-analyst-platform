"use client";

import * as React from "react";

interface ResizeOptions {
  defaultW?: number;
  min?: number;
  max?: number;
  /** Min width per (non-label) column — feeds the table's min-width so it
   *  scrolls instead of cramping. */
  yearColMin?: number;
}

/**
 * Drag-resizable first column for the financial tables (Balance Sheet + Income
 * Statement). Returns the pointer-down handler for the header resize grip and
 * the inline `style` for the table (carrying `--bs-label-w` + a `min-width`
 * computed from the column count). Shared so both tables behave identically.
 */
export function useColumnResize(columnCount: number, opts: ResizeOptions = {}) {
  const defaultW = opts.defaultW ?? 240;
  const min = opts.min ?? 140;
  const max = opts.max ?? 600;
  const colMin = opts.yearColMin ?? 88;

  const [labelW, setLabelW] = React.useState(defaultW);

  const startResize = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = labelW;
      const onMove = (ev: PointerEvent) =>
        setLabelW(Math.min(max, Math.max(min, startW + (ev.clientX - startX))));
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [labelW, min, max],
  );

  const tableStyle = {
    "--bs-label-w": `${labelW}px`,
    minWidth: `${labelW + columnCount * colMin}px`,
  } as React.CSSProperties;

  return { startResize, tableStyle };
}
