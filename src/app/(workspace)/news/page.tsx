"use client";

import NewsView from "@/app/news/components/NewsView";
import { useChatActions } from "@/components/ChatProvider";

export default function NewsPage() {
  const { sendQuery } = useChatActions();
  return <NewsView onAsk={sendQuery} />;
}
