"use client";

import { AlertTriangle, ArrowLeft, Box, Download, FileText, FileX, GitCompareArrows, Home, Library, LayoutGrid, Loader2, Sparkles } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api/client";
import {
  fetchBmcExportObjectUrl,
  useBMC,
  useBMCVersion,
  useGenerateBMC,
  type BMCBlock as BMCBlockData,
  type BMCEvidence,
} from "@/lib/api/bmc";
import SecuritySearch from "@/app/stocks/components/SecuritySearch";
import FilingPdfViewer, { type FilingPdfSource } from "@/app/chat/components/FilingPdfViewer";

import BMCBlock from "./BMCBlock";
import BMCEvidencePanel from "./BMCEvidencePanel";
import BMCVersionTimeline from "./BMCVersionTimeline";
import BMCDiffView from "./BMCDiffView";
import BMC3DExplorer from "./BMC3DExplorer";
import BMCLibrary from "./BMCLibrary";
import BMCHome from "./BMCHome";
import styles from "./BMCView.module.css";

/** block_id → Osterwalder grid-area class (applied only ≥1200px; below that the
 *  blocks flow in canonical order). */
const AREA_CLASS: Record<string, string> = {
  key_partnerships: styles.aKp,
  key_activities: styles.aKa,
  key_resources: styles.aKr,
  value_propositions: styles.aVp,
  customer_relationships: styles.aCr,
  channels: styles.aCh,
  customer_segments: styles.aCs,
  cost_structure: styles.aCost,
  revenue_streams: styles.aRev,
};

interface BMCViewProps {
  /** Ticker to open with (from chat handoff `?ticker=` or `@bmc`). */
  initialTicker?: string | null;
  /** Tab to open with (from `?tab=` deep link). */
  initialTab?: Tab;
}

type Mode = "canvas" | "explore" | "compare";
type Tab = "home" | "library";

