"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useChat } from "@/hooks/useChat";
import { useToast } from "@/components/Toast";
import { isMockModeEnabled } from "@/lib/api/chat";
import { RECENT_CHAT_QUERIES } from "@/lib/mockData";

/** Recognize `@bmc TICKER` / "business model canvas of TICKER" in a query.
 *  Returns the ticker (uppercased) if the message is a BMC request, else null. */
function parseBmcIntent(query: string): string | null {
  const q = query.trim();
  const at = q.match(/^@bmc\s+([A-Za-z0-9&.-]{1,32})\b/i);
  if (at) return at[1].toUpperCase();
  const phrase = q.match(/business model(?:\s+canvas)?\s+(?:of|for)\s+([A-Za-z0-9&.-]{1,32})\b/i);
  if (phrase) return phrase[1].toUpperCase();
  return null;
}

/** Navigation-aware chat actions, callable from any view. Stable identities
 *  (only `bmcTicker` changes), so consuming a view doesn't re-render it on
 *  every streamed token. */
interface ChatActions {
  /** Ticker captured from a `@bmc` intent, read by the BMC route. */
  bmcTicker: string | null;
  /** Run a query: BMC intents open the canvas, everything else routes to chat. */
  sendQuery: (query: string) => void;
  /** Reset the conversation and go to the chat (ask) screen. */
  newResearch: () => void;
  /** Resume a saved recent chat by id. */
  sendRecent: (id: string) => void;
}

const ChatStateContext = React.createContext<ReturnType<typeof useChat> | null>(null);
const ChatActionsContext = React.createContext<ChatActions | null>(null);

/**
 * Holds the chat state machine ONCE for the whole workspace, so it survives
 * navigation between routes (the SSE stream keeps running while you browse
 * other tabs) and any view can route a query into chat ("Ask PRISM"). Split
 * into two contexts: the live chat *state* (re-renders on every token — only
 * the chat route consumes it) and the stable *actions* (everything else).
 */
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const chat = useChat();
  const { toast } = useToast();
  const [bmcTicker, setBmcTicker] = React.useState<string | null>(null);

  // These are stable across renders (useChat memoises them), so the actions
  // below stay stable too.
  const { send, reset, loadConversation } = chat;

  const sendQuery = React.useCallback(
    (query: string) => {
      const bmc = parseBmcIntent(query);
      if (bmc) {
        setBmcTicker(bmc);
        router.push("/bmc");
        toast(`Opening Business Model Canvas for ${bmc}…`, "info");
        return;
      }
      send(query);
      router.push("/chat");
      toast("Research started — running tools…", "info");
    },
    [send, router, toast],
  );

  const newResearch = React.useCallback(() => {
    reset();
    router.push("/chat");
  }, [reset, router]);

  const sendRecent = React.useCallback(
    (id: string) => {
      // MOCK mode: `id` is a sample-chat id → re-run its canned query.
      if (isMockModeEnabled()) {
        const query = RECENT_CHAT_QUERIES[id];
        if (!query) return;
        send(query);
        router.push("/chat");
        toast("Resuming research…", "info");
        return;
      }
      // Real mode: `id` is a session_id → replay & resume the conversation.
      void loadConversation(id).catch(() => toast("Couldn't open that conversation.", "error"));
      router.push("/chat");
      toast("Opening conversation…", "info");
    },
    [send, loadConversation, router, toast],
  );

  const actions = React.useMemo<ChatActions>(
    () => ({ bmcTicker, sendQuery, newResearch, sendRecent }),
    [bmcTicker, sendQuery, newResearch, sendRecent],
  );

  return (
    <ChatStateContext.Provider value={chat}>
      <ChatActionsContext.Provider value={actions}>{children}</ChatActionsContext.Provider>
    </ChatStateContext.Provider>
  );
}

export function useChatState(): ReturnType<typeof useChat> {
  const ctx = React.useContext(ChatStateContext);
  if (!ctx) throw new Error("useChatState must be used within <ChatProvider>");
  return ctx;
}

export function useChatActions(): ChatActions {
  const ctx = React.useContext(ChatActionsContext);
  if (!ctx) throw new Error("useChatActions must be used within <ChatProvider>");
  return ctx;
}
