"use client";

import type { NavView } from "@/lib/mockData";
import styles from "./Topbar.module.css";

/* ── View display names ── */
const VIEW_LABELS: Record<NavView, string> = {
  dashboard: "Dashboard",
  chat: "Research Chat",
  companies: "Companies",
  bmc: "Business Model Canvas",
  news: "News & Sentiment",
  stocks: "Stock Dashboard",
  portfolio: "Portfolio Builder",
  reports: "Reports Library",
  account: "My Activity",
  settings: "Settings",
};

/* ── Props ── */
interface TopbarProps {
  activeView: NavView;
  onOpenSidebar: () => void;
  onSearchFocus?: () => void;
}

/* ── Component ── */
export default function Topbar({
  activeView,
  onOpenSidebar,
  onSearchFocus,
}: TopbarProps) {

  return (
    <header className={styles.topbar} role="banner">
      {/* Hamburger — mobile only */}
      <button
        className={styles.hamburger}
        onClick={onOpenSidebar}
        aria-label="Open navigation"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Breadcrumbs */}
      <div className={styles.breadcrumbs}>
        <span>PRISM</span>
        <span className={styles.breadSep}>/</span>
        <span>{VIEW_LABELS[activeView]}</span>
      </div>

      {/* Search — opens modal */}
      <div className={styles.searchBar} onClick={onSearchFocus} role="button" tabIndex={0}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className={styles.searchPlaceholder}>Search companies, reports...</span>
        <span className={styles.searchKbd}>⌘K</span>
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        {/* Notifications */}
        <button className={styles.actionBtn} title="Notifications" aria-label="Notifications">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span className={styles.notifDot} />
        </button>

        {/* Help */}
        <button className={styles.actionBtn} title="Help & keyboard shortcuts" aria-label="Help">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      </div>
    </header>
  );
}
