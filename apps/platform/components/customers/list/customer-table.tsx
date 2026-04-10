"use client";

import { useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Check, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomerTableRow } from "./customer-table-row";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";
import { useLanguage } from "@/components/providers/language-provider";

type SortField = "name" | "total_orders" | "total_spent" | "last_order_date";
type SortOrder = "asc" | "desc";

interface CustomerTableProps {
  customers: PaginatedCustomer[];
  selectedPhones: Set<string>;
  onSelect: (phone: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  sortBy?: SortField;
  sortOrder?: SortOrder;
  onSort: (field: SortField) => void;
  isLoading?: boolean;
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  isFetchingNextPage?: boolean;
}


function SortIcon({ field, sortBy, sortOrder }: { field: SortField | null; sortBy?: SortField; sortOrder?: SortOrder }) {
  if (!field) return null;
  if (sortBy !== field) return <ArrowUpDown className="h-3.5 w-3.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />;
  return sortOrder === "asc"
    ? <ArrowUp className="h-3.5 w-3.5 text-blue-500" />
    : <ArrowDown className="h-3.5 w-3.5 text-blue-500" />;
}

function SkeletonRow({ index }: { index: number }) {
  return (
    <tr className="border-b border-(--card-border)">
      <td className="w-1 p-0" />
      <td className="w-10 px-3 py-3.5">
        <div className="h-4 w-4 rounded border-2 border-(--card-border) bg-background animate-pulse" />
      </td>
      <td className="px-3 py-3.5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-background animate-pulse" />
          <div className="space-y-1.5">
            <div className="h-3 w-28 rounded bg-background animate-pulse" style={{ animationDelay: `${index * 60}ms` }} />
            <div className="h-2.5 w-20 rounded bg-background animate-pulse" style={{ animationDelay: `${index * 60 + 100}ms` }} />
          </div>
        </div>
      </td>
      <td className="px-3 py-3.5 hidden sm:table-cell">
        <div className="h-5 w-14 rounded-full bg-background animate-pulse" />
      </td>
      <td className="px-3 py-3.5 hidden md:table-cell">
        <div className="h-3 w-16 rounded bg-background animate-pulse" />
      </td>
      <td className="px-3 py-3.5 hidden sm:table-cell">
        <div className="space-y-1">
          <div className="h-3 w-16 rounded bg-background animate-pulse" />
          <div className="h-2.5 w-10 rounded bg-background animate-pulse" />
        </div>
      </td>
      <td className="px-3 py-3.5 hidden lg:table-cell">
        <div className="h-3 w-20 rounded bg-background animate-pulse" />
      </td>
      <td className="w-20 px-3 py-3.5" />
    </tr>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  const { t } = useLanguage();
  return (
    <tr>
      <td colSpan={8} className="py-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-background">
            <span className="text-3xl">🔍</span>
          </div>
          <p className="text-sm font-medium text-foreground">
            {hasFilters ? t("customers.empty.noMatch") : t("customers.empty.title")}
          </p>
          {hasFilters && (
            <p className="text-xs text-muted">{t("customers.empty.desc")}</p>
          )}
        </motion.div>
      </td>
    </tr>
  );
}

export function CustomerTable({
  customers,
  selectedPhones,
  onSelect,
  onSelectAll,
  onClearAll,
  sortBy,
  sortOrder,
  onSort,
  isLoading,
  hasNextPage,
  onLoadMore,
  isFetchingNextPage,
}: CustomerTableProps) {
  const { t } = useLanguage();

  const COLUMNS: { key: SortField | null; label: string; className: string }[] = [
    { key: null,               label: "",         className: "w-1 p-0" },
    { key: null,               label: "",         className: "w-10" },
    { key: "name",             label: t("customers.table.customer"),   className: "min-w-[200px]" },
    { key: null,               label: t("customers.table.status"),     className: "hidden sm:table-cell" },
    { key: null,               label: t("customers.table.city"),       className: "hidden md:table-cell" },
    { key: "total_spent",      label: t("customers.table.spent"),      className: "hidden sm:table-cell" },
    { key: "last_order_date",  label: t("customers.table.lastOrder"),  className: "hidden lg:table-cell" },
    { key: null,               label: "",         className: "w-20" },
  ];
  const allSelected = customers.length > 0 && customers.every((c) => selectedPhones.has(c.phone));
  const someSelected = selectedPhones.size > 0 && !allSelected;

  const handleHeaderCheck = useCallback(() => {
    allSelected ? onClearAll() : onSelectAll();
  }, [allSelected, onSelectAll, onClearAll]);

  // Intersection observer for infinite scroll
  const observerRef = useCallback((node: HTMLTableRowElement | null) => {
    if (!node || !onLoadMore) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) onLoadMore();
    }, { rootMargin: "200px" });
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

  return (
    <div className="flex-1 overflow-auto rounded-3xl border border-(--card-border) bg-(--card-bg)" style={{ boxShadow: "var(--card-shadow)" }}>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-(--card-bg)/95 backdrop-blur-sm">
          <tr className="border-b border-(--card-border)">
            <th className="w-1 p-0" />
            {/* Master checkbox */}
            <th className="w-10 px-3 py-3" onClick={handleHeaderCheck}>
              <div
                className={cn(
                  "h-4 w-4 rounded border-2 flex items-center justify-center cursor-pointer transition-all duration-150",
                  allSelected ? "border-blue-500 bg-blue-500"
                    : someSelected ? "border-blue-400 bg-(--pastel-blue)/40"
                    : "border-(--card-border) hover:border-(--border-hover)"
                )}
              >
                {allSelected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                {someSelected && <div className="h-1.5 w-1.5 rounded-sm bg-blue-500" />}
              </div>
            </th>

            {COLUMNS.slice(2).map((col) => (
              <th
                key={col.label || col.key || Math.random()}
                className={cn(
                  "group px-3 py-3 text-right text-xs font-bold uppercase tracking-widest text-muted",
                  col.className,
                  col.key && "cursor-pointer hover:text-foreground select-none"
                )}
                onClick={col.key ? () => onSort(col.key!) : undefined}
              >
                <div className="flex items-center gap-1.5 justify-end">
                  {col.label}
                  <SortIcon field={col.key} sortBy={sortBy} sortOrder={sortOrder} />
                </div>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} index={i} />)
            : customers.length === 0
            ? <EmptyState hasFilters={false} />
            : customers.map((c, i) => (
              <CustomerTableRow
                key={c.phone}
                customer={c}
                isSelected={selectedPhones.has(c.phone)}
                onSelect={onSelect}
                index={i}
              />
            ))
          }

          {/* Load more trigger */}
          {!isLoading && hasNextPage && (
            <tr ref={observerRef as any}>
              <td colSpan={8} className="py-4 text-center">
                {isFetchingNextPage && (
                  <div className="flex items-center justify-center gap-2 text-xs text-muted">
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-(--card-border) border-t-blue-500" />
                    {t("customers.table.loadingMore")}
                  </div>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
