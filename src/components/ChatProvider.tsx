"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { useChat } from "@/hooks/useChat";
import { useToast } from "@/components/Toast";
import { isMockModeEnabled } from "@/lib/api/chat";
import { RECENT_CHAT_QUERIES } from "@/lib/mockData";

/** Recognize the explicit `@bmc TICKER` shortcut. Returns the ticker (uppercased)
 *  for a direct jump to the canvas, else null.
 *
 *  NOTE: natural-language requests ("business model of X") deliberately do NOT
 *  match here — they route to the chat agent, which resolves the RIGHT entity
 *  (clarifying ambiguous names like "Adani") and runs the BMC tool, then surfaces
 *  an "Open full canvas →" handoff card pointing at the resolved symbol. A raw
 *  redirect with an unresolved/ambiguous term just 404s on /bmc. */
function parseBmcIntent(query: string): string | null {
  const at = query.trim().match(/^@bmc\s+([A-Za-z0-9&.-]{1,32})\b/i);
  return at ? at[1].toUpperCase() : null;
}

/** Navigation-aware chat actions, callable from any view. Stable identities
 *  (only `bmcTicker` changes), so consuming a view doesn't re-render it on
 *  every streamed token. */
interface ChatActions {
  /** Ticker captured from a `@bmc` intent, read by the BMC route. */
  bmcTicker: string | null;
  /** The currently-open conversation's session_id (null on a fresh/ask screen).
   *  Lets the sidebar highlight which recent chat is open. */
  activeConversationId: string | null;
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
  const pathname = usePathname();
  const chat = useChat();
  const { toast } = useToast();
  const [bmcTicker, setBmcTicker] = React.useState<string | null>(null);

  // These are stable across renders (useChat memoises them), so the actions
  // below stay stable too.
  const { send, reset } = chat;

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
      // Real mode: `id` is a session_id → navigate to its URL; the
      // /chat/[sessionId] route replays & resumes the conversation.
      router.push(`/chat/${encodeURIComponent(id)}`);
    },
    [send, router, toast],
  );

  // Primitive string → the memo (and the sidebar highlight) only update when the
  // open conversation actually changes, not on every streamed token.
  const activeConversationId = chat.runMeta.session_id ?? null;

  // When a NEW chat acquires its session_id, reflect it in the URL with a
  // `replace` (no history entry, no remount) so refresh + share + back/forward
  // work. Only upgrades the bare `/chat` route — never touches other tabs or an
  // already-addressed `/chat/{id}`.
  React.useEffect(() => {
    if (activeConversationId && pathname === "/chat") {
      router.replace(`/chat/${encodeURIComponent(activeConversationId)}`);
    }
  }, [activeConversationId, pathname, router]);

  const actions = React.useMemo<ChatActions>(
    () => ({ bmcTicker, activeConversationId, sendQuery, newResearch, sendRecent }),
    [bmcTicker, activeConversationId, sendQuery, newResearch, sendRecent],
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
