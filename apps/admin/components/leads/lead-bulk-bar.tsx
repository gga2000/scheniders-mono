"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useBulkLeadAction } from "@/hooks/use-lead-mutations";
import { hasPermission } from "@/lib/admin-permissions";
import type { AdminRole } from "@/types/admin";

interface LeadBulkBarProps {
  selectedIds: string[];
  role: AdminRole | null;
  onClear: () => void;
}

const BUTTON = "text-sm px-3 py-1 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50";

/**
 * The bar under ticked leads. "Assign" sent no one to assign to, so the server
 * refused every press and nothing said so; "Delete" removed up to 100 leads
 * and their history on one click. Each button now says what it does, a
 * refusal is shown, and Delete asks once more, naming how many. The bar is
 * always dark, so its red is the light one, and it keeps one line.
 */
export function LeadBulkBar({ selectedIds, role, onClear }: LeadBulkBarProps) {
  const bulkAction = useBulkLeadAction();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const canDelete = role ? hasPermission(role, "delete_leads") : false;
  const count = selectedIds.length;

  const run = (body: Parameters<typeof bulkAction.mutate>[0]) =>
    bulkAction.mutate(body, {
      onSuccess: () => {
        setConfirmingDelete(false);
        onClear();
      },
      onError: (error) => {
        setConfirmingDelete(false);
        toast.error(error.message);
      },
    });

  return (
    <motion.div
      initial={{ y: 50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 50, opacity: 0 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex w-max max-w-[calc(100vw-2rem)] items-center gap-4 whitespace-nowrap px-6 py-3 bg-[#1E1E1E] text-white rounded-2xl shadow-2xl border border-white/10"
    >
      <span className="text-sm font-medium">{count} selected</span>
      <div className="w-px h-5 bg-white/20" />
      <button
        type="button"
        onClick={() => run({ lead_ids: selectedIds, action: "change_status", payload: { status: "contacted" } })}
        disabled={bulkAction.isPending}
        className={BUTTON}
      >
        Mark contacted
      </button>
      <button
        type="button"
        onClick={() => run({ lead_ids: selectedIds, action: "assign_to_me" })}
        disabled={bulkAction.isPending}
        className={BUTTON}
      >
        Assign to me
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={() =>
            confirmingDelete ? run({ lead_ids: selectedIds, action: "delete" }) : setConfirmingDelete(true)
          }
          disabled={bulkAction.isPending}
          className={`${BUTTON} text-red-300 ${confirmingDelete ? "font-bold bg-red-500/15" : ""}`}
        >
          {confirmingDelete ? `Delete ${count} ${count === 1 ? "lead" : "leads"} and their history?` : "Delete"}
        </button>
      )}
      <div className="w-px h-5 bg-white/20" />
      <button
        type="button"
        onClick={() => {
          setConfirmingDelete(false);
          onClear();
        }}
        className="text-sm text-zinc-400 hover:text-white transition-colors"
      >
        Clear
      </button>
    </motion.div>
  );
}
