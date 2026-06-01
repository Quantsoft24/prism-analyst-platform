"use client";

import ReportsView from "@/app/reports/components/ReportsView";
import { useChatActions } from "@/components/ChatProvider";

export default function ReportsPage() {
  const { openReport } = useChatActions();
  return <ReportsView onReportClick={openReport} />;
}
