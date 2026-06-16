/**
 * Export a chat conversation to PDF — client-side, no backend, no extra deps.
 *
 * We render each answer's Markdown to HTML with the SAME pipeline as the live
 * chat (`react-markdown` + `remark-gfm`, via a detached `createRoot` so it's
 * fully client-safe), assemble a clean print-ready document, and open it in a
 * hidden iframe → the browser's print dialog ("Save as PDF"). The result is a
 * real, selectable-text PDF (tables, lists, headings preserved) — not a
 * rasterised screenshot. Mirrors the Markdown exporter's two adapters.
 */

import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { Citation } from "@/lib/api/chat";
import type { ConversationDetail } from "@/lib/api/conversations";
import {
  detailToTurns,
  messagesToTurns,
  type ExportableMessage,
  type ExportTurn,
} from "./exportMarkdown";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Markdown → HTML string, reusing the live chat's renderer so the PDF matches
 *  what the user saw on screen. Synchronous (flushSync) and client-only. */
function markdownToHtml(md: string): string {
  if (!md || !md.trim()) return "";
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    flushSync(() => {
      root.render(<ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>);
    });
    return host.innerHTML;
  } catch {
    return `<p>${escapeHtml(md)}</p>`;
  } finally {
    // Defer unmount so we never tear down a root during React's own work.
    setTimeout(() => {
      try {
        root.unmount();
      } catch {
        /* noop */
      }
    }, 0);
  }
}

function citationHtml(c: Citation, i: number): string {
  const label = escapeHtml(c.label || c.url || `Source ${i + 1}`);
  const meta = [
    c.source_kind,
    c.as_of && c.as_of !== "live" ? `as of ${c.as_of}` : null,
    c.page ? `p.${c.page}` : null,
  ]
    .filter(Boolean)
    .map((x) => escapeHtml(String(x)))
    .join(" · ");
  const body = c.url ? `<a href="${escapeHtml(c.url)}">${label}</a>` : label;
  return `<li>${body}${meta ? ` <span class="cite-meta">— ${meta}</span>` : ""}</li>`;
}

function turnHtml(t: ExportTurn): string {
  const q = escapeHtml(t.question.trim() || "(empty)");
  const answer = t.answer && t.answer.trim() ? markdownToHtml(t.answer) : "";
  const sources =
    t.citations && t.citations.length
      ? `<div class="sources"><div class="sources-title">Sources</div><ol>${t.citations
          .map(citationHtml)
          .join("")}</ol></div>`
      : "";
  return `<section class="turn">
    <div class="role role-q">Question</div>
    <div class="q">${q}</div>
    ${answer ? `<div class="role role-a">PRISM</div><div class="a">${answer}</div>` : ""}
    ${sources}
  </section>`;
}

/* Self-contained print stylesheet (light theme — print-friendly; independent of
   the app's Lakshya tokens since this renders in its own document). */
