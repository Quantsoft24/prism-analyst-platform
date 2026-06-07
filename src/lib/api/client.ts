/**
 * Strongly-typed HTTP client for the PRISM backend.
 *
 * - Reads ``NEXT_PUBLIC_API_URL`` (defaults to localhost:8000 in dev).
 * - Sends the dev-firm header until real auth (Clerk) lands in Slice 3.
 * - Surfaces backend errors as ``ApiError`` so React Query can route them
 *   into the same retry/backoff handling as network errors.
 */

import { config } from "@/lib/config";

import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody | null,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path, config.apiUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/** Stable per-browser id for anonymous (not-signed-in) callers — used by the
 *  backend only to enforce the guest daily message limit. */
export function guestId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem("prism.guestId");
  if (!id) {
    id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `g_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem("prism.guestId", id);
  }
  return id;
}

export async function authHeaders(): Promise<Record<string, string>> {
  const base: Record<string, string> = { "Content-Type": "application/json" };
  // Identify the guest browser so the backend can apply the guest daily cap
  // (harmless when signed in — the server keys on user_id then).
  const gid = guestId();
  if (gid) base["X-Guest-Id"] = gid;
  // Auth OFF (default): identify as the dev firm via the header the backend's
  // get_current_principal reads. Behaviour unchanged from before auth landed.
  if (!config.authEnabled) {
    base["X-Dev-Firm"] = "QUANTSOFT";
    return base;
  }
  // Auth ON: attach the Supabase access token; the backend verifies it and
  // resolves the firm/user from the token (no dev-firm header).
  if (typeof window === "undefined") return base;
  try {
    const { getBrowserSupabase } = await import("@/lib/supabase/client");
    const { data } = await getBrowserSupabase().auth.getSession();
    const token = data.session?.access_token;
    if (token) base["Authorization"] = `Bearer ${token}`;
  } catch {
    // No session yet / client not ready → send unauthenticated (server decides).
  }
  return base;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    // 204 / empty success bodies (e.g. PATCH rename, some PUTs) have nothing to
    // parse — calling response.json() on them throws and would wrongly route a
    // successful mutation into onError. Parse only when there's a body.
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Non-JSON error response — swallow; status code is enough.
  }
  const detail =
    typeof body?.detail === "string"
      ? body.detail
      : `${response.status} ${response.statusText}`;
  throw new ApiError(response.status, body, detail);
}

export const apiClient = {
  async get<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const response = await fetch(buildUrl(path, opts.query), {
      method: "GET",
      headers: await authHeaders(),
      signal: opts.signal,
    });
    return handleResponse<T>(response);
  },

  async post<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const response = await fetch(buildUrl(path, opts.query), {
      method: "POST",
      headers: await authHeaders(),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
    return handleResponse<T>(response);
  },

  async put<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const response = await fetch(buildUrl(path, opts.query), {
      method: "PUT",
      headers: await authHeaders(),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
    return handleResponse<T>(response);
  },

  async patch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const response = await fetch(buildUrl(path, opts.query), {
      method: "PATCH",
      headers: await authHeaders(),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
    return handleResponse<T>(response);
  },

  async delete<T = void>(path: string, opts: RequestOptions = {}): Promise<T> {
    const response = await fetch(buildUrl(path, opts.query), {
      method: "DELETE",
      headers: await authHeaders(),
      signal: opts.signal,
    });
    // 204 No Content (the common delete success) has no body to parse.
    if (response.ok) {
      return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
    }
    return handleResponse<T>(response);
  },
};
