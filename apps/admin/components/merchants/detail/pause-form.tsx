"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatDayTime } from "@/lib/format";
import { endAfterDays } from "@/lib/shop-actions";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { Choice, ConfirmButton, ErrorLine, PanelTitle, postJson, WillHappen } from "./action-ui";

const DAYS = [1, 3, 7, 30];

const BLOCKS = [
  { key: "new_orders", label: "New orders" },
  { key: "new_products", label: "New products" },
  { key: "team_invites", label: "Team invites" },
  { key: "storefront_writes", label: "Storefront edits" },
] as const;

type BlockKey = (typeof BLOCKS)[number]["key"];

/** New orders stop by default; the rest only when staff tick them. */
const FIRST_BLOCKS: Record<BlockKey, boolean> = {
  new_orders: true,
  new_products: false,
  team_invites: false,
  storefront_writes: false,
};

/**
 * Pause a shop for some days: the chosen parts stop, the rest keep working,
 * and the pause lifts on its own on the day the line above the button gives.
 */
export function PauseForm({ shopId, onDone }: { shopId: string; onDone: () => void }) {
  const [days, setDays] = useState(7);
  const [why, setWhy] = useState("");
  const [blocks, setBlocks] = useState(FIRST_BLOCKS);
  const stopped = BLOCKS.filter((b) => blocks[b.key]).map((b) => b.label.toLowerCase());
  const ready = isStaffReason(why) && stopped.length > 0;

  const pause = useMutation({
    mutationFn: () => postJson(`/api/merchants/${shopId}/pause`, { duration_days: days, reason: why.trim(), blocks }),
    onSuccess: onDone,
  });

  return (
    <div>
      <PanelTitle>Pause the shop</PanelTitle>
      <div className="mb-3 grid grid-cols-4 gap-1.5">
        {DAYS.map((d) => (
          <Choice key={d} selected={days === d} onClick={() => setDays(d)}>
            {d === 1 ? "1 day" : `${d} days`}
          </Choice>
        ))}
      </div>
      <p className="mb-1.5 text-[13px] text-foreground/70">What stops</p>
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        {BLOCKS.map((b) => (
          <label key={b.key} className="flex cursor-pointer items-center gap-2 text-[13px] text-foreground">
            <input
              type="checkbox"
              checked={blocks[b.key]}
              onChange={(e) => setBlocks((prev) => ({ ...prev, [b.key]: e.target.checked }))}
              className="h-3.5 w-3.5 accent-foreground"
            />
            {b.label}
          </label>
        ))}
      </div>
      <StaffReasonInput value={why} onChange={setWhy} placeholder="Why? (the shop page shows it)" className="mb-3" />
      {ready && (
        <WillHappen>
          {stopped.join(", ").replace(/^./, (c) => c.toUpperCase())} stop until{" "}
          {formatDayTime(endAfterDays(null, days))}, then the pause lifts on its own.
        </WillHappen>
      )}
      <ErrorLine error={pause.error} />
      <ConfirmButton tone="stop" disabled={!ready || pause.isPending} onClick={() => pause.mutate()}>
        {pause.isPending ? "Pausing..." : `Pause for ${days === 1 ? "1 day" : `${days} days`}`}
      </ConfirmButton>
    </div>
  );
}
