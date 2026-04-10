"use client";

import Link from "next/link";
import { Sparkline } from "@/components/shared/sparkline";
import type { LeaderboardEntry } from "@/types/dashboard";

interface TopMerchantsProps {
  merchants: LeaderboardEntry[] | undefined;
}

const medals: Record<number, string> = {
  0: "\u{1F947}",
  1: "\u{1F948}",
  2: "\u{1F949}",
};

function formatIQD(amount: number): string {
  return new Intl.NumberFormat("en-IQ").format(amount) + " IQD";
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[var(--card-border)] last:border-0 animate-pulse">
      <div className="w-6 h-6 rounded bg-foreground/[0.08]" />
      <div className="w-8 h-8 rounded-full bg-foreground/[0.08]" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-28 rounded bg-foreground/[0.08]" />
        <div className="h-2.5 w-16 rounded bg-foreground/[0.06]" />
      </div>
      <div className="h-4 w-20 rounded bg-foreground/[0.06]" />
    </div>
  );
}

export function TopMerchants({ merchants }: TopMerchantsProps) {
  const maxRevenue = merchants
    ? Math.max(...merchants.map((m) => m.revenue), 1)
    : 1;

  return (
    <div className="pastel-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)]/40 flex items-center justify-center">
          <span className="text-sm">&#127942;</span>
        </div>
        <h3 className="font-bold text-foreground text-sm">Top Merchants</h3>
      </div>

      {!merchants ? (
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : merchants.length === 0 ? (
        <p className="text-sm text-foreground/40 py-6 text-center">
          No merchant data yet.
        </p>
      ) : (
        <div>
          {merchants.map((merchant, idx) => {
            const proportion = (merchant.revenue / maxRevenue) * 100;
            return (
              <Link
                key={merchant.tenantId}
                href={`/merchants/${merchant.tenantId}`}
                className="flex items-center gap-3 py-3 border-b border-[var(--card-border)] last:border-0 hover:bg-foreground/[0.04] transition-colors rounded-lg px-1 -mx-1"
              >
                {/* Rank */}
                <span className="w-6 text-center text-sm font-bold text-foreground/60 flex-shrink-0">
                  {idx in medals ? medals[idx] : idx + 1}
                </span>

                {/* Avatar */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                  style={{ backgroundColor: merchant.primaryColor || "#6B7280" }}
                >
                  {merchant.businessName.charAt(0).toUpperCase()}
                </div>

                {/* Name + orders */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {merchant.businessName}
                  </p>
                  <p className="text-[10px] text-foreground/50">
                    {merchant.orderCount} orders
                  </p>
                  {/* Progress bar */}
                  <div className="mt-1 h-1 w-full rounded-full bg-[var(--card-border)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${proportion}%`,
                        backgroundColor: merchant.primaryColor || "var(--pastel-green)",
                      }}
                    />
                  </div>
                </div>

                {/* Sparkline */}
                <div className="w-16 flex-shrink-0">
                  <Sparkline
                    data={merchant.sparkline}
                    color={merchant.primaryColor || "var(--pastel-green)"}
                    height={20}
                  />
                </div>

                {/* Revenue */}
                <span className="text-xs font-bold text-foreground whitespace-nowrap flex-shrink-0">
                  {formatIQD(merchant.revenue)}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
