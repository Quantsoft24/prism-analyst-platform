"use client";

import AskScreen from "@/app/chat/components/AskScreen";
import ChatLayout from "@/app/chat/components/ChatLayout";
import { useChatActions, useChatState } from "@/components/ChatProvider";

export default function ChatPage() {
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
