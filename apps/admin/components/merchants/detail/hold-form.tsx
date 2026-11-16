"use client";

import { useMutation } from "@tanstack/react-query";
import { ConfirmButton, ErrorLine, PanelTitle, postJson, WillHappen } from "./action-ui";

interface HoldFormProps {
  shopId: string;
  /** "hold" stops the shop; "reactivate" brings a shop on hold back. */
  mode: "hold" | "reactivate";
  onDone: () => void;
}

/** Put a shop on hold, or bring it back, after one sentence on what that means for its fee. */
export function HoldForm({ shopId, mode, onDone }: HoldFormProps) {
  const change = useMutation({
    mutationFn: () =>
      postJson(`/api/merchants/${shopId}`, { status: mode === "hold" ? "suspended" : "active" }, "PATCH"),
    onSuccess: onDone,
  });

  return (
    <div>
      <PanelTitle>{mode === "hold" ? "Put on hold" : "Reactivate"}</PanelTitle>
      <WillHappen>
        {mode === "hold"
          ? "The shop goes on hold now. No monthly fee is charged while it is on hold."
          : "The shop is active again now, and its monthly fee is charged as usual."}
      </WillHappen>
      <ErrorLine error={change.error} />
      <ConfirmButton tone={mode === "hold" ? "stop" : "go"} disabled={change.isPending} onClick={() => change.mutate()}>
        {change.isPending ? "Saving..." : mode === "hold" ? "Put on hold" : "Reactivate"}
      </ConfirmButton>
    </div>
  );
}
