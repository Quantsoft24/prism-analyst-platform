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

function defaultHeaders(): HeadersInit {
  // Until Clerk lands in Slice 3, identify as the dev firm. This header
  // is read by ``src/core/auth.py`` on the backend.
  return {
    "Content-Type": "application/json",
    "X-Dev-Firm": "QUANTSOFT",
  };
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T;
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
      headers: defaultHeaders(),
      signal: opts.signal,
    });
    return handleResponse<T>(response);
  },

  async post<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const response = await fetch(buildUrl(path, opts.query), {
      method: "POST",
      headers: defaultHeaders(),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
    return handleResponse<T>(response);
  },

  async put<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const response = await fetch(buildUrl(path, opts.query), {
      method: "PUT",
      headers: defaultHeaders(),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
    return handleResponse<T>(response);
  },
};
