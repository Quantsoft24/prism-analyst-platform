/**
 * Dependency-free chart/data export — the "take an artifact out" half of the
 * Workspace-as-Canvas story. CSV from the structured data we already hold, and
 * SVG straight from the rendered recharts node (no rasterization lib needed).
 * Mirrors the blob-download approach in `exportMarkdown.ts`.
 */

import type { FinalFinancials, Visual } from "@/lib/api/chat";

/** Trigger a browser download of arbitrary content. */
export function downloadFile(content: BlobPart, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has been processed.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Safe filename slug from a chart title/question. */
export function slugify(s: string, fallback = "chart"): string {
  const out = (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return out || fallback;
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string from header + rows. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}

/** CSV for a universal Visual (bar/line/area series, gauge, or KPI strip). */
export function visualToCsv(v: Visual): string | null {
  if (v.kpis && v.kpis.length) {
    return toCsv(["Metric", "Value", "Unit"], v.kpis.map((k) => [k.label, k.value, k.unit ?? ""]));
  }
  if (v.series && v.series.length) {
    return toCsv(["Label", "Value"], v.series.map((p) => [p.label, p.value]));
  }
  if (v.value != null) return toCsv(["Value"], [[v.value]]);
  return null;
}

/** CSV for a financials block (series / comparison / ranking / line-items / value). */
export function financialsToCsv(fin: FinalFinancials): string | null {
  if (fin.series?.length) return toCsv(["Period", "Value"], fin.series.map((s) => [s.period, s.value]));
  if (fin.comparison?.length) return toCsv(["Company", "Value", "Period"], fin.comparison.map((c) => [c.name ?? "", c.value ?? "", c.period ?? ""]));
  if (fin.ranking?.length) return toCsv(["Rank", "Name", "Value"], fin.ranking.map((r, i) => [r.rank ?? i + 1, r.name ?? "", r.value ?? ""]));
  if (fin.line_items?.length) return toCsv(["Item", "Value", "Unit"], fin.line_items.map((li) => [li.label ?? li.key ?? "", li.value ?? li.display ?? "", li.unit ?? ""]));
  if (fin.value != null) return toCsv(["Field", "Value", "Period"], [[fin.field?.label ?? "Value", fin.value, fin.period ?? ""]]);
  return null;
}

/** Serialize the first <svg> inside a container element and download it as SVG. */
export function downloadSvg(container: HTMLElement | null, filename: string): boolean {
  const svg = container?.querySelector("svg");
  if (!svg) return false;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  // Resolve themed CSS-var colors to concrete values so the exported file looks
  // right outside the app (recharts already uses concrete colors, but axis text
  // can inherit `currentColor`).
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#111";
  clone.style.color = ink;
  const xml = new XMLSerializer().serializeToString(clone);
  downloadFile(`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`, filename, "image/svg+xml;charset=utf-8");
  return true;
}
