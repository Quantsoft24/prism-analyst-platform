"use client";

import * as React from "react";

import { type NavView, NAV_ITEMS } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { isMockModeEnabled, setMockMode } from "@/lib/api/chat";
import { useDeleteConversation, useRecentConversations } from "@/lib/api/conversations";
import { useAuthUser } from "@/lib/auth/useAuthUser";
import Tooltip from "./Tooltip";

import styles from "./Sidebar.module.css";

/* ── SVG Icons ── */
const icons: Record<string, React.ReactNode> = {
  portfolio: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" />
      <rect x="12" y="8" width="3" height="10" />
      <rect x="17" y="5" width="3" height="13" />
    </svg>
  ),
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
  companies: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 21h18" />
      <path d="M5 21V7l8-4v18" />
      <path d="M19 21V11l-6-4" />
      <path d="M9 9v.01" />
      <path d="M9 12v.01" />
      <path d="M9 15v.01" />
      <path d="M9 18v.01" />
    </svg>
  ),
  bmc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </svg>
  ),
  news: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
      <path d="M18 14h-8" />
      <path d="M15 18h-5" />
      <path d="M10 6h8v4h-8V6z" />
    </svg>
  ),
  stocks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 3v18h18" />
      <rect x="7" y="10" width="3" height="6" />
      <path d="M8.5 10V7.5M8.5 16v2.5" />
      <rect x="14" y="7" width="3" height="8" />
      <path d="M15.5 7V4.5M15.5 15v2.5" />
    </svg>
  ),
  reports: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  account: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

/** Double-chevron icon — flips direction based on collapsed state.
 *  Pointing LEFT when expanded (click to collapse), RIGHT when collapsed
 *  (click to expand). Same pattern as Claude / VS Code / Notion. */
const CollapseIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    style={{ transform: collapsed ? "rotate(180deg)" : "none" }}
  >
    <polyline points="11 17 6 12 11 7" />
    <polyline points="18 17 13 12 18 7" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/* ── Props ── */
