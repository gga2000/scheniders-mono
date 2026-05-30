"use client";

import Link from "next/link";
import { Star, Wallet, Clock, AlertTriangle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAdminStore } from "@/store/use-admin-store";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return "30d+ ago";
}

function healthDotColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-500";
    case "trial":
      return "bg-amber-500";
    case "suspended":
    case "churned":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
}

interface WatchlistMerchant {
  id: string;
  business_name: string;
  status: string;
  wallet?: { balance_iqd: number };
  last_active_at?: string | null;
}

export function MerchantWatchlistWidget() {
  const starredMerchants = useAdminStore((s) => s.starredMerchants);

  const { data: merchants = [], isLoading, isError } = useQuery<WatchlistMerchant[]>({
    queryKey: ["admin", "watchlist", starredMerchants],
    queryFn: async () => {
      if (starredMerchants.length === 0) return [];
      const ids = starredMerchants.join(",");
      const res = await fetch(`/api/merchants?ids=${ids}`);
      if (!res.ok) throw new Error("Failed to fetch watchlist");
      const json = await res.json();
      return json.merchants ?? json;
    },
    enabled: starredMerchants.length > 0,
  });

  return (
    <div className="pastel-card p-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
        <h3 className="text-sm font-bold text-foreground">Watchlist</h3>
      </div>

      {/* Content */}
      {starredMerchants.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Star className="w-8 h-8 text-foreground/15 mb-2" />
          <p className="text-xs text-foreground/40">No starred merchants</p>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <AlertTriangle className="w-6 h-6 text-red-400/60 mb-2" />
          <p className="text-xs text-foreground/40">Failed to load watchlist</p>
        </div>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: Math.min(starredMerchants.length, 3) }).map(
            (_, i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-foreground/5 animate-pulse"
              />
            )
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {merchants.map((merchant) => (
            <div
              key={merchant.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-foreground/[0.03] transition-colors"
            >
              {/* Health dot */}
              <span
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  healthDotColor(merchant.status)
                )}
              />

              {/* Name */}
              <span className="text-xs font-semibold text-foreground truncate flex-1 min-w-0">
                {merchant.business_name}
              </span>

              {/* Wallet balance */}
              <div className="flex items-center gap-1 text-foreground/50 shrink-0">
                <Wallet className="w-3 h-3" />
                <span className="text-[11px] font-medium">
                  {new Intl.NumberFormat("en-IQ").format(
                    merchant.wallet?.balance_iqd ?? 0
                  )}
                </span>
              </div>

              {/* Last active */}
              {merchant.last_active_at && (
                <div className="flex items-center gap-1 text-foreground/40 shrink-0">
                  <Clock className="w-3 h-3" />
                  <span className="text-[10px]">
                    {timeAgo(merchant.last_active_at)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      {starredMerchants.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[var(--card-border)]">
          <Link
            href="/merchants"
            className="text-xs font-semibold text-foreground/50 hover:text-foreground transition-colors"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
