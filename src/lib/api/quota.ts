/** Daily message quota — `/api/v1/chat/quota`. Drives the "N messages left
 *  today" notice for guests (and near-limit signed-in users). */

import { useQuery } from "@tanstack/react-query";

import { apiClient } from "./client";

export interface Quota {
  limit: number;
  used: number;
  remaining: number;
  is_anonymous: boolean;
  enabled: boolean;
}

export const quotaKeys = { quota: ["chat", "quota"] as const };

export function useQuota() {
  return useQuery({
    queryKey: quotaKeys.quota,
    queryFn: () => apiClient.get<Quota>("/api/v1/chat/quota"),
    staleTime: 20_000,
  });
}
