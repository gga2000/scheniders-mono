"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { getMerchantCode } from "@scheniders/shared";
import { cn } from "@/lib/utils";
import { formatCount, formatWhen } from "@/lib/format";
import { listStatus, type ListSort, type MerchantListRow } from "@/lib/merchant-list";
import { TONE_DOT } from "@/components/merchants/detail/shop-status";

interface MerchantTableProps {
  merchants: MerchantListRow[];
  sort: ListSort;
  onSort: (sort: ListSort) => void;
  now?: Date;
}

/** A header that sorts: a first press sorts one way, the next press the other way. */
function SortHeader({
  label,
  field,
  sort,
  onSort,
  firstDirection,
  className,
}: {
  label: string;
  field: "name" | "wallet";
  sort: ListSort;
  onSort: (sort: ListSort) => void;
  firstDirection: "asc" | "desc";
  className?: string;
}) {
  const [onField, direction] = sort.split(":");
  const active = onField === field;
  const next: "asc" | "desc" = active ? (direction === "asc" ? "desc" : "asc") : firstDirection;
  const Arrow = direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"} className={cn("py-2.5 font-medium", className)}>
      <button
        type="button"
        onClick={() => onSort(`${field}:${next}`)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
      >
        {label}
        {active && <Arrow className="h-3.5 w-3.5" aria-hidden />}
      </button>
    </th>
  );
}

/**
 * The one Merchants table (board s1): who the shop is, where it stands and
 * why, its wallet, its orders and how to reach it. A row opens the shop page.
 */
export function MerchantTable({ merchants, sort, onSort, now = new Date() }: MerchantTableProps) {
  const router = useRouter();
  return (
    <div className="pastel-card overflow-hidden">
      <table className="w-full text-left">
        <thead className="border-b border-[var(--card-border)] text-[13px] text-foreground/70">
          <tr>
            <SortHeader label="Shop" field="name" sort={sort} onSort={onSort} firstDirection="asc" className="pl-5" />
            <th scope="col" className="py-2.5 font-medium">Status</th>
            <SortHeader label="Wallet, IQD" field="wallet" sort={sort} onSort={onSort} firstDirection="asc" className="text-right [&>button]:justify-end" />
            <th scope="col" className="py-2.5 text-right font-medium">Orders, 30 days</th>
            <th scope="col" className="py-2.5 pl-6 font-medium">Last order</th>
            <th scope="col" className="py-2.5 pr-5 font-medium">Phone</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--card-border)]">
          {merchants.map((shop) => {
            const status = listStatus(shop, now);
            const href = `/merchants/${shop.id}`;
            return (
              <tr
                key={shop.id}
                onClick={(event) => {
                  // The name is a link of its own: a click on it, or a middle click, is the browser's.
                  if ((event.target as HTMLElement).closest("a")) return;
                  router.push(href);
                }}
                className="cursor-pointer align-top transition-colors hover:bg-foreground/[0.03]"
              >
                <td className="py-3 pl-5 pr-4">
                  <Link href={href} dir="auto" className="block text-[15px] font-semibold text-foreground hover:underline">
                    {shop.business_name}
                  </Link>
                  <p className="text-[13px] tabular-nums text-foreground/70">
                    #{getMerchantCode(shop)}
                    {shop.city && <span dir="auto"> · {shop.city}</span>}
                  </p>
                </td>
                <td className="py-3 pr-4">
                  <p className="flex items-center gap-1.5 text-[15px] font-semibold text-foreground">
                    <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[status.tone])} />
                    {status.label}
                  </p>
                  <p className="text-[13px] text-foreground/70">{status.reason}</p>
                </td>
                <td className="py-3 pr-4 text-right text-[15px] tabular-nums text-foreground">{formatCount(shop.wallet_iqd)}</td>
                <td className="py-3 text-right text-[15px] tabular-nums text-foreground">{formatCount(shop.orders_30d)}</td>
                <td className="py-3 pl-6 pr-4 text-[15px] text-foreground">
                  {shop.last_order_at ? formatWhen(shop.last_order_at, now) : <span className="text-foreground/70">None yet</span>}
                </td>
                <td className="py-3 pr-5 text-[15px] tabular-nums text-foreground" dir="ltr">
                  {shop.contact_phone ?? <span className="text-foreground/70">Not set</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
