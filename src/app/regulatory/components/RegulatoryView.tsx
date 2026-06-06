"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

import RegDashboard from "./RegDashboard";
import ContentLibrary from "./ContentLibrary";
import RegCalendar from "./RegCalendar";
import WeeklyDigest from "./WeeklyDigest";
import WatchlistAlerts from "./WatchlistAlerts";
import PolicyTracker from "./PolicyTracker";
import DocumentDetail from "./DocumentDetail";
import styles from "./regulatory.module.css";

type SubView = "dashboard" | "library" | "watchlist" | "calendar" | "tracker" | "digest";

const SUB_IDS = new Set<string>([
  "dashboard",
  "library",
  "watchlist",
  "calendar",
  "tracker",
  "digest",
]);

/** Build the `/regulatory?view=…` URL for a tab (so each tab is shareable and
 *  survives a refresh). "dashboard" is the default → it stays the bare
 *  `/regulatory` (no `?view=dashboard`) so the default view has ONE canonical
 *  URL, matching the sidebar link. */
function regUrl(view: SubView, type?: string): string {
  if (view === "dashboard" && !type) return "/regulatory";
  const qs = new URLSearchParams({ view });
  if (type) qs.set("type", type);
  return `/regulatory?${qs.toString()}`;
}

const TABS: { id: SubView; label: string; icon: React.ReactNode }[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" />
        <rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" />
      </svg>
    ),
  },
  {
    id: "library",
    label: "Content Library",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    id: "watchlist",
    label: "Watchlist & Alerts",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: "tracker",
    label: "Policy Pipeline",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
    ),
  },
  {
    id: "digest",
    label: "Weekly Digest",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
];

interface RegulatoryViewProps {
  /** Route an "Ask PRISM about this document" query into Research Chat. */
  onAsk?: (query: string) => void;
}

/**
 * Regulatory Lens — SEBI regulatory intelligence over the read-only `content`
 * corpus. A sticky sub-nav switches between Dashboard, Content Library,
 * Watchlist & Alerts, Calendar, Policy Pipeline and Weekly Digest; documents
 * open in a slide-over detail drawer.
 *
 * Styling: CSS Modules (regulatory.module.css) + Lakshya tokens. The active tab
 * is mirrored to the URL (`/regulatory?view=…`) so each sub-view is shareable
 * and survives a refresh (read client-side on mount; `?type`/`?doc` deep-link in
 * too).
 */
export default function RegulatoryView({ onAsk }: RegulatoryViewProps) {
  const router = useRouter();
  const [sub, setSub] = React.useState<SubView>("dashboard");
  const [selectedDoc, setSelectedDoc] = React.useState<number | null>(null);
  const [libraryType, setLibraryType] = React.useState<string | undefined>(undefined);

  // Initial deep-link (client-only — avoids the useSearchParams Suspense dance).
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get("view");
    const t = sp.get("type");
    const d = sp.get("doc");
    if (t) {
      setLibraryType(t);
      setSub("library");
    }
    if (v && SUB_IDS.has(v)) setSub(v as SubView);
    if (d && /^\d+$/.test(d)) setSelectedDoc(Number(d));
  }, []);

  // Switch tab + mirror it to the URL (drops any library type filter).
  const goSub = React.useCallback(
    (s: SubView) => {
      setSub(s);
      setLibraryType(undefined);
      router.replace(regUrl(s), { scroll: false });
    },
    [router],
  );

  const openDoc = React.useCallback((id: number) => setSelectedDoc(id), []);
  const goLibrary = React.useCallback(
    (type?: string) => {
      setLibraryType(type);
      setSub("library");
      router.replace(regUrl("library", type), { scroll: false });
    },
    [router],
  );

  return (
    <div className={styles.page}>
      <nav className={styles.subnav}>
        <div className={styles.subnavTabs}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={cn(styles.tab, sub === t.id && styles.tabActive)}
              onClick={() => goSub(t.id)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {sub === "dashboard" && (
        <RegDashboard
          onOpenDoc={openDoc}
          onGoLibrary={goLibrary}
          onGoCalendar={() => goSub("calendar")}
          onGoDigest={() => goSub("digest")}
        />
      )}
      {sub === "library" && (
        <ContentLibrary initialType={libraryType} onOpenDoc={openDoc} />
      )}
      {sub === "watchlist" && (
        <WatchlistAlerts onOpenDoc={openDoc} onGoLibrary={goLibrary} />
      )}
      {sub === "calendar" && <RegCalendar onOpenDoc={openDoc} />}
      {sub === "tracker" && <PolicyTracker onOpenDoc={openDoc} onGoLibrary={goLibrary} />}
      {sub === "digest" && <WeeklyDigest />}

      <DocumentDetail
        id={selectedDoc}
        onClose={() => setSelectedDoc(null)}
        onAsk={onAsk}
      />
    </div>
  );
}
