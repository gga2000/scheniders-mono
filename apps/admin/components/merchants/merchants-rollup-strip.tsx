"use client";

import {
  Wallet,
  Repeat,
  ShoppingBag,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMerchantsStats } from "@/hooks/use-merchants-stats";

function formatCompactIQD(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${abs}`;
}

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
      sublabel: "active + trial only",
      value: !data ? "—" : formatCompactIQD(totalWallet),
      suffix: "IQD",
      icon: Wallet,
      accent: "text-emerald-700 dark:text-emerald-300",
      iconWrap:
        "bg-gradient-to-br from-emerald-400 to-teal-500 shadow-sm shadow-emerald-500/30",
    },
    {
      // A promise, not money in: what the active shops' plans cost a month at list price.
      label: "Plan prices",
      sublabel: "active shops, a month",
      value: !data ? "—" : formatCompactIQD(planPrices),
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
      value: !data ? "—" : formatCompactIQD(fees30d),
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
                    "text-[9px] uppercase tracking-[0.1em] font-black",
                    tile.accent
                  )}
                >
                  {tile.label}
                </p>
                <p className="text-lg font-black text-foreground tabular-nums leading-none mt-1 truncate">
                  {tile.value}
                  {tile.suffix && (
                    <span className="text-[10px] font-bold text-foreground/40 ml-1">
                      {tile.suffix}
                    </span>
                  )}
                </p>
                {tile.sublabel && (
                  <p className="text-[9px] text-foreground/35 mt-0.5 truncate">
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
