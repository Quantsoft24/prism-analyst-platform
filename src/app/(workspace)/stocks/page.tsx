"use client";

import StockDashboardView from "@/app/stocks/components/StockDashboardView";
import { useChatActions } from "@/components/ChatProvider";

export default function StocksPage() {
  const { sendQuery } = useChatActions();
  return <StockDashboardView onAsk={sendQuery} />;
}
