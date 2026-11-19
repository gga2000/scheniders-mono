"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { PLAN_LABELS, PLAN_TIERS, planLabel, type PlanTier } from "@/types/admin";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { Choice, ConfirmButton, ErrorLine, PanelTitle, postJson, WillHappen } from "./action-ui";

/**
 * Move a shop to another plan. The button names the move; nothing is charged
 * or refunded. It waits for a reason, as a hold does: a plan decides what the
 * shop pays each month, so the staff log keeps why it moved.
 */
export function PlanForm({ shopId, plan, onDone }: { shopId: string; plan: string; onDone: () => void }) {
  const [next, setNext] = useState<PlanTier | null>(null);
  const [why, setWhy] = useState("");

  const change = useMutation({
    mutationFn: (to: PlanTier) => postJson(`/api/merchants/${shopId}`, { plan: to, reason: why.trim() }, "PATCH"),
    onSuccess: onDone,
  });

  return (
    <div>
      <PanelTitle aside={`Now ${planLabel(plan)}`}>Change plan</PanelTitle>
      <div className="mb-3 flex flex-col gap-1.5">
        {PLAN_TIERS.filter((tier) => tier !== plan).map((tier) => (
          <Choice key={tier} selected={next === tier} onClick={() => setNext(tier)} className="text-left">
            {PLAN_LABELS[tier]}
          </Choice>
        ))}
      </div>
      <StaffReasonInput value={why} onChange={setWhy} placeholder="Why? (the shop's timeline shows it)" className="mb-3" />
      {next && (
        <WillHappen>
          The shop and its subscription move to {PLAN_LABELS[next]} now. Nothing is charged and nothing is refunded.
        </WillHappen>
      )}
      <ErrorLine error={change.error} />
      <ConfirmButton disabled={!next || !isStaffReason(why) || change.isPending} onClick={() => next && change.mutate(next)}>
        {change.isPending ? "Changing..." : next ? `Move to ${PLAN_LABELS[next]}` : "Change plan"}
      </ConfirmButton>
    </div>
  );
}
