"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavView } from "@/lib/mockData";
import styles from "./Topbar.module.css";

/* ── View display names (keyed by route segment / NavView) ── */
const VIEW_LABELS: Record<NavView, string> = {
  dashboard: "Dashboard",
  chat: "Research Chat",
  bmc: "Business Model Canvas",
  news: "News & Sentiment",
  stocks: "Stock Dashboard",
  regulatory: "Regulatory Lens",
  portfolio: "Portfolio Builder",
  account: "My Activity",
  settings: "Settings",
};

/** Home a breadcrumb root links to. Dashboard is the workspace landing page. */
const HOME_HREF = "/dashboard";

/** "deal-flow" → "Deal Flow" — fallback label for unknown/dynamic segments. */
function titleCase(seg: string): string {
  return decodeURIComponent(seg).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Crumb {
  label: string;
  href: string;
}

/** Build the trail from the URL so it's always accurate, on every route.
 *  Accumulates hrefs (`/a`, `/a/b`, …) so nested routes get clickable parents. */
function buildCrumbs(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [];
  let href = "";
  for (const seg of pathname.split("/").filter(Boolean)) {
    href += `/${seg}`;
    crumbs.push({ label: VIEW_LABELS[seg as NavView] ?? titleCase(seg), href });
  }
  return crumbs;
}

/* ── Props ── */
interface TopbarProps {
  onOpenSidebar: () => void;
  onSearchFocus?: () => void;
  onNavigate: (view: NavView) => void;
}

/* ── Component ── */
export default function Topbar({
  onOpenSidebar,
  onSearchFocus,
  onNavigate,
}: TopbarProps) {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

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

      {/* Breadcrumbs — clickable trail derived from the current route */}
      <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
        <ol className={styles.breadList}>
          <li className={styles.breadItem}>
            <Link href={HOME_HREF} className={styles.breadLink}>PRISM</Link>
          </li>
          {crumbs.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <li key={c.href} className={styles.breadItem}>
                <span className={styles.breadSep} aria-hidden="true">/</span>
                {isLast ? (
                  <span className={styles.breadCurrent} aria-current="page">{c.label}</span>
                ) : (
                  <Link href={c.href} className={styles.breadLink}>{c.label}</Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

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
        {/* Notifications — routes to the Dashboard for now (a proper
            notifications panel + real feed comes later). */}
        <button
          className={styles.actionBtn}
          title="Notifications"
          aria-label="Notifications"
          onClick={() => onNavigate("dashboard")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
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
