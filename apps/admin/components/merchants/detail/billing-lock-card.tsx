"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, ShoppingBag, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isStaffReason,
  MAX_FREE_UNLOCK_DAYS,
  MAX_LOCK_ORDERS_GRANT,
  type BillingLockSnapshot,
} from "@/lib/billing-lock-tools";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { createRequestIds } from "@/lib/request-ids";
import { formatDay, formatIQD } from "@/lib/format";

interface BillingLockCardProps {
  merchantId: string;
  lock: BillingLockSnapshot;
  /**
   * Free unlock is for super admins. Support staff may give more orders at
   * the end of a trial only; a store locked for an unpaid month is a super
   * admin's (the database refuses it too).
   */
  canForceUnlock: boolean;
}

const ORDER_PRESETS = [10, 25, 50];
const UNLOCK_PRESETS = [7, 30];

const REASON_LABEL: Record<NonNullable<BillingLockSnapshot["reason"]>, string> = {
  trial_ended: "Trial ended, not paid",
  unpaid: "Month not paid",
};

type Action = { kind: "orders"; orders: number } | { kind: "unlock"; days: number };

/**
 * A locked store (Fermi A1): what the lock is, how many storefront orders it
 * has left before the storefront pauses, and the staff tools to give more
 * orders or unlock it for free. Each tool needs a reason and is logged.
 * Free trial days (which also open a store locked at the end of its trial)
 * are under Give free days at the top of the page.
 */
export function BillingLockCard({ merchantId, lock, canForceUnlock }: BillingLockCardProps) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [customOrders, setCustomOrders] = useState("");
  const [unlockDays, setUnlockDays] = useState(30);
  // One id per ask: a retry after a lost answer adds the orders or unlocks once.
  const [requestIds] = useState(createRequestIds);
  const reasonOk = isStaffReason(reason);

  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      const url =
        action.kind === "orders"
          ? `/api/merchants/${merchantId}/lock-orders`
          : `/api/merchants/${merchantId}/force-unlock`;
      const amount = action.kind === "orders" ? action.orders : action.days;
      const request_id = requestIds.idFor(`${merchantId}:${action.kind}:${amount}:${reason.trim()}`);
      const body =
        action.kind === "orders"
          ? { orders: action.orders, reason: reason.trim(), request_id }
          : { days: action.days, reason: reason.trim(), request_id };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err: unknown = await res.json().catch(() => null);
        const message =
          typeof err === "object" && err !== null && "error" in err && typeof err.error === "string"
            ? err.error
            : "Something went wrong";
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: () => {
      requestIds.done();
      queryClient.invalidateQueries({ queryKey: ["admin", "merchant", merchantId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
      setReason("");
      setCustomOrders("");
    },
  });

  const run = (action: Action) => {
    if (mutation.isPending || !reasonOk) return;
    mutation.mutate(action);
  };

  const customOrdersN = Number(customOrders);
  const customOrdersOk =
    Number.isInteger(customOrdersN) && customOrdersN >= 1 && customOrdersN <= MAX_LOCK_ORDERS_GRANT;
  const ordersLeft = lock.orders_left ?? 0;
  const paused = ordersLeft <= 0;
  const disabled = mutation.isPending || !reasonOk;
  const canGiveOrders = lock.reason !== "unpaid" || canForceUnlock;

  const chip = (selected: boolean) =>
    cn(
      "rounded-lg px-3 py-1.5 text-[13px] font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-50",
      selected ? "bg-foreground text-background" : "bg-foreground/[0.05] text-foreground hover:bg-foreground/10",
    );

  return (
    <section className="pastel-card border-l-4 border-l-rose-600 p-5" data-testid="billing-lock-card" aria-label="Store locked">
      <div className="mb-4 flex items-start justify-between gap-6">
        <div>
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--ink-red)]">
            <Lock className="h-4 w-4" aria-hidden />
            Store locked
          </p>
          <p className="mt-1 text-[22px] font-semibold text-foreground">
            {lock.reason ? REASON_LABEL[lock.reason] : "Locked"}
          </p>
          <p className="mt-1 text-[13px] text-foreground/70">
            {lock.since && <>Since {formatDay(lock.since)} · </>}
            Paying {formatIQD(lock.price_iqd)} from the wallet unlocks it
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="flex items-center justify-end gap-1.5 text-[13px] text-foreground/70">
            <ShoppingBag className="h-4 w-4" aria-hidden />
            Store orders left
          </p>
          <p
            className={cn(
              "mt-1 text-[22px] font-semibold tabular-nums",
              paused ? "text-[var(--ink-red)]" : "text-foreground",
            )}
          >
            {ordersLeft}
            <span className="ml-1 text-[15px] font-medium text-foreground/70">/ {lock.allowance}</span>
          </p>
          <p className="mt-1 text-[13px] text-foreground/70">
            {paused ? "Storefront paused" : "Then the storefront pauses"}
          </p>
        </div>
      </div>

      <p className="mb-4 text-[13px] text-foreground/70">
        Orders, shipping, labels, export and paying stay open for the merchant. Everything else shows the lock screen.
      </p>

      {canGiveOrders ? (
        <>
          <StaffReasonInput
            value={reason}
            onChange={setReason}
            placeholder="Why? (needed for both tools, saved in the log)"
            className="mb-4"
          />

          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[13px] font-medium text-foreground">Give more store orders</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {ORDER_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={disabled}
                    onClick={() => run({ kind: "orders", orders: n })}
                    className={chip(false)}
                  >
                    + {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={MAX_LOCK_ORDERS_GRANT}
                  value={customOrders}
                  onChange={(e) => setCustomOrders(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && customOrdersOk && run({ kind: "orders", orders: customOrdersN })}
                  placeholder="Other"
                  aria-label="Number of store orders"
                  className="w-24 rounded-lg border border-[var(--card-border)] bg-transparent px-3 py-1.5 text-[13px] tabular-nums outline-none focus:border-foreground/40"
                />
                <button
                  type="button"
                  aria-label="Give these store orders"
                  onClick={() => run({ kind: "orders", orders: customOrdersN })}
                  disabled={disabled || !customOrdersOk}
                  className={chip(false)}
                >
                  Give {customOrdersOk ? customOrdersN : ""}
                </button>
              </div>
            </div>

            {canForceUnlock && (
              <div>
                <p className="mb-2 text-[13px] font-medium text-foreground">Unlock free (no charge)</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {UNLOCK_PRESETS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setUnlockDays(d)}
                      aria-pressed={unlockDays === d}
                      className={chip(unlockDays === d)}
                    >
                      {d} days
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={disabled || unlockDays < 1 || unlockDays > MAX_FREE_UNLOCK_DAYS}
                    onClick={() => run({ kind: "unlock", days: unlockDays })}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Unlock className="h-4 w-4" aria-hidden />
                    Unlock for {unlockDays} days
                  </button>
                </div>
                <p className="mt-1.5 text-[13px] text-foreground/70">
                  Opens a paid period with no wallet charge. When it ends, renewal charges the wallet as usual.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="text-[13px] font-medium text-[var(--ink-red)]" data-testid="billing-lock-super-admin-only">
          A store locked for an unpaid month gets more orders or a free unlock from a super admin.
        </p>
      )}

      {mutation.isError && (
        <p role="alert" className="mt-3 text-[13px] font-medium text-[var(--ink-red)]">
          {mutation.error.message}
        </p>
      )}
    </section>
  );
}
