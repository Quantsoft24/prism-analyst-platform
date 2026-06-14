"use client";

import * as React from "react";
import { useParams } from "next/navigation";

import ChatScreen from "@/app/chat/components/ChatScreen";
import { useChatState } from "@/components/ChatProvider";
import { useToast } from "@/components/Toast";

/**
 * A specific conversation, addressed by `/chat/{sessionId}` — enables refresh,
 * deep-link, share, and browser back/forward. The shared workspace layout keeps
 * the chat state alive across navigation, so we only (re)load when the URL names
 * a DIFFERENT conversation than the one already open — this guards against
 * reloading (and interrupting) a live, streaming session.
 */
export default function ChatSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const raw = params.sessionId;
  const sessionId = Array.isArray(raw) ? raw[0] : raw;

  const chat = useChatState();
  const { toast } = useToast();
  const loadConversation = chat.loadConversation;
  const activeId = chat.runMeta.session_id;
  const attempted = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!sessionId) return;
    if (activeId === sessionId) return; // already open (resumed or just-created live run)
    if (attempted.current === sessionId) return; // don't retry the same id on re-render
    attempted.current = sessionId;
    void loadConversation(sessionId).catch(() =>
      toast("Couldn't open that conversation.", "error"),
    );
  }, [sessionId, activeId, loadConversation, toast]);

  return <ChatScreen />;
}