interface SidebarProps {
  activeView: NavView;
  onNavigate: (view: NavView) => void;
  onNewResearch: () => void;
  onRecentChat: (id: string) => void;
  isOpen: boolean;
  onClose: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  /** Desktop-only collapsed mode (icons only, no labels). Mobile drawer
   *  is governed by ``isOpen``. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

/* ── Component ── */
export default function Sidebar({
  activeView,
  onNavigate,
  onNewResearch,
  onRecentChat,
  isOpen,
  onClose,
  theme,
  onToggleTheme,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {
  const authUser = useAuthUser();
  const recents = useRecentConversations();
  const deleteConversation = useDeleteConversation();
  const handleNavClick = (view: NavView) => {
    onNavigate(view);
    onClose();
  };

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className={isOpen ? styles.backdropVisible : styles.backdrop}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={cn(
          styles.sidebar,
          isOpen && styles.sidebarOpen,
          collapsed && styles.sidebarCollapsed,
        )}
        role="navigation"
        aria-label="Main navigation"
        data-collapsed={collapsed || undefined}
      >
        {/* Brand + collapse toggle */}
        <div className={styles.brand}>
          <div className={styles.brandMark}>P</div>
          {!collapsed && (
            <div className={styles.brandText}>
              <div className={styles.brandName}>PRISM</div>
              <div className={styles.brandSub}>AI Equity Research</div>
            </div>
          )}
          {/* Collapse / expand toggle. Hidden on mobile (drawer handles it). */}
          <Tooltip
            label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            shortcut="⌘B"
            side="right"
          >
            <button
              type="button"
              className={styles.collapseBtn}
              onClick={onToggleCollapsed}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
            >
              <CollapseIcon collapsed={collapsed} />
            </button>
          </Tooltip>
        </div>

        {/* New Research */}
        <Tooltip label="New research" shortcut="⌘N" side="right" disabled={!collapsed}>
          <button
            className={cn(
              styles.newResearchBtn,
              collapsed && styles.newResearchBtnCollapsed,
            )}
            onClick={onNewResearch}
            aria-label="New research"
          >
            <PlusIcon />
            {!collapsed && (
              <>
                <span>New research</span>
                <span className={styles.kbdInline}>⌘N</span>
              </>
            )}
          </button>
        </Tooltip>

        {/* Scrollable middle — Workspace nav + Recent. Scrolls internally so
            the brand (top) and user/footer (bottom) stay pinned regardless of
            how many nav or recent items there are. */}
        <div className={styles.scrollArea}>
        {/* Workspace Nav */}
        {!collapsed && <div className={styles.navSection}>Workspace</div>}
        {NAV_ITEMS.map((item) => (
          <Tooltip
            key={item.id}
            label={item.label}
            side="right"
            disabled={!collapsed}
          >
            <div
              className={cn(
                activeView === item.id ? styles.navItemActive : styles.navItem,
                collapsed && styles.navItemCollapsed,
              )}
              onClick={() => handleNavClick(item.id)}
              role="button"
              tabIndex={0}
              aria-current={activeView === item.id ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
            >
              {icons[item.icon]}
              {!collapsed && (
                <>
                  <span className={styles.navItemLabel}>{item.label}</span>
                  {item.badge && <span className={styles.badge}>{item.badge}</span>}
                </>
              )}
            </div>
          </Tooltip>
        ))}

        {/* Recent — real per-user conversations (or sample chats in mock mode);
            hidden in collapsed mode (not useful as icon-only). */}
        {!collapsed && (
          <>
            <div className={styles.navSection}>Recent</div>
            {recents.loading && <div className={styles.navRecent}>Loading…</div>}
            {!recents.loading && recents.items.length === 0 && (
              <div className={styles.navRecentEmpty}>No conversations yet</div>
            )}
            {recents.items.map((chat) => (
              <div key={chat.id} className={styles.navRecentRow}>
                <div
                  className={styles.navRecent}
                  onClick={() => {
                    onRecentChat(chat.id);
                    onClose();
                  }}
                  role="button"
                  tabIndex={0}
                  title={chat.label}
                >
                  {chat.label}
                </div>
                {!recents.isMock && (
                  <button
                    className={styles.navRecentDelete}
                    title="Hide conversation"
                    aria-label="Hide conversation"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation.mutate(chat.id);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </>
        )}
        </div>

        {/* Footer */}
        <div
          className={cn(
            styles.sidebarFooter,
            collapsed && styles.sidebarFooterCollapsed,
          )}
        >
          {/* Row 1: avatar + identity */}
          <div className={styles.footerProfile}>
            <Tooltip
              label={authUser.secondary ? `${authUser.name} · ${authUser.secondary}` : authUser.name}
              side="right"
              disabled={!collapsed}
            >
              <div className={styles.avatar}>{authUser.initials}</div>
            </Tooltip>
            {!collapsed && (
              <div className={styles.userInfo}>
                <div className={styles.userName}>{authUser.name}</div>
                {authUser.secondary && <div className={styles.userFirm}>{authUser.secondary}</div>}
              </div>
            )}
          </div>

          {/* Row 2: actions */}
          <div className={styles.footerActions}>
            {authUser.authEnabled && !collapsed && authUser.isSignedIn && (
              <Tooltip label="Sign out" side="right">
                <button
                  className={styles.themeToggle}
                  onClick={() => void authUser.signOut()}
                  aria-label="Sign out"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </Tooltip>
            )}
            {authUser.authEnabled && !collapsed && !authUser.isSignedIn && (
              <Tooltip label="Sign in" side="right">
                <a className={styles.themeToggle} href="/sign-in" aria-label="Sign in">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                </a>
              </Tooltip>
            )}
            <MockModeToggle collapsed={collapsed} />
            <Tooltip
              label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              side="right"
            >
              <button
                className={styles.themeToggle}
                onClick={onToggleTheme}
                aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              >
                {theme === "light" ? <SunIcon /> : <MoonIcon />}
              </button>
            </Tooltip>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ── Mock-mode toggle ──────────────────────────────────────────────────────
 * Lets us iterate on the chat UI without burning Gemini tokens. When ON,
 * `runChatStream` delegates to a scripted local simulator (see chat.mock.ts).
 * Visible state: amber outline + "MOCK" badge so we can't forget it's on.
 *
 * REMOVE this component (and the badge / sidebar wiring above) before
 * shipping to production. Keep chat.mock.ts behind a feature flag if you
 * want a longer-lived demo / e2e affordance.
 * ──────────────────────────────────────────────────────────────────────── */

const MockOnIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);
const MockOffIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
);

function MockModeToggle({ collapsed }: { collapsed: boolean }) {
  // Read-time check so we don't ship a hard-coded default — honors the
  // localStorage flag from prior sessions. State + tiny re-render dance
  // because localStorage isn't reactive.
  const [on, setOn] = React.useState(false);
  React.useEffect(() => {
    setOn(isMockModeEnabled());
  }, []);

  const toggle = () => {
    const next = !on;
    setMockMode(next);
    setOn(next);
  };

  const label = on
    ? "Mock mode ON · UI runs against scripted events, no backend call"
    : "Mock mode OFF · click to simulate chat without calling the agent";

  return (
    <Tooltip label={label} side="right">
      <button
        type="button"
        onClick={toggle}
        className={cn(styles.themeToggle, on && styles.mockToggleOn)}
        aria-pressed={on}
        aria-label={on ? "Disable mock mode" : "Enable mock mode"}
      >
        {on ? <MockOnIcon /> : <MockOffIcon />}
        {!collapsed && on && (
          <span className={styles.mockBadge} aria-hidden="true">
            MOCK
          </span>
        )}
      </button>
    </Tooltip>
  );
}
