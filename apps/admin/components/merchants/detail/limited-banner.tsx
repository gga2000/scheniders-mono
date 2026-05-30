"use client";

import { AlertTriangle, Clock, Play } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLiveTick } from "@/hooks/use-live-tick";
import type { TenantRestrictions } from "@/types/admin";
import { cn } from "@/lib/utils";

interface LimitedBannerProps {
  merchantId: string;
  restrictions: TenantRestrictions | null | undefined;
}

const blockLabels: Record<keyof NonNullable<TenantRestrictions["blocks"]>, string> = {
  new_orders: "New orders blocked",
  new_products: "Cannot add products",
  team_invites: "Team invites paused",
  storefront_writes: "Storefront read-only",
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return "ended";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const m = minutes - hours * 60;
    return `${hours}h ${m}m left`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    const h = hours - days * 24;
    return `${days}d ${h}h left`;
  }
  return `${days}d left`;
}

export function LimitedBanner({ merchantId, restrictions }: LimitedBannerProps) {
  const queryClient = useQueryClient();
  const tickNow = useLiveTick(60_000);

  const pausedUntil = restrictions?.paused_until
    ? new Date(restrictions.paused_until)
    : null;
  const remainingMs = pausedUntil ? pausedUntil.getTime() - tickNow : null;
  const expired = remainingMs !== null && remainingMs <= 0;

  const blocks = restrictions?.blocks ?? {};
  const activeBlocks = Object.entries(blocks)
    .filter(([, v]) => v === true)
    .map(([k]) => k as keyof typeof blockLabels);

  const unpause = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/merchants/${merchantId}/unpause`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to resume");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "merchant", merchantId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
    },
  });

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-300 dark:border-amber-400/30 bg-gradient-to-br from-amber-50 via-yellow-50 to-orange-50 dark:from-amber-400/10 dark:via-yellow-400/10 dark:to-orange-400/10 p-4">
      <div
        aria-hidden
        className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-30 bg-amber-300"
      />
      <div className="relative flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 ring-1 ring-white/20 shadow-sm shadow-amber-500/30 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
              Limited
            </span>
            {pausedUntil && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold",
                  expired
                    ? "bg-foreground/[0.06] text-foreground/60"
                    : "bg-amber-200/60 dark:bg-amber-400/20 text-amber-800 dark:text-amber-200"
                )}
              >
                <Clock className="w-2.5 h-2.5" />
                {expired ? "Auto-resume due" : formatRemaining(remainingMs!)}
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-foreground mt-1 leading-tight">
            {restrictions?.reason || "Functionality temporarily reduced"}
          </p>
          {activeBlocks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {activeBlocks.map((b) => (
                <span
                  key={b}
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/70 dark:bg-white/10 text-amber-800 dark:text-amber-200 ring-1 ring-amber-200 dark:ring-amber-400/30"
                >
                  {blockLabels[b]}
                </span>
              ))}
            </div>
          )}
          {pausedUntil && !expired && (
            <p className="text-[10px] text-amber-700/70 dark:text-amber-300/70 font-medium mt-2">
              Auto-resume on {pausedUntil.toLocaleString()}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => unpause.mutate()}
          disabled={unpause.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-black shadow-sm shadow-emerald-500/30 ring-1 ring-white/20 disabled:opacity-50 transition-colors shrink-0"
        >
          <Play className="w-3 h-3 fill-current" />
          {unpause.isPending ? "Resuming..." : "Resume now"}
        </button>
      </div>
    </div>
  );
}
