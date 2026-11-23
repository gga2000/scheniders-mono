"use client";

import {
  Wallet,
  Repeat,
  ShoppingBag,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMerchantsStats } from "@/hooks/use-merchants-stats";
import { formatCount } from "@/lib/format";

export function MerchantsRollupStrip() {
  // No numbers until they are read: a zero here would pass for a real total.
  const { data } = useMerchantsStats();

  const totalWallet = data?.total_wallet_iqd ?? 0;
  const planPrices = data?.plan_prices_iqd ?? 0;
  const fees30d = data?.fees_30d_iqd ?? 0;
  const activeCount = data?.status.active ?? 0;
  const total = data?.total ?? 0;

  const tiles: Array<{
    label: string;
    sublabel?: string;
    value: string;
    suffix?: string;
    icon: typeof Wallet;
    accent: string;
    iconWrap: string;
  }> = [
    {
      label: "Total Wallet",
      // Every shop but the cancelled and the suspended (stats route), paused ones too.
      // "suspended", the word this page's filter, board and status menu use.
      sublabel: "not cancelled or on hold",
      value: !data ? "—" : formatCount(totalWallet),
      suffix: "IQD",
      icon: Wallet,
      accent: "text-emerald-700 dark:text-emerald-300",
      iconWrap:
        "bg-gradient-to-br from-emerald-400 to-teal-500 shadow-sm shadow-emerald-500/30",
    },
    {
      // A promise, not money in: what the active shops' plans cost a month at
      // list price. Add-ons and a plan waiting for the next payment are not in
      // it, so a shop page's "Next charge" can be more.
      label: "Plan prices",
      sublabel: "active shops, list price a month",
      value: !data ? "—" : formatCount(planPrices),
      suffix: "IQD",
      icon: Repeat,
      accent: "text-violet-700 dark:text-violet-300",
      iconWrap:
        "bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-sm shadow-violet-500/30",
    },
    {
      // Money in: monthly fees, delivered orders and paid messages.
      label: "Our fees",
      sublabel: "last 30 days",
      value: !data ? "—" : formatCount(fees30d),
      suffix: "IQD",
      icon: ShoppingBag,
      accent: "text-rose-700 dark:text-rose-300",
      iconWrap:
        "bg-gradient-to-br from-rose-400 to-pink-500 shadow-sm shadow-rose-500/30",
    },
    {
      label: "Active",
      sublabel: undefined,
      value: !data ? "—" : String(activeCount),
      suffix: data ? `of ${total}` : undefined,
      icon: CheckCircle2,
      accent: "text-sky-700 dark:text-sky-300",
      iconWrap:
        "bg-gradient-to-br from-sky-400 to-cyan-500 shadow-sm shadow-sky-500/30",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <div
            key={tile.label}
            className="relative overflow-hidden rounded-2xl bg-[var(--card-bg)] border border-[var(--card-border)] p-3.5 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_12px_-4px_rgba(0,0,0,0.3)]"
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 ring-1 ring-white/20",
                  tile.iconWrap
                )}
              >
                <Icon className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-xs font-black",
                    tile.accent
                  )}
                >
                  {tile.label}
                </p>
                <p
                  className="text-lg font-black text-foreground tabular-nums leading-none mt-1 truncate"
                  title={tile.suffix ? `${tile.value} ${tile.suffix}` : String(tile.value)}
                >
                  {tile.value}
                  {tile.suffix && (
                    <span className="text-xs font-bold text-foreground/70 ml-1">
                      {tile.suffix}
                    </span>
                  )}
                </p>
                {tile.sublabel && (
                  <p className="text-xs text-foreground/70 mt-0.5 truncate" title={tile.sublabel}>
                    {tile.sublabel}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
