"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLiveTick } from "@/hooks/use-live-tick";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { reactivateWords, shopActionKey, type Comeback } from "@/lib/shop-actions";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { ConfirmButton, ErrorLine, PanelFields, PanelTitle, useWriteFailed, WillHappen } from "./action-ui";
import { postJson } from "@/lib/send-json";

interface HoldFormProps {
  shopId: string;
  shopName: string;
  /** "hold" stops the shop; "reactivate" brings a shop on hold back. */
  mode: "hold" | "reactivate";
  /** What the shop comes back as from hold (reactivateComeback). */
  comeback: Comeback;
  trialEndsAt: string | null;
  onDone: () => void;
}

/**
 * Put a shop on hold, or bring it back, after one sentence on what that means
 * for its fee. A hold waits for a reason, as every other step that stops or
 * changes a shop does; it goes on the staff log row and the shop's timeline.
 */
export function HoldForm({ shopId, shopName, mode, comeback, trialEndsAt, onDone }: HoldFormProps) {
  const [why, setWhy] = useState("");
  const now = new Date(useLiveTick(60_000));
  const ready = mode === "reactivate" || isStaffReason(why);
  const failed = useWriteFailed(shopId, mode === "hold" ? `${shopName} was not put on hold.` : `${shopName} was not reactivated.`);
  const change = useMutation({
    mutationKey: shopActionKey(shopId),
    mutationFn: () =>
      postJson(
        `/api/merchants/${shopId}`,
        mode === "hold" ? { status: "suspended", reason: why.trim() } : { status: "active" },
        "PATCH",
      ),
    onSuccess: onDone,
    onError: failed,
  });

  return (
    <PanelFields busy={change.isPending}>
      <PanelTitle>{mode === "hold" ? "Put on hold" : "Reactivate"}</PanelTitle>
      {mode === "hold" && (
        <StaffReasonInput value={why} onChange={setWhy} placeholder="Why? (the shop's timeline shows it)" className="mb-3" />
      )}
      <WillHappen>
        {mode === "hold"
          ? "The shop goes on hold now. No monthly fee is charged while it is on hold."
          : reactivateWords(comeback, trialEndsAt, now)}
      </WillHappen>
      <ErrorLine error={change.error} />
      <ConfirmButton
        tone={mode === "hold" ? "stop" : "go"}
        disabled={!ready || change.isPending}
        onClick={() => change.mutate()}
      >
        {change.isPending ? "Saving..." : mode === "hold" ? "Put on hold" : "Reactivate"}
      </ConfirmButton>
    </PanelFields>
  );
}
