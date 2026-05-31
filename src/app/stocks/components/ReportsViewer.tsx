"use client";

import * as React from "react";

import {
  REPORT_CATEGORIES,
  useReports,
  type ReportCategory,
  type ReportFiling,
} from "@/lib/api/stocks";
import { cn } from "@/lib/utils";

import Dropdown from "./Dropdown";
import styles from "./stocks.module.css";

const PAGE = 12;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-04-24T19:29:46" → "24 Apr 2026". */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const categoryOptions = REPORT_CATEGORIES.map((c) => ({ value: c, label: c }));

interface ReportsViewerProps {
  company: string | null;
}

/**
 * Two independent 50/50 panels stacked below Annual Financials:
 *  • "Reports Viewer" — a category picker + a boxed, scrollable filings list
 *    with numbered pagination (each filing opens its PDF in a new tab).
 *  • "Announcements" — a boxed "coming soon" placeholder (no API yet).
 * Filings come from the stock-chat service via the same-origin `/filings-svc`
 * rewrite (see next.config.ts) — no CORS / mixed-content in production.
 */
export default function ReportsViewer({ company }: ReportsViewerProps) {
  const [category, setCategory] = React.useState<ReportCategory>("Annual Report");
  const [page, setPage] = React.useState(1);

  // Restart paging when the company or category changes.
  React.useEffect(() => setPage(1), [company, category]);

  const offset = (page - 1) * PAGE;
  const { data, isLoading, isError, error, isFetching } = useReports(company, category, PAGE, offset);
  const filings = data?.filings ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const unresolved = !!data && data.resolved_company === null;

  return (
    <div className={styles.reportsRow}>
      {/* ── Reports Viewer panel ── */}
      <div className={styles.reportsCol}>
        <div className={styles.dashSectionHead}>
          <h2 className={styles.dashSectionTitle}>Reports Viewer</h2>
        </div>

        <div className={styles.reportsBox}>
          <div className={styles.reportsControls}>
            <Dropdown
              value={category}
              options={categoryOptions}
              onChange={setCategory}
              ariaLabel="Report category"
              minWidth={196}
            />
            {data && !unresolved && (
              <span className={styles.reportsCount}>
                {data.resolved_company ?? company} · {total.toLocaleString()}{" "}
                {total === 1 ? "filing" : "filings"}
                {isFetching ? " · updating…" : ""}
              </span>
            )}
          </div>

          <div className={styles.reportsScroll}>
            {isLoading ? (
              <div className={styles.reportsList}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className={styles.reportSkeleton} />
                ))}
              </div>
            ) : isError ? (
              <div className={styles.reportsEmpty}>
                Couldn&apos;t load filings: {error?.message ?? "unknown error"}.
              </div>
            ) : unresolved ? (
              <div className={styles.reportsEmpty}>
                Couldn&apos;t find filings for “{company}”.
              </div>
            ) : filings.length === 0 ? (
              <div className={styles.reportsEmpty}>No {category} filings for this company.</div>
            ) : (
              <div className={styles.reportsList}>
                {filings.map((f) => (
                  <FilingRow key={f.newsid} filing={f} category={category} />
                ))}
              </div>
            )}
          </div>

          {totalPages > 1 && !unresolved && (
            <Pager page={page} totalPages={totalPages} disabled={isFetching} onGo={setPage} />
          )}
        </div>
      </div>

      {/* ── Announcements panel (disabled — coming soon) ── */}
      <div className={styles.reportsCol}>
        <div className={styles.dashSectionHead}>
          <h2 className={styles.dashSectionTitle}>Announcements</h2>
        </div>
        <div className={styles.announceBox}>
          <div className={styles.announceIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 11l18-5v12L3 14v-3z" />
              <path d="M11.6 16.8a3 3 0 0 1-5.8-1.1V14" />
            </svg>
          </div>
          <div className={styles.announceTitle}>Announcements</div>
          <div className={styles.announceText}>
            Corporate announcements &amp; financial filings will appear here.
          </div>
          <span className={styles.announceSoon}>Coming soon</span>
        </div>
      </div>
    </div>
  );
}

/* ── Numbered pager (← 1 2 3 4 5 → · Page X of Y) ───────────────────────── */
function Pager({
  page,
  totalPages,
  disabled,
  onGo,
}: {
  page: number;
  totalPages: number;
  disabled: boolean;
  onGo: (p: number) => void;
}) {
  const count = Math.min(5, totalPages);
  let start = Math.max(1, page - 2);
  if (start + count - 1 > totalPages) start = Math.max(1, totalPages - count + 1);
  const nums = Array.from({ length: count }, (_, i) => start + i);

  return (
    <div className={styles.pager}>
      <button className={styles.pageBtn} disabled={page <= 1 || disabled} onClick={() => onGo(page - 1)}>
        ←
      </button>
      {nums.map((p) => (
        <button
          key={p}
          className={cn(styles.pageBtn, p === page && styles.pageBtnActive)}
          disabled={disabled}
          onClick={() => onGo(p)}
        >
          {p}
        </button>
      ))}
      <button
        className={styles.pageBtn}
        disabled={page >= totalPages || disabled}
        onClick={() => onGo(page + 1)}
      >
        →
      </button>
      <span className={styles.pageInfo}>
        Page {page} of {totalPages.toLocaleString()}
      </span>
    </div>
  );
}

function FilingRow({ filing, category }: { filing: ReportFiling; category: ReportCategory }) {
  const title = filing.headline || filing.news_subject || filing.subcategory || "Filing";
  const descRaw = filing.subcategory || filing.news_subject || "";
  const desc = descRaw && descRaw.trim() !== title.trim() ? descRaw : "";

  return (
    <div className={styles.reportItem}>
      <div className={styles.reportMeta}>
        <span className={styles.reportDate}>{fmtDate(filing.announcement_dt)}</span>
        <span className={styles.reportChip}>{filing.category || category}</span>
      </div>
      <div className={styles.reportBody}>
        <div className={styles.reportTitle} title={title}>{title}</div>
        {desc && <div className={styles.reportDesc} title={desc}>{desc}</div>}
      </div>
      {filing.pdf_link ? (
        <a
          className={styles.reportLink}
          href={filing.pdf_link}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open PDF
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      ) : (
        <span className={styles.reportNoLink}>No PDF</span>
      )}
    </div>
  );
}
