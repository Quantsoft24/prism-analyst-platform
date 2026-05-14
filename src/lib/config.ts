/**
 * PRISM — Environment Configuration
 */

export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  authEnabled: process.env.NEXT_PUBLIC_AUTH_ENABLED === "true",
} as const;