const PRINT_CSS = `
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1a1d21; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.55; }
  .doc-head { display: flex; align-items: baseline; justify-content: space-between; padding-bottom: 8px; margin-bottom: 18px; border-bottom: 1.5px solid #1a1d21; }
  .doc-head .brand { font-weight: 700; font-size: 13pt; letter-spacing: 0.08em; }
  .doc-head .sub { font-size: 9pt; color: #6b7280; letter-spacing: 0.04em; text-transform: uppercase; }
  .doc-title { font-size: 19pt; font-weight: 700; line-height: 1.25; margin: 0 0 22px; }
  .turn { margin: 0 0 22px; padding: 0 0 18px; border-bottom: 1px solid #ececec; }
  .turn:last-of-type { border-bottom: none; }
  .role { font-size: 8pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #9aa0a6; margin-bottom: 5px; }
  .role-a { margin-top: 12px; }
  .q { font-size: 12.5pt; font-weight: 600; color: #111; break-inside: avoid; }
  .a { font-size: 11pt; }
  .a p { margin: 0 0 0.7em; }
  .a h1, .a h2, .a h3 { line-height: 1.3; margin: 1em 0 0.45em; }
  .a h1 { font-size: 15pt; } .a h2 { font-size: 13pt; } .a h3 { font-size: 11.5pt; }
  .a ul, .a ol { margin: 0 0 0.7em; padding-left: 1.4em; }
  .a li { margin: 0.2em 0; }
  .a a { color: #8b6f3f; text-decoration: underline; }
  .a code { font-family: "SF Mono", Consolas, "Courier New", monospace; font-size: 0.88em; background: #f3f3f0; padding: 1px 4px; border-radius: 3px; }
  .a pre { background: #f6f6f4; border: 1px solid #e4e4e0; border-radius: 6px; padding: 10px 12px; overflow-x: auto; font-size: 9.5pt; line-height: 1.45; }
  .a pre code { background: none; padding: 0; }
  .a table { border-collapse: collapse; width: 100%; margin: 0.6em 0; font-size: 10pt; }
  .a th, .a td { border: 1px solid #d9d9d6; padding: 5px 9px; text-align: left; }
  .a th { background: #f3f3f0; font-weight: 600; }
  .a blockquote { margin: 0.6em 0; padding-left: 12px; border-left: 3px solid #e4e4e0; color: #555; }
  .sources { margin-top: 12px; background: #f7f7f5; border: 1px solid #e8e8e4; border-radius: 6px; padding: 9px 12px; }
  .sources-title { font-size: 8.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #6b7280; margin-bottom: 5px; }
  .sources ol { margin: 0; padding-left: 1.3em; }
  .sources li { font-size: 9.5pt; margin: 2px 0; }
  .sources a { color: #8b6f3f; }
  .cite-meta { color: #6b7280; }
  .doc-foot { margin-top: 26px; padding-top: 10px; border-top: 1px solid #ececec; font-size: 8.5pt; color: #9aa0a6; }
`;

/** Build a self-contained, print-ready HTML document for the conversation. */
export function buildConversationHtml(title: string, turns: ExportTurn[]): string {
  const safeTitle = escapeHtml(title.trim() || "Conversation");
  const body = turns.map(turnHtml).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${safeTitle}</title><style>${PRINT_CSS}</style></head>
<body>
  <header class="doc-head"><span class="brand">PRISM</span><span class="sub">Research conversation</span></header>
  <h1 class="doc-title">${safeTitle}</h1>
  ${body}
  <footer class="doc-foot">Generated with PRISM — an AI research analyst for Indian markets.</footer>
</body></html>`;
}

/** Render the conversation in a hidden iframe and open the print dialog. The
 *  browser's "Save as PDF" produces the file; the document &lt;title&gt; becomes
 *  the default filename. */
export function printConversationPdf(title: string, turns: ExportTurn[]): void {
  if (typeof window === "undefined") return;
  const iframe = document.createElement("iframe");
  Object.assign(iframe.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    opacity: "0",
  });
  iframe.setAttribute("aria-hidden", "true");
  iframe.title = "PDF export";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(buildConversationHtml(title, turns));
  doc.close();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => iframe.remove(), 500);
  };
  win.onafterprint = cleanup;
  // Inline <style> only (no external assets) → a short delay is enough to lay
  // out before printing.
  window.setTimeout(() => {
    try {
      win.focus();
      win.print();
    } catch {
      /* noop */
    }
  }, 350);
  window.setTimeout(cleanup, 60_000); // safety net (some browsers never fire afterprint)
}

// ── Adapters (mirror the Markdown exporter) ──────────────────────────────────

/** Live thread (ChatMessage[]) → open the PDF print dialog. */
export function messagesToPdf(title: string, messages: ExportableMessage[]): void {
  printConversationPdf(title, messagesToTurns(messages));
}

/** Replayed conversation (ConversationDetail) → open the PDF print dialog. */
export function conversationDetailToPdf(title: string, detail: ConversationDetail): void {
  printConversationPdf(title, detailToTurns(detail));
}
