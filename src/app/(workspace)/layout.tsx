"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import AppShell from "@/components/AppShell";
import SearchModal from "@/components/SearchModal";
import { ChatProvider, useChatActions } from "@/components/ChatProvider";
import { NAV_ITEMS, type NavView } from "@/lib/mockData";

const NAV_IDS = new Set<string>(NAV_ITEMS.map((n) => n.id));

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
  const { newResearch, sendRecent, sendQuery } = useChatActions();
  const [searchOpen, setSearchOpen] = React.useState(false);

  return (
    <>
      <AppShell
        activeView={pathnameToView(pathname)}
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
        onSelect={sendQuery}
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