export default function BMCView({ initialTicker, initialTab }: BMCViewProps) {
  const [tab, setTab] = React.useState<Tab>(initialTab ?? "home");
  const [ticker, setTicker] = React.useState<string | null>(initialTicker ?? null);
  const [securityId, setSecurityId] = React.useState<number | null>(null);
  const [companyName, setCompanyName] = React.useState<string | null>(null);
  const [activeVersion, setActiveVersion] = React.useState<number | null>(null);
  const [mode, setMode] = React.useState<Mode>("canvas");
  const [selectedBlock, setSelectedBlock] = React.useState<BMCBlockData | null>(null);
  const [pdfSource, setPdfSource] = React.useState<FilingPdfSource | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const latest = useBMC(ticker);
  const versioned = useBMCVersion(ticker, activeVersion);
  const generate = useGenerateBMC(ticker);

  // Follow a ticker pushed by the parent (chat handoff).
  React.useEffect(() => {
    if (initialTicker) {
      setTab("home");
      setTicker(initialTicker);
      setSecurityId(null);
      setActiveVersion(null);
      setSelectedBlock(null);
      setMode("canvas");
    }
  }, [initialTicker]);

  // Reflect tab + company in the URL (query params, like the stock dashboard's
  // ?security=) so views are deep-linkable and the address bar tracks state.
  // history.replaceState is a shallow update — no route re-navigation, no loop.
  const syncUrl = React.useCallback((nextTab: Tab, nextTicker: string | null) => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    if (nextTab === "library") sp.set("tab", "library");
    else sp.delete("tab");
    if (nextTicker) sp.set("ticker", nextTicker);
    else sp.delete("ticker");
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, []);

  // Return to the Home dashboard — clears any open canvas. The single source of
  // truth for "go home", used by the Home tab AND the in-canvas back link, so
  // there's always an obvious, consistent way back to the dashboard.
  const goDashboard = () => {
    setTicker(null);
    setSecurityId(null);
    setCompanyName(null);
    setActiveVersion(null);
    setSelectedBlock(null);
    setMode("canvas");
    setTab("home");
    syncUrl("home", null);
  };

  const selectTab = (t: Tab) => {
    if (t === "home") {
      goDashboard();
      return;
    }
    setTab(t);
    syncUrl(t, ticker);
  };

  // Open a canvas chosen from the Library gallery / Continue cards, in Home.
  const openFromLibrary = (t: string, name?: string | null) => {
    setTicker(t);
    setSecurityId(null);
    setCompanyName(name ?? null);
    setActiveVersion(null);
    setSelectedBlock(null);
    setMode("canvas");
    setTab("home");
    syncUrl("home", t);
  };

  const bmc = activeVersion != null ? versioned.data : latest.data;
  const isLoading = (activeVersion != null ? versioned.isLoading : latest.isLoading) && !!ticker;
  const noCanvasYet =
    latest.isError && latest.error instanceof ApiError && latest.error.status === 404;

  const onPickCompany = (s: { symbol: string | null; security_id: number; security_name: string | null }) => {
    const t = s.symbol ?? s.security_name ?? String(s.security_id);
    setTicker(t);
    setSecurityId(s.security_id);
    setCompanyName(s.security_name);
    setActiveVersion(null);
    setSelectedBlock(null);
    setMode("canvas");
    setTab("home");
    syncUrl("home", t);
  };

  // Build a suggested company (from the Home dashboard) — same path as a pick.
  const onBuild = (symbol: string, securityId: number, name: string | null) =>
    onPickCompany({ symbol, security_id: securityId, security_name: name });

  const openPdf = (ev: BMCEvidence) => {
    if (!ev.pdf_url) return;
    setPdfSource({
      url: ev.pdf_url,
      page: ev.page,
      label: `${bmc?.company_name ?? ticker} — ${ev.marker}`,
    });
  };

  const handleExport = async (format: "pdf" | "json") => {
    if (!ticker || !bmc) return;
    setExporting(true);
    try {
      const objUrl = await fetchBmcExportObjectUrl(ticker, bmc.version, format);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `${ticker}_BMC_v${bmc.version}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
    } catch {
      /* surfaced via the disabled state; a toast could be added */
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className={styles.view}>
      <div className={styles.main}>
        {/* ── Top tabs ── */}
        <nav className={styles.tabBar} role="tablist" aria-label="BMC sections">
          <button
            role="tab"
            aria-selected={tab === "home"}
            className={cn(styles.tabBtn, tab === "home" && styles.tabBtnActive)}
            onClick={() => selectTab("home")}
          >
            <Home size={14} /> Home
          </button>
          <button
            role="tab"
            aria-selected={tab === "library"}
            className={cn(styles.tabBtn, tab === "library" && styles.tabBtnActive)}
            onClick={() => selectTab("library")}
          >
            <Library size={14} /> Library
          </button>
        </nav>

        {tab === "library" && <BMCLibrary onOpen={openFromLibrary} />}

        {/* Idle Home = the dashboard (owns its own hero + search). */}
        {tab === "home" && !ticker && (
          <BMCHome onPickCompany={onPickCompany} onOpen={openFromLibrary} onBuild={onBuild} />
        )}

        {/* Active Home = the canvas workspace for the open company. */}
        {tab === "home" && ticker && (
        <>
        {/* ── Header / controls ── */}
        <header className={styles.header}>
          <button type="button" className={styles.backLink} onClick={goDashboard}>
            <ArrowLeft size={14} /> Dashboard
          </button>
          <div className={styles.titleRow}>
            <LayoutGrid size={18} className={styles.icon} />
            <div className={styles.titleStack}>
              <span className={styles.eyebrow}>Business Model Canvas</span>
              <h1 className={styles.title}>
                {(() => {
                  const displayName = bmc?.company_name ?? companyName ?? ticker;
                  // Only show the ticker chip when it's a real symbol (short, no
                  // spaces) distinct from the name — library tickers can be the
                  // full company name, where a chip would just duplicate it.
                  const showBadge =
                    !!ticker && ticker !== displayName && !ticker.includes(" ") && ticker.length <= 20;
                  return (
                    <>
                      <span>{displayName}</span>
                      {showBadge && <span className={styles.tickerBadge}>{ticker}</span>}
                    </>
                  );
                })()}
              </h1>
            </div>
          </div>
          <p className={styles.subtitle}>
            A filing‑grounded 9‑block map of how a company creates, delivers, and captures value.
            Every fact cites a primary source — click a marker to open the exact filing page.
          </p>

          <div className={styles.controls}>
            <div className={styles.picker}>
              <SecuritySearch onSelect={onPickCompany} selectedId={securityId} />
            </div>
            {ticker && (
              <button
                className={cn(styles.btn, styles.btnPrimary)}
                onClick={() => generate.mutate({ securityId: securityId ?? undefined })}
                disabled={generate.isPending}
                title="Build a fresh canvas from the latest filings (~30s)"
              >
                {generate.isPending ? (
                  <><Loader2 size={15} className={styles.spin} /> Generating…</>
                ) : (
                  <><Sparkles size={15} /> {bmc ? "Regenerate" : "Generate"}</>
                )}
              </button>
            )}
          </div>

          {bmc && (
            <div className={styles.toolbar}>
              <div className={styles.modeToggle} role="tablist">
                <button
                  role="tab"
                  className={cn(styles.modeBtn, mode === "canvas" && styles.modeBtnActive)}
                  onClick={() => setMode("canvas")}
                >
                  <LayoutGrid size={13} /> Canvas
                </button>
                <button
                  role="tab"
                  className={cn(styles.modeBtn, mode === "explore" && styles.modeBtnActive)}
                  onClick={() => setMode("explore")}
                >
                  <Box size={13} /> 3D Explorer
                </button>
                <button
                  role="tab"
                  className={cn(styles.modeBtn, mode === "compare" && styles.modeBtnActive)}
                  onClick={() => setMode("compare")}
                >
                  <GitCompareArrows size={13} /> Compare periods
                </button>
              </div>
              <div className={styles.toolbarRight}>
                <span
                  className={cn(
                    styles.statusBadge,
                    bmc.status === "complete" ? styles.statusComplete : styles.statusPartial,
                  )}
                >
                  {bmc.status} · v{bmc.version}
                  {bmc.overall_confidence != null
                    ? ` · ${Math.round(bmc.overall_confidence * 100)}%`
                    : ""}
                </span>
                <button
                  className={styles.exportBtn}
                  onClick={() => handleExport("pdf")}
                  disabled={exporting}
                  title="Download as PDF"
                >
                  {exporting ? <Loader2 size={13} className={styles.spin} /> : <Download size={13} />} PDF
                </button>
              </div>
            </div>
          )}
        </header>

        {/* ── States ── */}
        {generate.isError && (
          <p className={styles.errorText}>
            Generation failed: {(generate.error as Error)?.message ?? "unknown error"}
          </p>
        )}

        {isLoading && (
          <div className={styles.skeletonGrid}>
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className={styles.skeletonCell} />
            ))}
          </div>
        )}

        {noCanvasYet && !generate.isPending && (
          <div className={styles.emptyCard}>
            <p className={styles.emptyTitle}>No canvas for <span className={styles.mono}>{ticker}</span> yet.</p>
            <p className={styles.emptyHint}>
              Click <strong>Generate</strong> — PRISM builds a 9‑block canvas grounded in{" "}
              {companyName ?? ticker}&apos;s filings (~30s).
            </p>
          </div>
        )}

        {bmc?.needs_clarification && bmc.clarification && (
          <div className={styles.notice}>
            <div className={styles.noticeTitle}><AlertTriangle size={14} /> Clarification needed</div>
            <p className={styles.noticeBody}>{bmc.clarification}</p>
          </div>
        )}

        {bmc && bmc.gaps && bmc.gaps.length > 0 && (
          <div className={styles.notice}>
            <div className={styles.noticeTitle}>
              <FileX size={14} /> {bmc.gaps.length} filing slot{bmc.gaps.length === 1 ? "" : "s"} missing —
              canvas built from the rest
            </div>
            <div className={styles.gapChips}>
              {bmc.gaps.map((slot) => (
                <span key={slot} className={styles.gapChip}>{slot.replace(/_/g, " ")}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── Canvas ── */}
        {bmc && mode === "canvas" && (
          <>
            <div className={styles.canvas}>
              {bmc.blocks.map((block) => (
                <div key={block.block_id} className={cn(styles.cell, AREA_CLASS[block.block_id])}>
                  <BMCBlock block={block} onOpenPdf={openPdf} onDrillDown={setSelectedBlock} />
                </div>
              ))}
            </div>

            {bmc.selected_filings && bmc.selected_filings.length > 0 && (
              <div className={styles.sources}>
                <span className={styles.sourcesLabel}><FileText size={12} /> Built from</span>
                {bmc.selected_filings.map((f, i) =>
                  f.pdf_url ? (
                    <a key={i} className={styles.sourceChip} href={f.pdf_url} target="_blank" rel="noreferrer noopener">
                      {(f.slot ?? f.category ?? "filing").replace(/_/g, " ")}
                      {f.announcement_dt ? ` · ${f.announcement_dt}` : ""} ↗
                    </a>
                  ) : (
                    <span key={i} className={styles.sourceChip}>
                      {(f.slot ?? f.category ?? "filing").replace(/_/g, " ")}
                    </span>
                  ),
                )}
              </div>
            )}

            <BMCVersionTimeline
              ticker={ticker}
              activeVersion={activeVersion ?? bmc.version}
              latestVersion={latest.data?.version ?? null}
              onSelect={(v) => {
                setActiveVersion(v === (latest.data?.version ?? -1) ? null : v);
                setSelectedBlock(null);
              }}
            />
          </>
        )}

        {/* ── 3D Explorer (force-graph) ── */}
        {bmc && mode === "explore" && (
          <BMC3DExplorer bmc={bmc} onSelectBlock={setSelectedBlock} />
        )}

        {/* ── Compare periods (temporal diff) ── */}
        {bmc && mode === "compare" && ticker && (
          <BMCDiffView ticker={ticker} companyName={bmc.company_name ?? ticker} />
        )}
        </>
        )}
      </div>

      {/* Per-block evidence + drill-down chat */}
      {selectedBlock && (
        <BMCEvidencePanel
          block={selectedBlock}
          ticker={ticker}
          onOpenPdf={openPdf}
          onClose={() => setSelectedBlock(null)}
        />
      )}

      {/* Citation → source PDF (reuses the chat's viewer) */}
      {pdfSource && <FilingPdfViewer source={pdfSource} onClose={() => setPdfSource(null)} />}
    </div>
  );
}
