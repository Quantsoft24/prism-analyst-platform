"use client";

import DashboardView from "@/app/dashboard/components/DashboardView";
import { useChatActions } from "@/components/ChatProvider";

export default function DashboardPage() {
  const { sendQuery } = useChatActions();
  return <DashboardView onQuickPrompt={sendQuery} />;
}
