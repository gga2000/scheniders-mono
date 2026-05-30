"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame, ChevronDown, Eye, X } from "lucide-react";
import { SPRING_CARD } from "@/lib/animation-constants";
import { cn } from "@/lib/utils";
import type { AdminTenant } from "@/types/admin";

interface ChurnRiskBannerProps {
  merchants: AdminTenant[];
  onFilterAtRisk: () => void;
  onOpenDetail: (id: string) => void;
}

function isChurnRisk(merchant: AdminTenant): boolean {
  const balance = merchant.wallet?.balance_iqd ?? 0;
  const orders = merchant.usage?.orders_count ?? 0;
  if (merchant.status === "suspended") return true;
  if (balance < 5000 && orders < 5) return true;
  if (merchant.status === "trial") {
    const trialEnd = merchant.trial_ends_at;
    if (trialEnd) {
      const days = Math.ceil(
        (new Date(trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (days <= 3 && orders === 0) return true;
    }
  }
  return false;
}

export function ChurnRiskBanner({
  merchants,
  onFilterAtRisk,
  onOpenDetail,
}: ChurnRiskBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const atRisk = useMemo(
    () => merchants.filter(isChurnRisk),
    [merchants]
  );

  if (dismissed || atRisk.length === 0) return null;

  const displayMerchants = expanded ? atRisk : atRisk.slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={SPRING_CARD}
      className="pastel-card border-l-4 border-l-red-500 dark:border-l-red-400 p-4 bg-red-50/50 dark:bg-red-400/5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-400/15 flex items-center justify-center shrink-0">
            <Flame className="w-4 h-4 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-red-800 dark:text-red-300">
              {atRisk.length} merchant{atRisk.length !== 1 ? "s" : ""} at risk of churning
            </h3>
            <p className="text-xs text-red-600/70 dark:text-red-400/60 mt-0.5">
              Low balance, low orders, or expiring trials with no activity
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={onFilterAtRisk}
            className="px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            View at-risk
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-lg text-red-400/60 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-400/10 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* At-risk merchant avatars */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {displayMerchants.map((m) => {
          const char = m.business_name.charAt(0).toUpperCase();
          const bg = m.branding?.primary_color || "#1E1E1E";
          return (
            <button
              key={m.id}
              onClick={() => onOpenDetail(m.id)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/60 dark:bg-white/5 border border-red-200/50 dark:border-red-400/15 hover:bg-white dark:hover:bg-white/10 transition-colors group"
              title={m.business_name}
            >
              <div
                className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                style={{ backgroundColor: bg }}
              >
                {char}
              </div>
              <span className="text-[10px] font-medium text-red-800 dark:text-red-300 max-w-[80px] truncate">
                {m.business_name}
              </span>
              <Eye className="w-3 h-3 text-red-400/50 group-hover:text-red-600 dark:group-hover:text-red-300 transition-colors" />
            </button>
          );
        })}

        {!expanded && atRisk.length > 5 && (
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-red-600/70 dark:text-red-400/60 hover:text-red-700 dark:hover:text-red-300 transition-colors"
          >
            +{atRisk.length - 5} more
            <ChevronDown className="w-3 h-3" />
          </button>
        )}

        {expanded && atRisk.length > 5 && (
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-red-600/70 dark:text-red-400/60 hover:text-red-700 dark:hover:text-red-300 transition-colors"
          >
            Show less
            <ChevronDown className="w-3 h-3 rotate-180" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
