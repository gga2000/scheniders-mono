"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Download, Loader2, Tag, MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

interface CustomerBulkBarProps {
  selectedCount: number;
  /** Customers the current filters match, shown on the "select all" offer. */
  totalMatching: number;
  /** Omitted when the user may not bulk-read customers (export permission). */
  onSelectAll?: () => void;
  /** Every match of the current filters is already selected. */
  allSelected: boolean;
  selectingAll: boolean;
  /** Omitted when the user may not export customer data. */
  onExport?: () => void;
  onAddTag?: () => void;
  onBroadcast: () => void;
  onClear: () => void;
}

export function CustomerBulkBar({
  selectedCount,
  totalMatching,
  onSelectAll,
  allSelected,
  selectingAll,
  onExport,
  onAddTag,
  onBroadcast,
  onClear,
}: CustomerBulkBarProps) {
  const { t } = useLanguage();
  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 80, opacity: 0, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          className="fixed inset-x-3 bottom-3 z-50 sm:inset-x-auto sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2"
        >
          <div className="flex flex-wrap items-center justify-center gap-1 rounded-3xl border border-(--card-border) bg-(--card-bg)/95 px-2 py-1.5 backdrop-blur-md" style={{ boxShadow: "var(--card-shadow-hover)" }}>
            {/* Count chip */}
            <div className="flex items-center gap-2 rounded-2xl bg-(--pastel-blue)/40 px-3 py-1.5 text-sm font-semibold text-foreground">
              <span className="flex h-5 min-w-5 px-1.5 items-center justify-center rounded-full tabular-nums bg-blue-500 text-[10px] font-bold text-white">
                {selectedCount}
              </span>
              {t("customers.bulk.selected")}
            </div>

            {onSelectAll && !allSelected && totalMatching > 0 && (
              <button
                onClick={onSelectAll}
                disabled={selectingAll}
                className="flex min-h-11 items-center gap-1.5 rounded-2xl px-3 text-xs font-semibold text-blue-600 transition-colors hover:bg-(--pastel-blue)/40 disabled:opacity-50"
              >
                {selectingAll && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t("customers.bulk.selectAllMatching", { count: totalMatching.toLocaleString("en-US") })}
              </button>
            )}

            <div className="mx-1 hidden h-5 w-px bg-(--card-border) sm:block" />

            {/* Actions */}
            {onAddTag && (
              <ActionButton
                icon={Tag}
                label={t("customers.bulk.addTag")}
                onClick={onAddTag}
                pastelClass="hover:bg-(--pastel-purple)/40 hover:text-foreground"
              />
            )}
            <ActionButton
              icon={MessageCircle}
              label={t("customers.bulk.broadcast")}
              onClick={onBroadcast}
              pastelClass="hover:bg-(--pastel-green)/40 hover:text-foreground"
            />
            {onExport && (
              <ActionButton
                icon={Download}
                label={t("customers.bulk.exportCsv")}
                onClick={onExport}
                pastelClass="hover:bg-(--pastel-blue)/40 hover:text-foreground"
              />
            )}

            <div className="mx-1 hidden h-5 w-px bg-(--card-border) sm:block" />

            {/* Clear */}
            <button
              onClick={onClear}
              className="flex min-h-11 items-center gap-1.5 rounded-2xl px-3 text-xs text-muted transition-colors hover:bg-background hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              {t("customers.bulk.cancel")}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  pastelClass,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  pastelClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center gap-1.5 rounded-2xl px-3 text-xs font-medium text-muted transition-all duration-150",
        pastelClass
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
