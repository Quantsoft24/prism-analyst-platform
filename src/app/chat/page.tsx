"use client";

import { useState, useCallback } from "react";
import { RECENT_CHAT_QUERIES, type NavView } from "@/lib/mockData";
import { useChat } from "@/hooks/useChat";
import { useToast } from "@/components/Toast";
import AppShell from "@/components/AppShell";
import SearchModal from "@/components/SearchModal";
import AskScreen from "./components/AskScreen";
import ChatLayout from "./components/ChatLayout";
import CompaniesView from "../companies/components/CompaniesView";
import BMCView from "../bmc/components/BMCView";
import DashboardView from "../dashboard/components/DashboardView";
import ReportsView from "../reports/components/ReportsView";
import SettingsView from "../settings/components/SettingsView";

/** Recognize `@bmc TICKER` / "business model canvas of TICKER" in a query.
 * Returns the ticker (uppercased) if the message is a BMC request, else null. */
function parseBmcIntent(query: string): string | null {
  const q = query.trim();
  // @bmc TCS  |  @bmc TICKER
  const at = q.match(/^@bmc\s+([A-Za-z0-9&.-]{1,32})\b/i);
  if (at) return at[1].toUpperCase();
  // "business model canvas of TCS" / "business model of TCS"
  const phrase = q.match(/business model(?:\s+canvas)?\s+(?:of|for)\s+([A-Za-z0-9&.-]{1,32})\b/i);
  if (phrase) return phrase[1].toUpperCase();
  return null;
}

export default function ChatPage() {
  const [activeView, setActiveView] = useState<NavView>("chat");
  const [searchOpen, setSearchOpen] = useState(false);
  const [bmcTicker, setBmcTicker] = useState<string | null>(null);
  const chat = useChat();
  const { toast } = useToast();

  /* Handle sending a query — routes BMC requests to the canvas, else chat */
  const handleSend = useCallback((query: string) => {
    const bmc = parseBmcIntent(query);
    if (bmc) {
      setBmcTicker(bmc);
      setActiveView("bmc");
      toast(`Opening Business Model Canvas for ${bmc}…`, "info");
      return;
    }
    setActiveView("chat");
    chat.send(query);
    toast("Research started — running tools…", "info");
  }, [chat, toast]);

  /* New research — reset to ask screen */
  const handleNewResearch = useCallback(() => {
    setActiveView("chat");
    chat.reset();
  }, [chat]);

  /* Recent chat click */
  const handleRecentChat = useCallback((id: string) => {
    const query = RECENT_CHAT_QUERIES[id];
    if (query) {
      setActiveView("chat");
      chat.send(query);
      toast("Resuming research…", "info");
    }
  }, [chat, toast]);

  /* Navigation */
  const handleNavigate = useCallback((view: NavView) => {
    setActiveView(view);
  }, []);

  /* Quick prompt from dashboard */
  const handleQuickPrompt = useCallback((query: string) => {
    setActiveView("chat");
    chat.send(query);
    toast("Research started — running tools…", "info");
  }, [chat, toast]);

  /* Report click — map intent key to query */
  const handleReportClick = useCallback((intentKey: string) => {
    const query = RECENT_CHAT_QUERIES[intentKey];
    if (query) {
      setActiveView("chat");
      chat.send(query);
      toast("Loading report context…", "info");
    }
  }, [chat, toast]);

  /* Search modal */
  const handleSearchSelect = useCallback((action: string) => {
    setActiveView("chat");
    chat.send(action);
    toast("Research started — running tools…", "info");
  }, [chat, toast]);

  /* Keyboard: ⌘K to open search */
  const handleSearchOpen = useCallback(() => {
    setSearchOpen(true);
  }, []);

  /* When the user clicks a company card, jump to chat with a research query
     pre-loaded — bridges the company picker UX with the existing chat flow. */
  const handleCompanySelect = useCallback(
    (ticker: string) => {
      setActiveView("chat");
      chat.send(`Tell me about ${ticker} — latest filings, business model, and key metrics.`);
      toast(`Loading research for ${ticker}…`, "info");
    },
    [chat, toast],
  );

  /* Render the active view */
  const renderView = () => {
    switch (activeView) {
      case "dashboard":
        return <DashboardView onQuickPrompt={handleQuickPrompt} />;

      case "companies":
        return <CompaniesView onSelect={handleCompanySelect} />;

      case "bmc":
        return <BMCView initialTicker={bmcTicker} />;

      case "reports":
        return <ReportsView onReportClick={handleReportClick} />;

      case "settings":
        return <SettingsView />;

      case "chat":
      default:
        if (chat.phase === "idle") {
          return <AskScreen onSend={handleSend} />;
        }
        return chat.intentConfig ? (
          <ChatLayout
            messages={chat.messages}
            intentConfig={chat.intentConfig}
            showWorkspace={chat.showWorkspace}
            phase={chat.phase}
            runMeta={chat.runMeta}
            onFollowUp={chat.followUp}
            onStop={chat.stop}
            onRetry={chat.retry}
          />
        ) : null;
    }
  };

  return (
    <>
      <AppShell
        activeView={activeView}
        onNavigate={handleNavigate}
        onNewResearch={handleNewResearch}
        onRecentChat={handleRecentChat}
        onSearchOpen={handleSearchOpen}
      >
        {renderView()}
      </AppShell>

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSearchSelect}
      />
    </>
  );
}
