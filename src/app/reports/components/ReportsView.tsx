"use client";

import { useState } from "react";
import { MOCK_REPORTS, type ReportTileData } from "@/lib/mockData";
import styles from "./ReportsView.module.css";

/* ── Category color mapping ── */
const CAT_COLORS: Record<string, { bg: string; color: string }> = {
  accent: { bg: "var(--accent-soft)", color: "var(--accent)" },
  info: { bg: "var(--info-soft)", color: "var(--info)" },
  pos: { bg: "var(--pos-soft)", color: "var(--pos)" },
  warn: { bg: "var(--warn-soft)", color: "var(--warn)" },
};

/* ── Filter pills ── */
const FILTERS = [
  { label: "All · 47", key: "all" },
  { label: "Quarterly briefs", key: "Quarterly Brief" },
  { label: "Peer comp", key: "Peer Comparison" },
  { label: "DCF models", key: "DCF Model" },
  { label: "Sector notes", key: "Sector Note" },
];

/* ── Report Tile ── */
function ReportTile({ report, onClick }: { report: ReportTileData; onClick: () => void }) {
  const catStyle = CAT_COLORS[report.categoryColor] || CAT_COLORS.accent;

  return (
    <div className={styles.reportTile} onClick={onClick}>
      <span
        className={styles.reportTileCat}
        style={{ background: catStyle.bg, color: catStyle.color }}
      >
        {report.category}
      </span>
      <div className={styles.reportTileTitle}>{report.title}</div>
      <div className={styles.reportTileDesc}>{report.desc}</div>
      <div className={styles.reportTileFoot}>
        <span>{report.time}</span>
        <span className={styles.dotSep} />
        <span>{report.sources}</span>
        <span className={styles.dotSep} />
        <span>{report.extra}</span>
      </div>
    </div>
  );
}

/* ── Main Reports View ── */
interface ReportsViewProps {
  onReportClick: (intentKey: string) => void;
}

export default function ReportsView({ onReportClick }: ReportsViewProps) {
  const [activeFilter, setActiveFilter] = useState("all");

  const filteredReports = activeFilter === "all"
    ? MOCK_REPORTS
    : MOCK_REPORTS.filter((r) => r.category === activeFilter);

  return (
    <div className={styles.reportsView}>
      {/* Hero */}
      <div className={styles.hero}>
        <div className={styles.heroEyebrow}>— Reports Library</div>
        <h1 className={styles.heroTitle}>Your published research</h1>
        <p className={styles.heroDesc}>
          Auto-saved when you publish. Searchable across companies, sectors, and KPIs.
        </p>
      </div>

      {/* Notice */}
      <div className={styles.notice}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>
          <strong>Citations matter.</strong> Every figure in a published report is linked to its source filing. Hover any number to verify provenance.
        </span>
      </div>

      {/* Toolbar */}
      <div className={styles.reportsToolbar}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={activeFilter === f.key ? styles.filterPillActive : styles.filterPill}
            onClick={() => setActiveFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <div className={styles.toolbarSpacer} />
        <button className={styles.filterPill}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
            <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
          </svg>
          Filter
        </button>
        <button className={styles.filterPill}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="13" y1="18" x2="21" y2="18" />
          </svg>
          Sort: Latest
        </button>
      </div>

      {/* Grid */}
      <div className={styles.reportsGrid}>
        {filteredReports.map((report, i) => (
          <ReportTile
            key={i}
            report={report}
            onClick={() => report.intentKey && onReportClick(report.intentKey)}
          />
        ))}
      </div>
    </div>
  );
}
