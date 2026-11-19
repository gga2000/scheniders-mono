"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatCount, formatIQD } from "@/lib/format";
import type { RequestIds } from "@/lib/request-ids";
import { shopActionKey, typedAmount } from "@/lib/shop-actions";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { TOPUP_MAX_IQD } from "@/lib/topup-queue";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { Choice, ConfirmButton, ErrorLine, FieldInput, PanelTitle, postJson, useLateRefusal, wasAlreadyDone, WillHappen } from "./action-ui";

const PRESETS = [5_000, 10_000, 50_000, 100_000];

interface AddMoneyFormProps {
  shopId: string;
  shopName: string;
  balance: number;
  /** Held by the page, so a reopened form sends the same top-up with the same id. */
  requestIds: RequestIds;
  onDone: () => void;
}

/**
 * Money staff add to a shop's wallet by hand: cash at the office, a transfer
 * with no receipt. How it came is required, so the timeline can say it. The
 * button names the amount, and the line above it the wallet after.
 */
export function AddMoneyForm({ shopId, shopName, balance, requestIds, onDone }: AddMoneyFormProps) {
  const [preset, setPreset] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [how, setHow] = useState("");

  const amount = preset ?? typedAmount(typed);
  const amountOk = amount !== null && amount <= TOPUP_MAX_IQD;
  const ready = amountOk && isStaffReason(how);

  const sayLate = useLateRefusal(`No money was added to ${shopName}.`);

  const add = useMutation({
    mutationKey: shopActionKey(shopId),
    mutationFn: (value: number) =>
      postJson("/api/billing/topup", {
        tenant_id: shopId,
        amount: value,
        description: how.trim(),
        // The same amount sent again before a success (a double press, a retry,
        // a reopened panel with the words typed anew) credits once.
        request_id: requestIds.idFor(`${shopId}:${value}`),
      }),
    onSuccess: (answer, value) => {
      requestIds.done();
      if (wasAlreadyDone(answer)) {
        toast.success(`${formatIQD(value)} was already added to ${shopName}, so it was not added again.`);
      }
      onDone();
    },
    onError: sayLate,
  });

  return (
    <div>
      <PanelTitle aside={`Wallet now ${formatIQD(balance)}`}>Add money</PanelTitle>
      <div className="mb-2 grid grid-cols-4 gap-1.5">
        {PRESETS.map((value) => (
          <Choice
            key={value}
            selected={preset === value}
            onClick={() => {
              setPreset(value);
              setTyped("");
            }}
          >
            {formatCount(value)}
          </Choice>
        ))}
      </div>
      <FieldInput
        inputMode="numeric"
        aria-label="Other amount in IQD"
        placeholder="Other amount, IQD"
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value);
          setPreset(null);
        }}
        className="mb-2 tabular-nums"
      />
      <StaffReasonInput
        value={how}
        onChange={setHow}
        placeholder="How did it come? Cash at the office, transfer..."
        className="mb-3"
      />
      {amount !== null && !amountOk && (
        <p className="mb-2 text-[13px] text-[var(--ink-red)]">At most {formatIQD(TOPUP_MAX_IQD)} at once.</p>
      )}
      {ready && <WillHappen>Wallet after: {formatIQD(balance + amount)}.</WillHappen>}
      <ErrorLine error={add.error} />
      <ConfirmButton disabled={!ready || add.isPending} onClick={() => amount !== null && add.mutate(amount)}>
        {add.isPending ? "Adding..." : amountOk ? `Add ${formatIQD(amount)}` : "Add money"}
      </ConfirmButton>
    </div>
  );
}
