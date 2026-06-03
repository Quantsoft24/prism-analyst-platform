"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";

import { DialogProvider } from "@/components/Dialog";
import { ToastProvider } from "@/components/Toast";

/**
 * Single QueryClient instance for the whole client tree.
 *
 * Defaults are tuned for a research-tool workload:
 *   - refetchOnWindowFocus = false — analysts switch tabs constantly;
 *     auto-refetch every time would flicker the UI and waste API calls.
 *   - staleTime 30s — most reads are cheap and don't change often.
 *   - retry 1 — fail fast for genuine errors; pulling 5 times against a
 *     500 just slows the user down.
 */
function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 30_000,
        retry: 1,
      },
      mutations: { retry: 0 },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    // Server: a fresh client per request to avoid cross-request leakage.
    return makeQueryClient();
  }
  // Browser: reuse the single client across navigations.
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <DialogProvider>{children}</DialogProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
