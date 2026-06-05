/**
 * `/api/v1/me` — the signed-in user's profile + preferences.
 *
 * `useMe` reads the backend principal (firm, role, user, preferences). Only
 * runs when auth is enabled (otherwise the backend returns the dev firm).
 * `useUpdatePreferences` merge-saves the preferences blob and refetches `/me`.
 */

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";

import { config } from "@/lib/config";
import { apiClient } from "./client";

export interface MeUser {
  id: string;
  email: string | null;
  full_name: string | null;
}

export interface MeResponse {
  firm_id: string;
  role: string | null;
  is_anonymous: boolean;
  user: MeUser | null;
  preferences: Record<string, unknown>;
}

export const meKeys = {
  me: ["me"] as const,
};

export function useMe(options?: Omit<UseQueryOptions<MeResponse, Error>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: meKeys.me,
    queryFn: () => apiClient.get<MeResponse>("/api/v1/me"),
    enabled: config.authEnabled,
    staleTime: 60_000,
    ...options,
  });
}

export interface UsageSummary {
  conversations: number;
  runs: number;
  tool_calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  runs_7d: number;
}

export function useUsage(options?: Omit<UseQueryOptions<UsageSummary, Error>, "queryKey" | "queryFn">) {
  return useQuery({
    queryKey: ["me", "usage"],
    queryFn: () => apiClient.get<UsageSummary>("/api/v1/me/usage"),
    enabled: config.authEnabled,
    staleTime: 60_000,
    ...options,
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (preferences: Record<string, unknown>) =>
      apiClient.patch<{ preferences: Record<string, unknown> }>("/api/v1/me/preferences", {
        body: { preferences },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: meKeys.me });
    },
  });
}
