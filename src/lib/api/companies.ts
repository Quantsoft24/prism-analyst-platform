/**
 * Resource client + React Query hooks for ``/api/v1/companies``.
 *
 * Components should consume the ``useCompanies()`` hook directly, not call
 * ``companiesApi.list()`` from inside a component — the hook handles caching,
 * loading/error states, and refetch on window focus.
 */

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { apiClient } from "./client";
import type { CompanyDetail, CompanyRead, Paginated } from "./types";

export interface ListCompaniesParams {
  search?: string;
  sector?: string;
  exchange?: string;
  limit?: number;
  offset?: number;
}

export const companiesApi = {
  list(params: ListCompaniesParams = {}, signal?: AbortSignal): Promise<Paginated<CompanyRead>> {
    return apiClient.get<Paginated<CompanyRead>>("/api/v1/companies", {
      query: params,
      signal,
    });
  },

  get(idOrTicker: string, signal?: AbortSignal): Promise<CompanyDetail> {
    return apiClient.get<CompanyDetail>(
      `/api/v1/companies/${encodeURIComponent(idOrTicker)}`,
      { signal },
    );
  },
};

/** React Query cache keys — exported so callers can invalidate consistently. */
export const companiesKeys = {
  all: ["companies"] as const,
  list: (params: ListCompaniesParams) => ["companies", "list", params] as const,
  detail: (idOrTicker: string) => ["companies", "detail", idOrTicker] as const,
};

export function useCompanies(
  params: ListCompaniesParams = {},
  options?: Omit<
    UseQueryOptions<Paginated<CompanyRead>, Error>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery({
    queryKey: companiesKeys.list(params),
    queryFn: ({ signal }) => companiesApi.list(params, signal),
    staleTime: 30_000,
    ...options,
  });
}

export function useCompany(
  idOrTicker: string | null,
  options?: Omit<UseQueryOptions<CompanyDetail, Error>, "queryKey" | "queryFn" | "enabled">,
) {
  return useQuery({
    queryKey: companiesKeys.detail(idOrTicker ?? ""),
    queryFn: ({ signal }) => companiesApi.get(idOrTicker!, signal),
    enabled: !!idOrTicker,
    staleTime: 60_000,
    ...options,
  });
}
