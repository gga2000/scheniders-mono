"use client";

import { useMemo } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleDollarSign,
  CreditCard,
  RotateCcw,
  Sparkles,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MerchantDetail } from "@/hooks/use-merchant-detail";

const fmt = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(n);
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  if (day < 365) return `${Math.floor(day / 30)}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

type TxKind = "topup" | "charge" | "refund" | "adjustment" | "other";

const TX_META: Record<TxKind, { label: string; chip: string; ring: string; amount: string; icon: typeof ArrowUpRight }> = {
  topup: {
    label: "Top up",
    chip: "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm shadow-emerald-500/30 ring-1 ring-white/20",
    ring: "ring-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
    amount: "text-emerald-600 dark:text-emerald-400",
    icon: ArrowDownLeft,
  },
  charge: {
    label: "Charge",
    chip: "bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-sm shadow-rose-500/30 ring-1 ring-white/20",
    ring: "ring-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-300",
    amount: "text-rose-600 dark:text-rose-400",
    icon: ArrowUpRight,
  },
  refund: {
    label: "Refund",
    chip: "bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-sm shadow-sky-500/30 ring-1 ring-white/20",
    ring: "ring-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-300",
    amount: "text-sky-600 dark:text-sky-400",
    icon: RotateCcw,
  },
  adjustment: {
    label: "Adjustment",
    chip: "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30 ring-1 ring-white/20",
    ring: "ring-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-300",
    amount: "text-violet-600 dark:text-violet-400",
    icon: Sparkles,
  },
  other: {
    label: "Other",
    chip: "bg-foreground/10 text-foreground/70 ring-1 ring-foreground/10",
    ring: "ring-foreground/10 bg-foreground/[0.04] text-foreground/60",
    amount: "text-foreground",
    icon: CircleDollarSign,
  },
};

function txKind(type: string): TxKind {
  const t = type.toLowerCase();
  if (t === "topup" || t === "top_up" || t === "deposit") return "topup";
  if (t === "charge" || t === "debit") return "charge";
  if (t === "refund") return "refund";
  if (t === "adjustment") return "adjustment";
  return "other";
}

interface BillingTabProps {
  wallet: MerchantDetail["wallet"];
  transactions: MerchantDetail["transactions"];
}

export function BillingTab({ wallet, transactions }: BillingTabProps) {
  const totals = useMemo(() => {
    const balance = wallet?.balance_iqd ?? 0;
    const toppedUp = wallet?.total_topped_up_iqd ?? 0;
    const charged = wallet?.total_charged_iqd ?? 0;
    return { balance, toppedUp, charged };
  }, [wallet]);

  const lowBalance = wallet ? totals.balance <= (wallet.threshold_iqd ?? 0) : false;

  return (
    <div className="space-y-4">
      {wallet && (
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl p-5 border",
            lowBalance
              ? "bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50 dark:from-rose-400/10 dark:via-orange-400/10 dark:to-amber-400/10 border-rose-200 dark:border-rose-400/30"
              : "bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 dark:from-emerald-400/10 dark:via-teal-400/10 dark:to-cyan-400/10 border-emerald-200 dark:border-emerald-400/30"
          )}
        >
          <div
            aria-hidden
            className={cn(
              "absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl opacity-30",
              lowBalance ? "bg-rose-300" : "bg-emerald-300"
            )}
          />

          <div className="relative flex items-start justify-between mb-5">
            <div>
              <p
                className={cn(
                  "text-[10px] uppercase tracking-[0.1em] font-black flex items-center gap-1.5",
                  lowBalance
                    ? "text-rose-700 dark:text-rose-300"
                    : "text-emerald-700 dark:text-emerald-300"
                )}
              >
                <Wallet className="w-3 h-3" />
                Wallet balance
              </p>
              <p
                className={cn(
                  "text-4xl font-black tabular-nums leading-none mt-2 tracking-tight",
                  lowBalance
                    ? "text-rose-900 dark:text-rose-200"
                    : "text-emerald-900 dark:text-emerald-200"
                )}
              >
                {compact(totals.balance)}
                <span className="text-base font-bold opacity-60 ml-1.5">IQD</span>
              </p>
              <p className="text-[11px] text-foreground/55 mt-2 font-medium">
                Threshold {fmt(wallet.threshold_iqd)} IQD
              </p>
            </div>
            {lowBalance && (
              <span className="px-2.5 py-1 rounded-full bg-rose-500 text-white text-[10px] font-black uppercase tracking-wider shadow-sm shadow-rose-500/40 animate-pulse">
                Low
              </span>
            )}
          </div>

          <div className="relative grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-foreground/[0.06] bg-white/70 dark:bg-white/5 backdrop-blur-sm p-3.5">
              <p className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1">
                <ArrowDownLeft className="w-2.5 h-2.5" />
                Total topped up
              </p>
              <p className="text-lg font-black tabular-nums mt-1.5 text-emerald-700 dark:text-emerald-300">
                {compact(totals.toppedUp)}
                <span className="text-[10px] font-bold opacity-50 ml-1">IQD</span>
              </p>
            </div>
            <div className="rounded-2xl border border-foreground/[0.06] bg-white/70 dark:bg-white/5 backdrop-blur-sm p-3.5">
              <p className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1">
                <ArrowUpRight className="w-2.5 h-2.5" />
                Total charged
              </p>
              <p className="text-lg font-black tabular-nums mt-1.5 text-rose-700 dark:text-rose-300">
                {compact(totals.charged)}
                <span className="text-[10px] font-bold opacity-50 ml-1">IQD</span>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="pastel-card p-5 md:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1.5">
            <CreditCard className="w-3 h-3" />
            Transaction history
          </h2>
          {transactions.length > 0 && (
            <span className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 tabular-nums">
              {transactions.length} {transactions.length === 1 ? "entry" : "entries"}
            </span>
          )}
        </div>

        {transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-foreground/40">
            <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center mb-3">
              <CreditCard className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium">No transactions yet</p>
            <p className="text-xs text-foreground/35 mt-1">Top-ups and charges will appear here.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {transactions.map((tx) => {
              const kind = txKind(tx.type);
              const meta = TX_META[kind];
              const Icon = meta.icon;
              const isCredit = kind === "topup" || kind === "refund";
              const sign = isCredit ? "+" : kind === "charge" ? "-" : "";
              return (
                <div
                  key={tx.id}
                  className="group flex items-center gap-3 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.025] hover:bg-foreground/[0.04] transition-colors p-3"
                >
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ring-1",
                      meta.ring
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                          meta.chip
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="text-[10px] text-foreground/45 font-medium tabular-nums">
                        {relativeTime(tx.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/65 mt-1 truncate font-medium">
                      {tx.description || "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("text-sm font-black tabular-nums leading-none", meta.amount)}>
                      {sign}
                      {fmt(tx.amount_iqd)}
                      <span className="text-[10px] font-bold opacity-50 ml-1">IQD</span>
                    </p>
                    <p className="text-[10px] text-foreground/40 mt-1.5 tabular-nums font-medium">
                      Bal {fmt(tx.balance_after_iqd)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
