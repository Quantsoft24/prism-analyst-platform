"use client";

import * as React from "react";

import type { PlanStep } from "@/lib/api/chat";
import { cn } from "@/lib/utils";

import styles from "./TaskChecklist.module.css";

/** The agent's live task checklist (Claude-Code-style). Renders the latest
 *  `update_plan` steps with status — done ✓, in-progress (animated), pending. */
export default function TaskChecklist({ steps }: { steps: PlanStep[] }) {
  if (!steps?.length) return null;
  const done = steps.filter((s) => s.status === "done").length;

  return (
    <div className={styles.wrap} role="list" aria-label="Agent task list">
      <div className={styles.header}>
        <span className={styles.title}>Plan</span>
        <span className={styles.count}>
          {done}/{steps.length}
        </span>
      </div>
      {steps.map((s) => (
        <div
          key={s.id || s.title}
          role="listitem"
          className={cn(
            styles.step,
            s.status === "done" && styles.stepDone,
            s.status === "in_progress" && styles.stepActive,
          )}
        >
          <span className={styles.box} aria-hidden>
            {s.status === "done" ? (
              "✓"
            ) : s.status === "in_progress" ? (
              <span className={styles.spinner} />
            ) : null}
          </span>
          <span className={styles.label}>{s.title}</span>
        </div>
      ))}
    </div>
  );
}
