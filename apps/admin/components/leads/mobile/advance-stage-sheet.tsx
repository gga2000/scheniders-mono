"use client";

import type { Lead, LeadStatus } from "@/types/leads";
import { LEAD_STATUS_CONFIG, LEAD_STATUS_UI } from "@/types/leads";
import { getNextStages } from "../lead-stage";
import { useUpdateLead } from "@/hooks/use-lead-mutations";
import { BottomSheet } from "./bottom-sheet";
import { toast } from "sonner";

interface AdvanceStageSheetProps {
  lead: Lead | null;
  onClose: () => void;
}

export function AdvanceStageSheet({ lead, onClose }: AdvanceStageSheetProps) {
  const updateLead = useUpdateLead();
  const stages = lead ? getNextStages(lead.status) : [];

  const move = (status: LeadStatus) => {
    if (!lead) return;
    updateLead.mutate(
      { id: lead.id, data: { status } },
      {
        onSuccess: () => { toast.success(`Moved to ${LEAD_STATUS_CONFIG[status].label}`); onClose(); },
        onError: () => toast.error("Couldn't update the stage."),
      },
    );
  };

  return (
    <BottomSheet open={!!lead} onOpenChange={(o) => !o && onClose()} title={lead ? `Move "${lead.merchant_name}"` : ""}>
      {stages.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--muted)]">No further stages from here.</p>
      ) : (
        <div className="flex flex-col gap-2 py-1">
          {stages.map((s) => {
            const ui = LEAD_STATUS_UI[s];
            return (
              <button
                key={s}
                type="button"
                disabled={updateLead.isPending}
                onClick={() => move(s)}
                className="flex items-center gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3.5 text-left font-bold active:scale-[0.99] transition-transform disabled:opacity-50"
                style={{ color: ui.solid }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ui.solid }} />
                {LEAD_STATUS_CONFIG[s].label}
              </button>
            );
          })}
        </div>
      )}
    </BottomSheet>
  );
}
