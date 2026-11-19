"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, Clock, Download, CreditCard, Wallet, Activity } from "lucide-react";
import { useCan } from "@/hooks/use-admin-auth";
import { tooManyShops } from "@/lib/bulk-not-done";
import type { AdminAction } from "@/types/admin";

interface MerchantBulkBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkAction: (action: string) => void;
}

/** Each action with what the server asks of the role (api/bulk, api/export). */
const BULK_ACTIONS: { key: string; label: string; icon: typeof Wallet; needs: AdminAction[] }[] = [
  { key: "top-up", label: "Top Up", icon: Wallet, needs: ["bulk_action", "top_up_wallet"] },
  { key: "extend-trial", label: "Extend Trial", icon: Clock, needs: ["bulk_action"] },
  { key: "export", label: "Export", icon: Download, needs: ["export_data"] },
  { key: "change-plan", label: "Change Plan", icon: CreditCard, needs: ["bulk_action"] },
];

export function MerchantBulkBar({
  selectedCount,
  onClearSelection,
  onBulkAction,
}: MerchantBulkBarProps) {
  const can = useCan();
  const actions = BULK_ACTIONS.filter((a) => a.needs.every(can));
  // /api/bulk (every action that needs bulk_action) takes at most 100 shops:
  // say so as soon as more are ticked, not after the form is filled. Export
  // has no such limit.
  const tooMany = tooManyShops(selectedCount);
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="bg-[#1E1E1E]/95 dark:bg-[#1E1E1E]/95 backdrop-blur-xl text-white rounded-full ring-1 ring-white/10 shadow-2xl shadow-black/40 pl-2 pr-2 py-1.5 flex items-center gap-1.5">
            {/* Selection count chip */}
            <div className="flex items-center gap-2 pl-2 pr-1 py-1">
              <span className="w-6 h-6 rounded-full bg-violet-500 text-white text-xs font-black flex items-center justify-center shadow-sm shadow-violet-500/40">
                {selectedCount}
              </span>
              <span className="text-xs font-semibold whitespace-nowrap text-white/90">
                selected
              </span>
              <button
                onClick={onClearSelection}
                className="p-1 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                aria-label="Clear selection"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Divider */}
            <div className="w-px h-5 bg-white/15" />

            {/* Compare — only when 2-4 selected */}
            {selectedCount >= 2 && selectedCount <= 4 && (
              <>
                <button
                  onClick={() => onBulkAction("compare")}
                  className="px-3 py-1.5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 text-white text-xs font-bold shadow-sm shadow-violet-500/40 ring-1 ring-white/20 transition-all flex items-center gap-1.5 whitespace-nowrap"
                >
                  <Activity className="h-3.5 w-3.5" />
                  Compare
                </button>
                <div className="w-px h-5 bg-white/15" />
              </>
            )}

            {tooMany && (
              <span role="status" className="px-2 text-xs font-semibold whitespace-nowrap text-amber-300">
                {tooMany}
              </span>
            )}

            {/* Actions */}
            {actions.map(({ key, label, icon: Icon, needs }) => (
              <button
                key={key}
                onClick={() => onBulkAction(key)}
                disabled={tooMany !== null && needs.includes("bulk_action")}
                className="px-3 py-1.5 rounded-full hover:bg-white/10 text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap text-white/90 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
