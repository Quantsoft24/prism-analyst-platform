/**
 * Export a chat conversation to Markdown (industry-standard "export chat").
 *
 * Pure, client-side: builds a `.md` string and triggers a download — no backend
 * (a server-side PDF export can reuse `buildConversationMarkdown` later). Two
 * adapters feed it: the live thread (`messagesToMarkdown`, ChatMessage[]) and a
 * replayed conversation (`conversationDetailToMarkdown`, ConversationDetail).
 */

import type { Citation, FinalAnswer } from "@/lib/api/chat";
import type { ConversationDetail } from "@/lib/api/conversations";

export interface ExportTurn {
  question: string;
  answer: string | null;
  citations?: Citation[];
}

/** Citation row → a Markdown list line (link + source kind / as-of / page). */
function citationLine(c: Citation, i: number): string {
  const label = c.label || c.url || `Source ${i + 1}`;
  const link = c.url ? `[${label}](${c.url})` : label;
  const meta = [
    c.source_kind,
    c.as_of && c.as_of !== "live" ? `as of ${c.as_of}` : null,
    c.page ? `p.${c.page}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `${i + 1}. ${link}${meta ? ` — ${meta}` : ""}`;
}

/** Render a conversation (title + turns) as Markdown. */
export function buildConversationMarkdown(title: string, turns: ExportTurn[]): string {
  const lines: string[] = [`# ${title.trim() || "Conversation"}`, "", "_Exported from PRISM_", ""];
  for (const t of turns) {
    lines.push("---", "", "**You**", "", t.question.trim() || "_(empty)_", "");
    if (t.answer && t.answer.trim()) {
      lines.push("**PRISM**", "", t.answer.trim(), "");
    }
    if (t.citations && t.citations.length > 0) {
      lines.push("**Sources**", "", ...t.citations.map(citationLine), "");
    }
  }
  return lines.join("\n").trimEnd() + "\n";
}

/** A short, filesystem-safe filename stem from a conversation title. */
export function slugifyFilename(label: string, fallback = "conversation"): string {
  const s = (label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || fallback;
}

/** Trigger a client-side download of a text file. */
export function downloadTextFile(filename: string, content: string, mime = "text/markdown"): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Adapters ────────────────────────────────────────────────────────────────

export interface ExportableMessage {
  role: "user" | "assistant";
  text?: string;
  streamedText?: string;
  structured?: FinalAnswer | null;
}

/** Live thread (ChatMessage[]) → Q/A turns. Walks the messages; the assistant's
 *  prose comes from the structured answer when present. Shared by the Markdown
 *  and PDF exporters. */
export function messagesToTurns(messages: ExportableMessage[]): ExportTurn[] {
  const turns: ExportTurn[] = [];
  let pendingQuestion: string | null = null;
  for (const m of messages) {
    if (m.role === "user") {
      if (pendingQuestion !== null) turns.push({ question: pendingQuestion, answer: null });
      pendingQuestion = m.text ?? "";
    } else {
      const answer = m.structured?.text ?? m.text ?? m.streamedText ?? "";
      turns.push({ question: pendingQuestion ?? "", answer, citations: m.structured?.citations });
      pendingQuestion = null;
    }
  }
  if (pendingQuestion !== null) turns.push({ question: pendingQuestion, answer: null });
  return turns;
}

/** Replayed conversation (ConversationDetail) → Q/A turns. */
export function detailToTurns(detail: ConversationDetail): ExportTurn[] {
  return detail.turns.map((t) => ({
    question: t.user_input,
    answer: t.structured?.text ?? t.final_answer,
    citations: t.structured?.citations,
  }));
}

/** Live thread (ChatMessage[]) → Markdown. */
export function messagesToMarkdown(title: string, messages: ExportableMessage[]): string {
  return buildConversationMarkdown(title, messagesToTurns(messages));
}

/** Replayed conversation (ConversationDetail) → Markdown. */
export function conversationDetailToMarkdown(title: string, detail: ConversationDetail): string {
  return buildConversationMarkdown(title, detailToTurns(detail));
}
