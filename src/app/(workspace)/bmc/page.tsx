"use client";

import BMCView from "@/app/bmc/components/BMCView";
import { useChatActions } from "@/components/ChatProvider";

export default function BmcPage() {
  const { bmcTicker } = useChatActions();
  return <BMCView initialTicker={bmcTicker} />;
}
