"use client";

import * as React from "react";

import SecuritySearch from "@/app/stocks/components/SecuritySearch";
import type {
  ClarificationEvent,
  ClarificationOption,
  ClarificationQuestion,
} from "@/lib/api/chat";
import type { Security } from "@/lib/api/stocks";
import { cn } from "@/lib/utils";

import styles from "./ClarificationCard.module.css";

/** Reply text for ONE pick — includes the security_id so the agent resolves it
 *  exactly. (The combined reply joins these across all answered questions.) */
function optionAnswer(o: ClarificationOption): string {
  return typeof o.value === "number" ? `${o.label} — security_id ${o.value}` : o.label;
}
function securityAnswer(s: Security): string {
  const name = s.security_name ?? s.symbol ?? "Selected company";
  return `${name} — security_id ${s.security_id}`;
}

interface Answer {
  reply: string; // full reply text (with security_id)
  label: string; // short label shown on the tab
}

interface ClarificationCardProps {
  clarification: ClarificationEvent;
  onRespond: (answer: string) => void;
}

/**
 * The agent's clarification form — ONE card with a tab per question (e.g.
 * disambiguating "Reliance", "Adani", "Tata" for a comparison). Answer each tab
 * (it auto-advances), then "Submit answers" sends every pick in one message.
 * Docked above the chat input. Themed for light + dark (tokens only).
 * The parent removes it once a new turn starts.
 */
export default function ClarificationCard({
  clarification,
  onRespond,
}: ClarificationCardProps) {
  const questions: ClarificationQuestion[] = React.useMemo(() => {
    if (clarification.questions?.length) return clarification.questions;
    return [
      {
        id: "q0",
        question: clarification.question,
        mode: clarification.mode,
        options: clarification.options,
        allow_search: clarification.allow_search,
      },
    ];
  }, [clarification]);

  const [active, setActive] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, Answer>>({});
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [text, setText] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  const total = questions.length;
  const current = questions[active];
  const allAnswered = questions.every((q) => answers[q.id]);
  const answeredCount = questions.filter((q) => answers[q.id]).length;

  // Record an answer for the current tab and jump to the next UNanswered one.
  const setAnswer = React.useCallback(
    (reply: string, label: string) => {
      if (submitted || !reply.trim()) return;
      const next = { ...answers, [current.id]: { reply: reply.trim(), label } };
      setAnswers(next);
      setChecked(new Set());
      setText("");
      const nextUnanswered = questions.findIndex((q) => !next[q.id]);
      if (nextUnanswered >= 0) setActive(nextUnanswered);
    },
    [submitted, answers, current, questions],
  );

  const submit = () => {
    if (submitted || !allAnswered) return;
    setSubmitted(true);
    const combined =
      total === 1
        ? answers[questions[0].id].reply
        : questions.map((q) => `${q.id}: ${answers[q.id].reply}`).join("; ");
    onRespond(combined);
  };

  const toggle = (id: string) =>
    setChecked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  if (dismissed) return null;
  const locked = submitted;
  const chosen = answers[current.id]; // the current tab's existing answer, if any

  return (
    <div className={styles.card} role="group" aria-label="Clarification" aria-disabled={locked}>
      <div className={styles.head}>
        <span className={styles.headTitle}>
          {total > 1 ? "Which companies did you mean?" : "One quick question"}
        </span>
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          title="Dismiss"
        >
          ✕
        </button>
      </div>

      {/* Tab row — one per question; ✓ when answered, highlighted when active. */}
      {total > 1 && (
        <div className={styles.tabs} role="tablist">
          {questions.map((q, i) => (
            <button
              key={q.id}
              role="tab"
              aria-selected={i === active}
              className={cn(
                styles.tab,
                i === active && styles.tabActive,
                answers[q.id] && styles.tabDone,
              )}
              disabled={locked}
              onClick={() => setActive(i)}
            >
              {answers[q.id] && <span className={styles.tabCheck}>✓</span>}
              <span className={styles.tabLabel}>{q.id}</span>
            </button>
          ))}
        </div>
      )}

      <div className={styles.question}>{current.question}</div>

      {current.mode === "single_select" && current.options.length > 0 && (
        <div className={styles.options}>
          {current.options.map((o) => {
            const isChosen = chosen?.reply === optionAnswer(o);
            return (
              <button
                key={o.id}
                className={cn(styles.option, isChosen && styles.optionOn)}
                disabled={locked}
                onClick={() => setAnswer(optionAnswer(o), o.label)}
              >
                <span className={styles.optionLabel}>{o.label}</span>
                {o.hint && <span className={styles.optionHint}>{o.hint}</span>}
              </button>
            );
          })}
        </div>
      )}

      {current.mode === "multi_select" && current.options.length > 0 && (
        <>
          <div className={styles.options}>
            {current.options.map((o) => {
              const on = checked.has(o.id);
              return (
                <button
                  key={o.id}
                  className={cn(styles.option, on && styles.optionOn)}
                  disabled={locked}
                  onClick={() => toggle(o.id)}
                >
                  <span className={styles.checkbox}>{on ? "✓" : ""}</span>
                  <span className={styles.optionLabel}>{o.label}</span>
                  {o.hint && <span className={styles.optionHint}>{o.hint}</span>}
                </button>
              );
            })}
          </div>
          <button
            className={styles.setBtn}
            disabled={locked || checked.size === 0}
            onClick={() => {
              const sel = current.options.filter((o) => checked.has(o.id));
              setAnswer(sel.map(optionAnswer).join(" + "), sel.map((o) => o.label).join(", "));
            }}
          >
            Set
          </button>
        </>
      )}

      {current.mode === "open_text" && (
        <form
          className={styles.openRow}
          onSubmit={(e) => {
            e.preventDefault();
            setAnswer(text, text);
          }}
        >
          <input
            className={styles.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type your answer…"
            disabled={locked}
          />
          <button className={styles.setBtn} type="submit" disabled={locked || !text.trim()}>
            Set
          </button>
        </form>
      )}

      {current.allow_search && !locked && (
        <div className={styles.search}>
          <div className={styles.searchLabel}>
            {current.options.length > 0 ? "Not listed? Search all companies:" : "Search companies:"}
          </div>
          <SecuritySearch
            onSelect={(s: Security) =>
              setAnswer(securityAnswer(s), s.security_name ?? s.symbol ?? "Selected")
            }
          />
        </div>
      )}

      <div className={styles.footer}>
        <span className={styles.progress}>
          {submitted
            ? "Got it — continuing…"
            : total > 1
              ? `${answeredCount} of ${total} answered`
              : ""}
        </span>
        <button
          type="button"
          className={styles.submit}
          disabled={locked || !allAnswered}
          onClick={submit}
        >
          {total > 1 ? "Submit answers" : "Submit"}
        </button>
      </div>
    </div>
  );
}
