"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

import BMCView from "@/app/bmc/components/BMCView";
import { useChatActions } from "@/components/ChatProvider";

function BmcPageInner() {
  const params = useSearchParams();
  const { bmcTicker } = useChatActions();
  // Prefer an explicit `?ticker=` (chat→BMC handoff card / deep link), then the
  // global `@bmc` intent captured in the ChatProvider.
  const ticker = params.get("ticker") ?? bmcTicker;
  const initialTab = params.get("tab") === "library" ? "library" : "home";
  return <BMCView initialTicker={ticker} initialTab={initialTab} />;
}

export default function BmcPage() {
  // useSearchParams must sit under a Suspense boundary in the app router.
  return (
    <Suspense fallback={null}>
      <BmcPageInner />
    </Suspense>
  );
}
