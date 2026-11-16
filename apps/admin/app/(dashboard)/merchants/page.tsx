"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { useMerchantList, useMerchantTabCounts, LIST_PAGE_SIZE } from "@/hooks/use-merchant-list";
import {
  DEFAULT_LIST_SORT,
  MERCHANT_TABS,
  TAB_LABEL,
  isListSort,
  isMerchantTab,
  type ListSort,
  type MerchantTab,
} from "@/lib/merchant-list";
import { MerchantTable } from "@/components/merchants/merchant-table";
import { Choice } from "@/components/merchants/detail/action-ui";
import { ExportButton } from "@/components/shared/export-button";
import { LoadError } from "@/components/shared/load-error";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

const SORT_WORDS: Record<ListSort, string> = {
  "created:desc": "Newest first.",
  "name:asc": "By name, A to Z.",
  "name:desc": "By name, Z to A.",
  "wallet:asc": "Smallest wallet first.",
  "wallet:desc": "Largest wallet first.",
};

/**
 * Merchants (board s1, s2, s5): one table, tabs that carry their counts, a
 * search over every shop and a sort. The tab, search and sort live in the
 * address, so a link or a reload opens the same list.
 */
export default function MerchantsPage() {
  // The list reads the address, which Next.js gives a page only inside a Suspense boundary.
  return (
    <Suspense>
      <MerchantsList />
    </Suspense>
  );
}

function MerchantsList() {
  const router = useRouter();
  const params = useSearchParams();
  const tabParam = params.get("tab");
  const tab: MerchantTab = isMerchantTab(tabParam) ? tabParam : "all";
  const sortParam = params.get("sort");
  const sort: ListSort = isListSort(sortParam) ? sortParam : DEFAULT_LIST_SORT;
  const search = params.get("q")?.trim() ?? "";

  const { role } = useAdminAuth();
  const canExport = role ? hasPermission(role, "export_data") : false;

  /** Change one value in the address, leaving the others as they are. */
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(Array.from(params.entries()));
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  };

  // The box updates the address a moment after typing stops, not on every key.
  const [typed, setTyped] = useState(search);
  const wait = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onType = (value: string) => {
    setTyped(value);
    if (wait.current) clearTimeout(wait.current);
    wait.current = setTimeout(() => setParam("q", value.trim() || null), 300);
  };
  useEffect(() => () => {
    if (wait.current) clearTimeout(wait.current);
  }, []);
  // "Show every shop" or a link clears the search: the box follows the address.
  useEffect(() => setTyped((now) => (now.trim() === search ? now : search)), [search]);

  const list = useMerchantList({ tab, search, sort });
  const counts = useMerchantTabCounts();
  // A tab with no shops is left out, unless it is the one open.
  const shownTabs = MERCHANT_TABS.filter((t) => t === "all" || t === tab || (counts.data?.[t] ?? 0) > 0);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-foreground">Merchants</h1>
          <p className="text-[13px] text-foreground/70">
            {counts.data ? `${formatCount(counts.data.all)} ${counts.data.all === 1 ? "shop" : "shops"}. ` : ""}
            {SORT_WORDS[sort]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative block">
            <span className="sr-only">Find a shop</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/70" aria-hidden />
            <input
              type="search"
              value={typed}
              onChange={(event) => onType(event.target.value)}
              placeholder="Name, shop number, email or phone"
              className="w-80 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] py-2 pl-9 pr-9 text-[15px] text-foreground placeholder:text-foreground/45 focus:border-foreground/40 focus:outline-none"
            />
            {typed && (
              <button
                type="button"
                onClick={() => onType("")}
                aria-label="Clear the search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-foreground/70 hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </label>
          {canExport && <ExportButton type="merchants" />}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
        {shownTabs.map((t) => (
          <Choice key={t} selected={t === tab} onClick={() => setParam("tab", t === "all" ? null : t)}>
            {TAB_LABEL[t]}
            {counts.data && <span className="ml-1.5 opacity-70">{formatCount(counts.data[t])}</span>}
          </Choice>
        ))}
      </div>

      {list.isLoading ? (
        <p className="flex items-center gap-2 py-10 text-[13px] text-foreground/70">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading the shops...
        </p>
      ) : list.isError ? (
        <LoadError what="the merchants" error={list.error} onRetry={() => list.refetch()} retrying={list.isFetching} />
      ) : list.merchants.length === 0 ? (
        <div className="pastel-card p-8 text-center">
          <p className="text-[15px] font-semibold text-foreground">
            {search ? `No shop matches "${search}"` : `No shop is in ${TAB_LABEL[tab]}`}
          </p>
          {(search || tab !== "all") && (
            <button
              type="button"
              onClick={() => router.replace("?", { scroll: false })}
              className="mt-3 rounded-lg border border-[var(--card-border)] px-3.5 py-2 text-[13px] font-semibold text-foreground hover:bg-foreground/[0.05]"
            >
              Show every shop
            </button>
          )}
        </div>
      ) : (
        <>
          <div aria-busy={list.isPlaceholderData} className={cn("transition-opacity", list.isPlaceholderData && "opacity-60")}>
            <MerchantTable merchants={list.merchants} sort={sort} onSort={(next) => setParam("sort", next === DEFAULT_LIST_SORT ? null : next)} />
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[13px] text-foreground/70">
              {formatCount(list.merchants.length)} of {formatCount(list.total)} shops shown.
            </p>
            {list.hasNextPage && (
              <button
                type="button"
                onClick={() => list.fetchNextPage()}
                disabled={list.isFetchingNextPage}
                className="rounded-lg border border-[var(--card-border)] px-3.5 py-2 text-[13px] font-semibold text-foreground hover:bg-foreground/[0.05] disabled:opacity-50"
              >
                {list.isFetchingNextPage ? "Loading..." : `Show ${LIST_PAGE_SIZE} more`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
