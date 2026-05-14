/**
 * PRISM — API Client Stub
 *
 * Returns mock data for Phase 1.
 * Will be replaced with real fetch/SSE calls when backend is ready.
 */

import { config } from "@/lib/config";

const BASE_URL = config.apiUrl;

/** Generic GET request */
export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

/** Generic POST request */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

/** Health check */
export async function checkHealth(): Promise<{ status: string }> {
  return apiGet("/health");
}
