"use client";

import ChatScreen from "@/app/chat/components/ChatScreen";

/** New / current conversation. A fresh chat lives here until it gets a
 *  session_id, at which point ChatProvider upgrades the URL to /chat/{id}. */
export default function ChatPage() {
  return <ChatScreen />;
}
