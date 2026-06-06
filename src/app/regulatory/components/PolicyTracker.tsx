"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { formatRegDate, useRegFeed, type RegTone } from "@/lib/api/regulatory";

import { toneClass } from "./parts";
import styles from "./regulatory.module.css";

interface Props {
  onOpenDoc: (id: number) => void;
  onGoLibrary: (type?: string) => void;
}

/** Stage columns. NOTE: the SEBI data has no field threading one policy across
 *  stages, so this is an honest "recent activity by stage" board (grouped by
 *  document type), not a true per-policy lifecycle. */
const STAGES: { type: string; name: string; tone: RegTone }[] = [
  { type: "CONSULTATION_PAPER", name: "Consultation", tone: "con" },
  { type: "BOARD_MEETING", name: "Board Outcomes", tone: "bm" },
  { type: "REGULATION", name: "Notified Regulations", tone: "reg" },
  { type: "GAZETTE_NOTIFICATION", name: "Gazetted", tone: "con" },
  { type: "MASTER_CIRCULAR", name: "In Force (Master)", tone: "mc" },
];

export default function PolicyTracker({ onOpenDoc, onGoLibrary }: Props) {
  return (
    <>
      <div className={styles.notice}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          Recent policy activity grouped by stage. SEBI&apos;s data doesn&apos;t
          thread a single policy across its lifecycle, so these columns show the
          latest documents at each stage rather than one item moving left-to-right.
        </span>
      </div>
      <div className={styles.pipeline}>
        {STAGES.map((s) => (
          <PipelineColumn key={s.type} stage={s} onOpenDoc={onOpenDoc} onGoLibrary={onGoLibrary} />
        ))}
      </div>
    </>
  );
}

function PipelineColumn({
  stage,
  onOpenDoc,
  onGoLibrary,
}: {
  stage: { type: string; name: string; tone: RegTone };
  onOpenDoc: (id: number) => void;
  onGoLibrary: (type?: string) => void;
}) {
  const feed = useRegFeed({ type: stage.type, limit: 6, page: 1 });
  const items = feed.data?.items ?? [];

  return (
    <div className={styles.pipeColumn}>
      <div className={styles.pipeHead}>
        <button className={styles.pipeName} onClick={() => onGoLibrary(stage.type)}>
          {stage.name}
        </button>
        <span className={styles.pipeCount}>{feed.data?.total ?? "—"}</span>
      </div>
      {feed.isLoading ? (
        <>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className={styles.pipeSkeleton} />
          ))}
        </>
      ) : items.length > 0 ? (
        items.map((d) => (
          <button key={d.id} className={styles.pipeCard} onClick={() => onOpenDoc(d.id)}>
            <span className={cn(styles.pipeStripe, toneClass(stage.tone))} />
            <span className={styles.pipeCardTitle}>{d.title}</span>
            <span className={styles.pipeCardMeta}>{formatRegDate(d.date) || "Undated"}</span>
          </button>
        ))
      ) : (
        <div className={styles.pipeEmpty}>None at this stage.</div>
      )}
    </div>
  );
}
