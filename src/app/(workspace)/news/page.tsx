"use client";

import NewsView from "@/app/news/components/NewsView";
import { useChatActions } from "@/components/ChatProvider";

export default function NewsPage() {
  // "Ask PRISM" on a news card PREFILLS the chat composer (editable) rather than
  // firing immediately, so the user can refine the grounded question first.
  const { draftQuery } = useChatActions();
  return <NewsView onAsk={draftQuery} />;
}
