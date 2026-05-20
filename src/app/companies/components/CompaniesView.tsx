"use client";

import { Building2, Search } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { useCompanies, type ListCompaniesParams } from "@/lib/api/companies";

const PAGE_SIZE = 25;

interface CompaniesViewProps {
  /** Triggered when the user picks a company — host page can route to detail / chat. */
  onSelect?: (ticker: string) => void;
}

/**
 * Companies coverage browser.
 *
 * Real backend integration (no mocks) — first user-facing surface to hit
 * /api/v1/companies. Renders a search box + cards of the firm's coverage
 * universe. Loading uses Skeletons, errors render an inline retry message,
 * empty state explains *why* the list might be empty (filters too tight vs
 * truly no data).
 */
export default function CompaniesView({ onSelect }: CompaniesViewProps) {
  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [sector, setSector] = React.useState<string | undefined>(undefined);

  // Debounce search input so we don't fire on every keystroke.
  React.useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(handle);
  }, [search]);

  const params: ListCompaniesParams = {
    search: debouncedSearch || undefined,
    sector,
    limit: PAGE_SIZE,
    offset: 0,
  };
  const { data, isLoading, isError, error, refetch, isFetching } =
    useCompanies(params);

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto p-8">
      {/* Header */}
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl tracking-tight text-ink">
          Coverage universe
        </h1>
        <p className="text-sm text-ink-mute">
          Companies in PRISM&apos;s India coverage. Search by ticker, name, or alias
          (e.g. &quot;Tata&quot; finds TCS). NSE-listed only for now — BSE small/mid-caps
          land in Slice 4.
        </p>
      </header>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ticker, name, or alias…"
            className="pl-9"
            aria-label="Search companies"
          />
        </div>
        <SectorFilter value={sector} onChange={setSector} />
        {data && (
          <span className="ml-auto text-xs text-ink-mute">
            {data.page.total.toLocaleString()} companies
            {isFetching && " · refreshing…"}
          </span>
        )}
      </div>

      {/* States */}
      {isLoading && <LoadingState />}
      {isError && <ErrorState error={error} onRetry={() => refetch()} />}
      {data && data.items.length === 0 && !isLoading && (
        <EmptyState hasFilters={!!debouncedSearch || !!sector} />
      )}

      {/* Results */}
      {data && data.items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect?.(c.ticker)}
              className="text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg"
            >
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate">{c.name}</CardTitle>
                      <CardDescription className="font-mono text-xs">
                        {c.exchange}: {c.ticker}
                      </CardDescription>
                    </div>
                    <Building2 className="h-4 w-4 shrink-0 text-ink-faint" />
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {c.sector && <Badge variant="secondary">{c.sector}</Badge>}
                  {c.industry && (
                    <Badge variant="outline" className="font-normal">
                      {c.industry}
                    </Badge>
                  )}
                  {c.isin && (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {c.isin}
                    </Badge>
                  )}
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

const SECTORS = [
  "Energy",
  "Information Technology",
  "Financials",
  "Communication Services",
  "Consumer Staples",
  "Industrials",
  "Materials",
] as const;

function SectorFilter({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      aria-label="Filter by sector"
      className="h-9 rounded-md border border-line bg-bg-elev px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <option value="">All sectors</option>
      {SECTORS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="mt-1.5 h-3 w-1/3" />
          </CardHeader>
          <CardContent className="flex gap-1.5">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message =
    error instanceof ApiError
      ? `${error.status}: ${error.message}`
      : error instanceof Error
        ? error.message
        : "Unknown error";
  return (
    <Card className="border-neg/40 bg-neg-soft/40">
      <CardHeader>
        <CardTitle className="text-neg">Couldn&apos;t load companies</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
      <CardContent>
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-accent hover:text-accent-deep underline-offset-4 hover:underline"
        >
          Retry
        </button>
      </CardContent>
    </Card>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No companies match</CardTitle>
        <CardDescription>
          {hasFilters
            ? "Try a broader search or clear the sector filter."
            : "The coverage universe is empty — run the seed migration on the backend."}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
