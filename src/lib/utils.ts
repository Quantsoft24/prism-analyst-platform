/**
 * PRISM — Utility Functions
 *
 * Shared helpers used across components.
 */

/** Escape HTML entities for safe rendering */
export function escapeHtml(str: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return str.replace(/[&<>"']/g, (c) => map[c]);
}

/** Format large numbers with commas (Indian numbering system) */
export function formatIndianNumber(num: number): string {
  const str = num.toString();
  const lastThree = str.slice(-3);
  const remaining = str.slice(0, -3);
  if (remaining === "") return lastThree;
  return (
    remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
  );
}

/** Generate a unique ID for components */
export function uid(): string {
  return Math.random().toString(36).slice(2, 11);
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Debounce a function call */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * className combiner. ``clsx`` handles falsy/conditional class lists;
 * ``tailwind-merge`` resolves Tailwind class conflicts so callers can
 * override a default safely (e.g. ``cn("bg-bg", "bg-accent")`` → ``"bg-accent"``).
 *
 * Strict superset of the previous "filter truthies and join" implementation —
 * non-Tailwind strings pass through unchanged, so existing callers keep working.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
