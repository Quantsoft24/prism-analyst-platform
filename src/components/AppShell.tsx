"use client";

import { useCallback, useEffect, useState } from "react";

import type { NavView } from "@/lib/mockData";
import { useTheme } from "@/hooks/useTheme";
import { useKeyboard } from "@/hooks/useKeyboard";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";

import styles from "./AppShell.module.css";

/* ── Props ── */
interface AppShellProps {
  activeView: NavView;
  onNavigate: (view: NavView) => void;
  onNewResearch: () => void;
  onRecentChat: (id: string) => void;
  onSearchOpen?: () => void;
  children: React.ReactNode;
}

/** localStorage key for persisting the sidebar collapsed state across reloads. */
const SIDEBAR_COLLAPSED_KEY = "prism.sidebar.collapsed";

/* ── Component ── */
export default function AppShell({
  activeView,
  onNavigate,
  onNewResearch,
  onRecentChat,
  onSearchOpen,
  children,
}: AppShellProps) {
  const { theme, toggleTheme } = useTheme();
  // Mobile drawer open/close (only relevant ≤900px). Independent from
  // the desktop collapse state.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop collapsed/expanded. Default expanded so first-time users see
  // labels; we read localStorage on mount to honor their preference.
  const [collapsed, setCollapsed] = useState(false);

  // Restore persisted preference on mount. Done in useEffect so SSR + the
  // first client render agree (avoids hydration mismatch on the shell width).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (stored === "1") setCollapsed(true);
    } catch {
      // ignore — private mode, etc.
    }
  }, []);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        // ignore — private mode, etc.
      }
      return next;
    });
  }, []);

  /* Keyboard shortcuts */
  useKeyboard({
    "mod+n": onNewResearch,
    "mod+k": () => {
      onSearchOpen?.();
    },
    "mod+b": toggleCollapsed,
    "escape": closeSidebar,
    "mod+1": () => onNavigate("dashboard"),
    "mod+2": () => onNavigate("chat"),
    "mod+3": () => onNavigate("settings"),
  });

  return (
    <div
      className={`${styles.shell} ${collapsed ? styles.shellCollapsed : ""}`}
    >
      <Sidebar
        activeView={activeView}
        onNavigate={onNavigate}
        onNewResearch={onNewResearch}
        onRecentChat={onRecentChat}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        theme={theme}
        onToggleTheme={toggleTheme}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />

      <div className={styles.main}>
        <Topbar
          onOpenSidebar={openSidebar}
          onSearchFocus={onSearchOpen}
          onNavigate={onNavigate}
        />

        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
