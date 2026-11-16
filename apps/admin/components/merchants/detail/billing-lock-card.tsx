"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Plus, ShoppingBag, Unlock, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isStaffReason,
  MAX_FREE_UNLOCK_DAYS,
  MAX_LOCK_ORDERS_GRANT,
  type BillingLockSnapshot,
} from "@/lib/billing-lock-tools";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";

interface BillingLockCardProps {
  merchantId: string;
  lock: BillingLockSnapshot;
  /** Free unlock is for super admins; support staff see the other tools only. */
  canForceUnlock: boolean;
}

const ORDER_PRESETS = [10, 25, 50];
const UNLOCK_PRESETS = [7, 30];

const REASON_LABEL: Record<NonNullable<BillingLockSnapshot["reason"]>, string> = {
  trial_ended: "Trial ended, not paid",
  unpaid: "Month not paid",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const fmtIqd = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

type Action = { kind: "orders"; orders: number } | { kind: "unlock"; days: number };

/**
 * A locked store (Fermi A1): what the lock is, how many storefront orders it
 * has left before the storefront pauses, and the staff tools to give more
 * orders or unlock it for free. Each tool needs a reason and is logged.
 * Extending an ended trial is on the trial card above.
 */
export function BillingLockCard({ merchantId, lock, canForceUnlock }: BillingLockCardProps) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [customOrders, setCustomOrders] = useState("");
  const [unlockDays, setUnlockDays] = useState(30);
  const reasonOk = isStaffReason(reason);

  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      const url =
        action.kind === "orders"
          ? `/api/merchants/${merchantId}/lock-orders`
          : `/api/merchants/${merchantId}/force-unlock`;
      const body =
        action.kind === "orders"
          ? { orders: action.orders, reason: reason.trim() }
          : { days: action.days, reason: reason.trim() };
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

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 border bg-gradient-to-br from-rose-50 via-amber-50 to-orange-50 dark:from-rose-400/10 dark:via-amber-400/10 dark:to-orange-400/10 border-rose-200 dark:border-rose-400/30"
      data-testid="billing-lock-card"
    >
      <div aria-hidden className="absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl opacity-30 bg-rose-300" />

      <div className="relative flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] font-black flex items-center gap-1.5 text-rose-700 dark:text-rose-300">
            <Lock className="w-3 h-3" />
            Store locked
          </p>
          <p className="text-2xl font-black leading-none mt-2 tracking-tight text-rose-900 dark:text-rose-200">
            {lock.reason ? REASON_LABEL[lock.reason] : "Locked"}
          </p>
          <p className="text-[11px] text-foreground/55 mt-2 font-medium">
            {lock.since && (
              <>
                Since {fmtDate(lock.since)}
                <span className="mx-1.5 text-foreground/30">·</span>
              </>
            )}
            Paying {fmtIqd(lock.price_iqd)} IQD from the wallet unlocks it
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-[0.1em] font-black text-foreground/50 flex items-center justify-end gap-1">
            <ShoppingBag className="w-3 h-3" />
            Store orders left
          </p>
          <p
            className={cn(
              "text-3xl font-black tabular-nums leading-none mt-2",
              paused ? "text-rose-600 dark:text-rose-300" : "text-foreground",
            )}
          >
            {ordersLeft}
            <span className="text-sm font-bold text-foreground/40 ml-1">/ {lock.allowance}</span>
          </p>
          <p className="text-[10px] text-foreground/50 mt-1.5 font-medium">
            {paused ? "Storefront paused" : "Then the storefront pauses"}
          </p>
        </div>
      </div>

      <p className="relative text-[11px] text-foreground/60 mb-3">
        Orders, shipping, labels, export and paying stay open for the merchant. Everything else shows the lock screen.
      </p>

      <StaffReasonInput
        value={reason}
        onChange={setReason}
        placeholder="Why? (needed for both tools, saved in the log)"
        className="relative mb-3"
      />

      <div className="relative space-y-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.1em] font-black text-foreground/50 mb-2">
            Give more store orders
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {ORDER_PRESETS.map((n) => (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => run({ kind: "orders", orders: n })}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 text-foreground text-[11px] font-bold ring-1 ring-foreground/10 hover:ring-foreground/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3 h-3" />
                {n}
              </button>
            ))}
            <div className="inline-flex items-center gap-1 bg-white/80 dark:bg-white/10 rounded-full ring-1 ring-foreground/10 pl-3 pr-1 py-0.5">
              <input
                type="number"
                min={1}
                max={MAX_LOCK_ORDERS_GRANT}
                value={customOrders}
                onChange={(e) => setCustomOrders(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && customOrdersOk && run({ kind: "orders", orders: customOrdersN })}
                placeholder="Other"
                aria-label="Number of store orders"
                className="w-14 bg-transparent outline-none text-[11px] font-bold tabular-nums"
              />
              <button
                type="button"
                aria-label="Give these store orders"
                onClick={() => run({ kind: "orders", orders: customOrdersN })}
                disabled={disabled || !customOrdersOk}
                className="p-1 rounded-full bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-50"
              >
                <Zap className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {canForceUnlock && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.1em] font-black text-foreground/50 mb-2">
              Unlock free (no charge)
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {UNLOCK_PRESETS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setUnlockDays(d)}
                  aria-pressed={unlockDays === d}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[11px] font-bold ring-1 transition-all",
                    unlockDays === d
                      ? "bg-foreground text-background ring-foreground"
                      : "bg-white/80 dark:bg-white/10 text-foreground ring-foreground/10 hover:ring-foreground/30",
                  )}
                >
                  {d} days
                </button>
              ))}
              <button
                type="button"
                disabled={disabled || unlockDays < 1 || unlockDays > MAX_FREE_UNLOCK_DAYS}
                onClick={() => run({ kind: "unlock", days: unlockDays })}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Unlock className="w-3 h-3" />
                Unlock for {unlockDays} days
              </button>
            </div>
            <p className="text-[10px] text-foreground/50 mt-1.5">
              Opens a paid period with no wallet charge. When it ends, renewal charges the wallet as usual.
            </p>
          </div>
        )}
      </div>

      {mutation.isError && (
        <div className="relative mt-3 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-400/10 border border-rose-200 dark:border-rose-400/30 text-xs text-rose-700 dark:text-rose-300 font-medium">
          {mutation.error.message}
        </div>
      )}
    </div>
  );
}
