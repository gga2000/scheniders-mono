"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLiveTick } from "@/hooks/use-live-tick";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { reactivateWords } from "@/lib/shop-actions";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { ConfirmButton, ErrorLine, PanelTitle, postJson, WillHappen } from "./action-ui";

interface HoldFormProps {
  shopId: string;
  /** "hold" stops the shop; "reactivate" brings a shop on hold back. */
  mode: "hold" | "reactivate";
  /** Back from hold it is a trial again: its trial was never paid. */
  reopensAsTrial: boolean;
  trialEndsAt: string | null;
  onDone: () => void;
}

/**
 * Put a shop on hold, or bring it back, after one sentence on what that means
 * for its fee. A hold waits for a reason, as every other step that stops or
 * changes a shop does; it goes on the staff log row and the shop's timeline.
 */
export function HoldForm({ shopId, mode, reopensAsTrial, trialEndsAt, onDone }: HoldFormProps) {
  const [why, setWhy] = useState("");
  const now = new Date(useLiveTick(60_000));
  const ready = mode === "reactivate" || isStaffReason(why);
  const change = useMutation({
    mutationFn: () =>
      postJson(
        `/api/merchants/${shopId}`,
        mode === "hold" ? { status: "suspended", reason: why.trim() } : { status: "active" },
        "PATCH",
      ),
    onSuccess: onDone,
  });

  return (
    <div>
      <PanelTitle>{mode === "hold" ? "Put on hold" : "Reactivate"}</PanelTitle>
      {mode === "hold" && (
        <StaffReasonInput value={why} onChange={setWhy} placeholder="Why? (the shop's timeline shows it)" className="mb-3" />
      )}
      <WillHappen>
        {mode === "hold"
          ? "The shop goes on hold now. No monthly fee is charged while it is on hold."
          : reactivateWords(reopensAsTrial, trialEndsAt, now)}
      </WillHappen>
      <ErrorLine error={change.error} />
      <ConfirmButton
        tone={mode === "hold" ? "stop" : "go"}
        disabled={!ready || change.isPending}
        onClick={() => change.mutate()}
      >
        {change.isPending ? "Saving..." : mode === "hold" ? "Put on hold" : "Reactivate"}
      </ConfirmButton>
    </div>
  );
}
