"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import AppShell from "@/components/AppShell";
import SearchModal from "@/components/SearchModal";
import { ChatProvider, useChatActions } from "@/components/ChatProvider";
import { useKeyboard } from "@/hooks/useKeyboard";
import { NAV_ITEMS, type NavView } from "@/lib/mockData";

// Rendered nav items + the routes reachable from the footer (settings) and
// deep links (account) — so the active tab still resolves on those pages.
const NAV_IDS = new Set<string>([...NAV_ITEMS.map((n) => n.id), "account", "settings"]);

/** "/stocks" → "stocks" (NavView); unknown paths fall back to "chat". */
function pathnameToView(pathname: string): NavView {
  const seg = pathname.split("/")[1] || "chat";
  return (NAV_IDS.has(seg) ? seg : "chat") as NavView;
}

/** The persistent shell (sidebar + topbar + search) around every workspace
 *  route. The active tab is derived from the URL; navigation pushes routes. */
function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { newResearch, sendRecent, sendQuery, activeConversationId } = useChatActions();
  const [searchOpen, setSearchOpen] = React.useState(false);

  // Global keyboard shortcuts: ⌘K / Ctrl+K opens the command palette, ⌘N starts
  // a new research chat, Esc closes the palette (industry-standard launcher).
  useKeyboard(
    React.useMemo(
      () => ({
        "mod+k": () => setSearchOpen((o) => !o),
        "mod+n": newResearch, // already navigates to /chat
        escape: () => setSearchOpen(false),
      }),
      [newResearch],
    ),
  );

  // Highlight the open conversation from the URL (`/chat/{id}`) so it's correct
  // immediately on refresh/deep-link, before the conversation finishes loading;
  // fall back to the live session id for a brand-new chat still at `/chat`.
  const urlSessionId = pathname.startsWith("/chat/")
    ? decodeURIComponent(pathname.slice("/chat/".length).split("/")[0]) || null
    : null;

  return (
    <>
      <AppShell
        activeView={pathnameToView(pathname)}
        activeConversationId={urlSessionId ?? activeConversationId}
        onNavigate={(view) => router.push(`/${view}`)}
        onNewResearch={newResearch}
        onRecentChat={sendRecent}
        onSearchOpen={() => setSearchOpen(true)}
      >
        {children}
      </AppShell>

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onQuery={sendQuery}
        onNavigate={(view) => router.push(`/${view}`)}
        onNewResearch={newResearch}
        onOpenConversation={sendRecent}
      />
    </>
  );
}

/** Shared layout for all workspace routes (route group → no URL segment).
 *  ChatProvider lives here so chat state persists across tab navigation. */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ChatProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </ChatProvider>
  );
}
