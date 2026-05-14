"use client";

import { useState, useCallback } from "react";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  /* Keyboard shortcuts */
  useKeyboard({
    "mod+n": onNewResearch,
    "mod+k": () => {
      onSearchOpen?.();
    },
    "escape": closeSidebar,
    "mod+1": () => onNavigate("dashboard"),
    "mod+2": () => onNavigate("chat"),
    "mod+3": () => onNavigate("reports"),
    "mod+4": () => onNavigate("settings"),
  });

  return (
    <div className={styles.shell}>
      <Sidebar
        activeView={activeView}
        onNavigate={onNavigate}
        onNewResearch={onNewResearch}
        onRecentChat={onRecentChat}
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <div className={styles.main}>
        <Topbar
          activeView={activeView}
          onOpenSidebar={openSidebar}
          onSearchFocus={onSearchOpen}
        />

        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
