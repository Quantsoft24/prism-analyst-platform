/**
 * Resource client + hook for ``/api/v1/integrations`` — the registered agent
 * tools (stock-chat, MCP servers, sub-agents) with live load status. Backs the
 * Settings → "Tools & Capabilities" screen.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "./client";

export type IntegrationStatus = "ok" | "error" | "disabled";

export interface IntegrationHealth {
  name: string;
  source: "python" | "openapi" | "mcp" | "agent";
  enabled: boolean;
  status: IntegrationStatus;
  tool_count: number;
  error: string | null;
  description: string;
  tags: string[];
}

export interface IntegrationsResponse {
  integrations: IntegrationHealth[];
  total: number;
  ready: boolean;
  tool_count?: number;
}

export const integrationsApi = {
  list(signal?: AbortSignal): Promise<IntegrationsResponse> {
    return apiClient.get<IntegrationsResponse>("/api/v1/integrations", { signal });
  },
  toggle(name: string, enabled: boolean): Promise<{ name: string; enabled: boolean }> {
    return apiClient.put(`/api/v1/integrations/${encodeURIComponent(name)}`, {
      body: { enabled },
    });
  },
};

export const integrationsKeys = {
  all: ["integrations"] as const,
};

export function useIntegrations() {
  return useQuery({
    queryKey: integrationsKeys.all,
    queryFn: ({ signal }) => integrationsApi.list(signal),
    staleTime: 30_000,
  });
}

/** Toggle an integration ON/OFF for the firm; refreshes the list on success. */
export function useToggleIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      integrationsApi.toggle(name, enabled),
    onSuccess: () => qc.invalidateQueries({ queryKey: integrationsKeys.all }),
  });
}
