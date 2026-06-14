"use client";

import AskScreen from "./AskScreen";
import ChatLayout from "./ChatLayout";
import { useChatActions, useChatState } from "@/components/ChatProvider";

/**
 * The chat surface — the ask/welcome screen when idle, otherwise the live
 * thread. Shared by the `/chat` (new conversation) and `/chat/[sessionId]`
 * (resumed conversation) routes, both reading the single ChatProvider state.
 */
export default function ChatScreen() {
  const chat = useChatState();
  const { sendQuery } = useChatActions();

  if (chat.phase === "idle") {
    return <AskScreen onSend={sendQuery} />;
  }
  return chat.intentConfig ? (
    <ChatLayout
      messages={chat.messages}
      intentConfig={chat.intentConfig}
      activeIntent={chat.activeIntent}
      showWorkspace={chat.showWorkspace}
      phase={chat.phase}
      runMeta={chat.runMeta}
      onFollowUp={chat.followUp}
      onStop={chat.stop}
      onRetry={chat.retry}
      onRespondClarification={chat.respondToClarification}
    />
  ) : null;
}
