"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useToday } from "@/hooks/use-today";
import { useMerchantTabCounts } from "@/hooks/use-merchant-list";
import { useLeadsWithNoOwner } from "@/hooks/use-leads";
import { hasPermission } from "@/lib/admin-permissions";
import { formatCount, formatDayTime } from "@/lib/format";
import { TodayNumbers } from "@/components/today/today-numbers";
import { TodayList } from "@/components/today/today-list";
import { HandledToday } from "@/components/today/handled-today";
import { LoadError } from "@/components/shared/load-error";

/**
 * Today, the console's home page (board h1): the shops that need someone now,
 * grouped by why, with four numbers above them and what staff handled today
 * under them (board h8), in place of 18 charts. The charts moved to Numbers.
 */
export default function TodayPage() {
  const router = useRouter();
  const today = useToday();
  const counts = useMerchantTabCounts();
  const noOwner = useLeadsWithNoOwner();
  const { role } = useAdminAuth();
  const canCheckReceipts = role ? hasPermission(role, "check_payments") : false;
  const [find, setFind] = useState("");
  // The page's clock is the moment of the last check, read on the browser: the
  // server's build-time clock would show a wrong time until the page loaded.
  const now = today.data ? new Date(today.dataUpdatedAt) : undefined;

  const waiting = today.data?.shops.length;
  const onFind = (event: FormEvent) => {
    event.preventDefault();
    const q = find.trim();
    router.push(q ? `/merchants?q=${encodeURIComponent(q)}` : "/merchants");
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-foreground">Today</h1>
          <p className="min-h-5 text-[13px] text-foreground/60">
            {now && waiting !== undefined && (
              <>
                {formatDayTime(now, now)}.{" "}
                {waiting === 0
                  ? "Nobody is waiting."
                  : `${formatCount(waiting)} ${waiting === 1 ? "shop is" : "shops are"} waiting for someone.`}
              </>
            )}
          </p>
        </div>
        <form onSubmit={onFind} role="search">
          <label className="relative block">
            <span className="sr-only">Find a shop</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" aria-hidden />
            <input
              type="search"
              value={find}
              onChange={(event) => setFind(event.target.value)}
              placeholder="Find a shop by name, number or phone"
              className="w-96 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] py-2 pl-9 pr-3 text-[15px] text-foreground placeholder:text-foreground/45 focus:border-foreground/40 focus:outline-none"
            />
          </label>
        </form>
      </div>

      <TodayNumbers counts={counts.data} numbers={today.data?.numbers} leadsWithNoOwner={noOwner.data} now={now} />

      {today.isLoading ? (
        <p className="flex items-center gap-2 py-10 text-[13px] text-foreground/60">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Looking for shops that need someone...
        </p>
      ) : today.data && now ? (
        <>
          <TodayList shops={today.data.shops} canCheckReceipts={canCheckReceipts} now={now} />
          <HandledToday rows={today.data.handled} />
        </>
      ) : (
        <LoadError what="who is waiting" error={today.error} onRetry={() => today.refetch()} retrying={today.isFetching} />
      )}
    </div>
  );
}
