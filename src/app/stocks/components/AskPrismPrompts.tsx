"use client";

import * as React from "react";

import styles from "./stocks.module.css";

// Suggested research prompts that route into the chat (PRISM agent).
const PROMPTS = [
  "Compare TCS and Infosys on margins and growth",
  "How is HDFC Bank doing in the news?",
  "Latest Q4 results from Reliance Industries",
  "Which Nifty 50 bank looks strongest right now?",
];

/** A strip of one-click research prompts → the PRISM chat. Hidden if no handler. */
export default function AskPrismPrompts({ onAsk }: { onAsk?: (query: string) => void }) {
  if (!onAsk) return null;
  return (
    <section className={styles.askStrip}>
      <span className={styles.askLabel}>Ask PRISM</span>
      <div className={styles.askChips}>
        {PROMPTS.map((p) => (
          <button key={p} className={styles.askChip} onClick={() => onAsk(p)}>
            {p}
          </button>
        ))}
      </div>
    </section>
  );
}
