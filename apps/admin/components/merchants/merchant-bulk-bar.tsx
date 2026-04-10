"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X, Bell, Clock, Download, CreditCard } from "lucide-react";

interface MerchantBulkBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkAction: (action: string) => void;
}

const BULK_ACTIONS = [
  { key: "send-notification", label: "Send Notification", icon: Bell },
  { key: "extend-trial", label: "Extend Trial", icon: Clock },
  { key: "export", label: "Export", icon: Download },
  { key: "change-plan", label: "Change Plan", icon: CreditCard },
];

export function MerchantBulkBar({
  selectedCount,
  onClearSelection,
  onBulkAction,
}: MerchantBulkBarProps) {
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
        >
          <div className="bg-[#1E1E1E] text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
            {/* Selection info */}
            <span className="text-xs font-semibold whitespace-nowrap">
              {selectedCount} selected
            </span>
            <button
              onClick={onClearSelection}
              className="p-1 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            {/* Divider */}
            <div className="w-px h-6 bg-white/20" />

            {/* Actions */}
            {BULK_ACTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => onBulkAction(key)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
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
