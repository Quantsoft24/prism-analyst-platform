"use client";

import CompaniesView from "@/app/companies/components/CompaniesView";
import { useChatActions } from "@/components/ChatProvider";

export default function CompaniesPage() {
  const { sendQuery } = useChatActions();
  return (
    <CompaniesView
      onSelect={(ticker) =>
        sendQuery(`Tell me about ${ticker} — latest filings, business model, and key metrics.`)
      }
    />
  );
}
