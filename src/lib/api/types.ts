/**
 * Wire types — mirror the Pydantic schemas in
 * ``prism-analyst-services/src/schemas/`` exactly.
 *
 * Keep these in lockstep with the backend. When the Pydantic schema changes,
 * update here. Backend's OpenAPI spec at ``/openapi.json`` is the source of
 * truth — a future build step could codegen these, but for now we maintain
 * by hand because the surface is small.
 */

/** Generic pagination envelope used by every list endpoint. */
export interface Paginated<T> {
  items: T[];
  page: PageMeta;
}

export interface PageMeta {
  total: number;
  limit: number;
  offset: number;
}

/** Compact list-view representation of a company. */
export interface CompanyRead {
  id: string;
  ticker: string;
  name: string;
  exchange: string;
  sector: string | null;
  industry: string | null;
  country: string;
  isin: string | null;
  is_active: boolean;
}

/** Full detail-view of a company, including aliases + descriptive fields. */
export interface CompanyDetail extends CompanyRead {
  legal_name: string | null;
  cin: string | null;
  pan: string | null;
  website: string | null;
  description: string | null;
  aliases: CompanyAliasRead[];
  created_at: string;
  updated_at: string;
}

export interface CompanyAliasRead {
  kind: string;
  value: string;
}

/** Standard FastAPI error envelope. */
export interface ApiErrorBody {
  detail: string | { msg: string; type: string }[];
}
