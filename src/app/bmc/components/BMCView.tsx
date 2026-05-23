"use client";

import { AlertTriangle, Download, FileX, LayoutGrid, Loader2, Sparkles } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { config } from "@/lib/config";
import { ApiError } from "@/lib/api/client";
import { useBMC, useGenerateBMC, type BMCBlock as BMCBlockData } from "@/lib/api/bmc";

import BMCBlock from "./BMCBlock";
import BMC3DExplorer from "./BMC3DExplorer";
import BMCEvidencePanel from "./BMCEvidencePanel";
import styles from "./BMCView.module.css";

type ViewMode = "canvas" | "3d";

interface BMCViewProps {
  /** Optional ticker to open with (from `@bmc TCS` or a company click). */
  initialTicker?: string | null;
}

/**
 * Canvas layout: a clean responsive grid (CSS Modules + media queries). Equal
 * cards, content-sized height, same-row cards stretch to match. Backend returns
 * blocks pre-ordered (0..8) — reads in canonical sequence. A pixel-faithful
 * spanning Osterwalder layout can return in Phase 3 if there's demand.
 */
export default function BMCView({ initialTicker }: BMCViewProps) {
  const [ticker, setTicker] = React.useState<string>(initialTicker?.toUpperCase() ?? "");
  const [submitted, setSubmitted] = React.useState<string | null>(initialTicker?.toUpperCase() ?? null);
  const [selectedBlock, setSelectedBlock] = React.useState<BMCBlockData | null>(null);
  const [highlightMarker, setHighlightMarker] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<ViewMode>("canvas");

  const { data: bmc, isLoading, isError, error } = useBMC(submitted);
  const generate = useGenerateBMC(submitted);

  // Follow a new ticker pushed by the parent (e.g. via @bmc).
  React.useEffect(() => {
    if (initialTicker) {
      const t = initialTicker.toUpperCase();
      setTicker(t);
      setSubmitted(t);
      setSelectedBlock(null);
    }
  }, [initialTicker]);

  const handleLoad = () => {
    const t = ticker.trim().toUpperCase();
    if (t) {
      setSubmitted(t);
      setSelectedBlock(null);
    }
  };

  const handleCite = (block: BMCBlockData, marker: string) => {
    setSelectedBlock(block);
    setHighlightMarker(marker);
  };

  const noCanvasYet = isError && error instanceof ApiError && error.status === 404;

  return (
    <div className={styles.view}>
      <div className={styles.main}>
        {/* Header / controls */}
        <header className={styles.header}>
          <div className={styles.titleRow}>
            <LayoutGrid size={20} className={styles.icon} />
            <h1 className={styles.title}>Business Model Canvas</h1>
          </div>
          <p className={styles.subtitle}>
            Filing-grounded 9-block canvas. Every claim is cited to a primary source — click a
            citation marker to see the underlying filing excerpt.
          </p>
          <div className={styles.controls}>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLoad()}
              placeholder="Ticker (e.g. TCS, INFY)"
              className={styles.input}
              aria-label="Company ticker"
            />
            <button className={styles.btn} onClick={handleLoad} disabled={!ticker.trim()}>
              Load
            </button>
            {submitted && (
              <button
                className={cn(styles.btn, styles.btnPrimary)}
                onClick={() => generate.mutate(undefined)}
                disabled={generate.isPending}
              >
                {generate.isPending ? (
                  <>
                    <Loader2 size={16} className={styles.spin} /> Generating… (~30s)
                  </>
                ) : (
                  <>
                    <Sparkles size={16} /> {bmc ? "Regenerate" : "Generate"}
                  </>
                )}
              </button>
            )}
            {bmc && (
              <span className={styles.meta}>
                <span
                  className={cn(
                    styles.statusBadge,
                    bmc.status === "complete" ? styles.statusComplete : styles.statusPartial,
                  )}
                >
                  {bmc.status}
                </span>
                <span>
                  v{bmc.version}
                  {bmc.overall_confidence != null
                    ? ` · ${Math.round(bmc.overall_confidence * 100)}% confidence`
                    : ""}
                </span>
              </span>
            )}
          </div>

          {/* View toggle: 2D canvas (primary) vs 3D explore */}
          {bmc && (
            <div className={styles.viewToggle}>
              <button
                type="button"
                className={cn(styles.toggleBtn, viewMode === "canvas" && styles.toggleBtnActive)}
                onClick={() => setViewMode("canvas")}
              >
                Canvas
              </button>
              <button
                type="button"
                className={cn(styles.toggleBtn, viewMode === "3d" && styles.toggleBtnActive)}
                onClick={() => setViewMode("3d")}
              >
                3D Explore
              </button>
            </div>
          )}

          {/* Export — plain download links via PRISM's proxy. The upstream BMC
              service supports JSON + PDF (XLSX returns 501 — hidden until it
              ships). */}
          {bmc && submitted && (
            <div className={styles.exports}>
              <span className={styles.exportLabel}>
                <Download size={12} /> Export
              </span>
              {(["pdf", "json"] as const).map((fmt) => (
                <a
                  key={fmt}
                  className={styles.exportLink}
                  href={new URL(
                    `/api/v1/bmc/${encodeURIComponent(submitted)}/${bmc.version}/export?format=${fmt}`,
                    config.apiUrl,
                  ).toString()}
                  download
                >
                  {fmt.toUpperCase()}
                </a>
              ))}
            </div>
          )}
        </header>

        {/* States */}
        {generate.isError && (
          <p className={styles.errorText}>
            Generation failed: {(generate.error as Error)?.message ?? "unknown error"}
          </p>
        )}

        {isLoading && submitted && (
          <div className={styles.skeletonGrid}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className={styles.skeletonCell} />
            ))}
          </div>
        )}

        {noCanvasYet && !generate.isPending && (
          <div className={styles.emptyCard}>
            <p className={styles.emptyTitle}>
              No canvas for <span className={styles.mono}>{submitted}</span> yet.
            </p>
            <p className={styles.emptyHint}>
              Click <strong>Generate</strong> — PRISM will build a 9-block canvas grounded in{" "}
              {submitted}&apos;s ingested filings (~30s).
            </p>
          </div>
        )}

        {/* Clarification — the upstream couldn't pick a canvas with the
            available filings and asks a follow-up. */}
        {bmc?.needs_clarification && bmc.clarification && (
          <div className={styles.contradictions}>
            <div className={styles.contradictionsTitle}>
              <AlertTriangle size={14} />
              Clarification needed
            </div>
            <p className={styles.contradictionItem}>{bmc.clarification}</p>
          </div>
        )}

        {/* Gaps — filings the service wanted but couldn't locate (typically
            "investor_presentation"). Useful context for analysts. */}
        {bmc && bmc.gaps && bmc.gaps.length > 0 && (
          <div className={styles.contradictions}>
            <div className={styles.contradictionsTitle}>
              <FileX size={14} />
              {bmc.gaps.length} filing slot{bmc.gaps.length === 1 ? "" : "s"} missing — canvas
              built from the rest
            </div>
            <ul className={styles.contradictionsList}>
              {bmc.gaps.map((slot) => (
                <li key={slot} className={styles.contradictionItem}>
                  {slot.replace(/_/g, " ")}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* The canvas — 2D grid (primary) */}
        {bmc && viewMode === "canvas" && (
          <div className={styles.grid}>
            {bmc.blocks.map((block) => (
              <BMCBlock key={block.block_id} block={block} onCiteClick={handleCite} />
            ))}
          </div>
        )}

        {/* 3D explore mode — force-directed graph, secondary view */}
        {bmc && viewMode === "3d" && (
          <BMC3DExplorer
            bmc={bmc}
            onSelectBlock={(b) => {
              setSelectedBlock(b);
              setHighlightMarker(null);
            }}
          />
        )}
      </div>

      {/* Evidence side panel + per-block drill-down chat */}
      {selectedBlock && (
        <BMCEvidencePanel
          block={selectedBlock}
          ticker={submitted}
          highlightMarker={highlightMarker}
          onClose={() => setSelectedBlock(null)}
        />
      )}
    </div>
  );
}
