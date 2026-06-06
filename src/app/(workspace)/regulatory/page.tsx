"use client";

import RegulatoryView from "@/app/regulatory/components/RegulatoryView";
import { useChatActions } from "@/components/ChatProvider";

export default function RegulatoryPage() {
  const { sendQuery } = useChatActions();
  return <RegulatoryView onAsk={sendQuery} />;
}
