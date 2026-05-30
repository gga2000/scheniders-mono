"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Clock,
  Ban,
  Wallet,
  X,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { useAdminStore } from "@/store/use-admin-store";
import { useMerchantsStats } from "@/hooks/use-merchants-stats";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "merchants-digest-dismissed";

export function MerchantsDigestBanner() {
  const { setStatusFilter, setBalanceFilter } = useAdminStore();
  const { data } = useMerchantsStats();
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved === "1") setDismissed(true);
    } catch {
      /* sessionStorage may be unavailable */
    }
  }, []);

  const buckets = data?.buckets;
  const totalUrgent =
    (buckets?.trials_today ?? 0) +
    (buckets?.trials_expired ?? 0) +
    (buckets?.suspended ?? 0) +
    (buckets?.critical_balance ?? 0);

  function handleDismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  if (!buckets || totalUrgent === 0 || dismissed) return null;

  const cards: Array<{
    label: string;
    count: number;
    icon: typeof AlertCircle;
    accent: string;
    onClick: () => void;
  }> = [];

  if (buckets.trials_expired > 0) {
    cards.push({
      label: "Trial expired",
      count: buckets.trials_expired,
      icon: AlertCircle,
      accent: "from-rose-500 to-red-600 text-white shadow-rose-500/40",
      onClick: () => setStatusFilter("attention"),
    });
  }
  if (buckets.trials_today > 0) {
    cards.push({
      label: "Trial ends today",
      count: buckets.trials_today,
      icon: Clock,
      accent: "from-amber-400 to-orange-500 text-white shadow-amber-500/40",
      onClick: () => setStatusFilter("attention"),
    });
  }
  if (buckets.suspended > 0) {
    cards.push({
      label: "Suspended",
      count: buckets.suspended,
      icon: Ban,
      accent: "from-rose-500 to-red-600 text-white shadow-rose-500/40",
      onClick: () => setStatusFilter("suspended"),
    });
  }
  if (buckets.critical_balance > 0) {
    cards.push({
      label: "Critical balance",
      count: buckets.critical_balance,
      icon: Wallet,
      accent: "from-fuchsia-500 to-pink-600 text-white shadow-fuchsia-500/40",
      onClick: () => setBalanceFilter("critical"),
    });
  }

  return (
    <AnimatePresence>
      <motion.div
        key="digest"
        initial={{ opacity: 0, y: -8, height: 0 }}
        animate={{ opacity: 1, y: 0, height: "auto" }}
        exit={{ opacity: 0, y: -8, height: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        className="relative overflow-hidden rounded-3xl border border-foreground/[0.06] bg-gradient-to-br from-rose-50/80 via-amber-50/60 to-orange-50/80 dark:from-rose-400/10 dark:via-amber-400/5 dark:to-orange-400/10 p-4 mb-3"
      >
        <div
          aria-hidden
          className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-rose-300/40 blur-3xl pointer-events-none"
        />

        <div className="relative flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-md shadow-rose-500/30 ring-1 ring-white/20 shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.1em] font-black text-foreground/50">
                Daily Digest
              </p>
              <p className="text-sm font-black text-foreground truncate">
                {totalUrgent} {totalUrgent === 1 ? "merchant" : "merchants"} need your attention
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 p-1.5 rounded-full text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-colors"
            title="Hide for this session"
            aria-label="Dismiss digest banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative flex items-center gap-2 flex-wrap">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.label}
                type="button"
                onClick={card.onClick}
                className={cn(
                  "group inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full ring-1 ring-white/20 shadow-sm transition-all hover:scale-105 active:scale-95",
                  "bg-gradient-to-br",
                  card.accent
                )}
              >
                <span className="w-7 h-7 rounded-full flex items-center justify-center bg-white/15">
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="text-base font-black tabular-nums leading-none">
                  {card.count}
                </span>
                <span className="text-[11px] font-bold opacity-90">
                  {card.label}
                </span>
                <ArrowRight className="w-3 h-3 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </button>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
