"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Loader2, RotateCcw, Check } from "lucide-react";

/**
 * Sticky bottom action bar shown while a super_admin is editing the column
 * layout. Mirrors the bulk-action bar so the two never share the screen
 * (entering edit mode clears the lead selection). "Save for everyone" makes the
 * org-wide blast radius explicit.
 */
export function LeadsTableEditBar({
  visibleCount,
  isDirty,
  isSaving,
  columnsControl,
  onResetDefault,
  onDiscard,
  onSave,
}: {
  visibleCount: number;
  isDirty: boolean;
  isSaving: boolean;
  /** Show/hide + reorder popover trigger, rendered inline in the bar. */
  columnsControl?: ReactNode;
  onResetDefault: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 bg-[#1E1E1E] text-white rounded-2xl shadow-2xl border border-white/10"
    >
      <span className="text-sm font-medium whitespace-nowrap">
        Editing columns
        <span className="text-zinc-400"> · {visibleCount} shown</span>
      </span>
      <div className="w-px h-5 bg-white/20" />
      {columnsControl}
      <button
        type="button"
        onClick={onResetDefault}
        disabled={isSaving}
        className="text-sm px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors inline-flex items-center gap-1.5 disabled:opacity-40"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Reset to default
      </button>
      <button
        type="button"
        onClick={onDiscard}
        disabled={isSaving}
        className="text-sm text-zinc-400 hover:text-white transition-colors px-2 disabled:opacity-40"
      >
        Discard
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={!isDirty || isSaving}
        className="text-sm px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#FF8899] to-[#A78BFA] font-bold text-white transition-all hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
      >
        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        Save for everyone
      </button>
    </motion.div>
  );
}
