"use client";

import { patchMerchantInCache } from "@/hooks/use-infinite-merchants";
import { useState, useRef, useEffect, memo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCan } from "@/hooks/use-admin-auth";
import { statusLandedText, statusPickRefusal, statusPickSaves } from "@/lib/shop-status-choice";
import type { TenantStatus, TrialPayment } from "@/types/admin";

const STATUS_OPTIONS: Array<{
  value: TenantStatus;
  label: string;
  dot: string;
  destructive?: boolean;
}> = [
  { value: "trial", label: "Trial", dot: "bg-amber-500" },
  { value: "active", label: "Active", dot: "bg-green-500" },
  { value: "limited", label: "Paused", dot: "bg-yellow-500" },
  { value: "suspended", label: "Suspended", dot: "bg-red-500", destructive: true },
  { value: "cancelled", label: "Cancelled", dot: "bg-gray-400", destructive: true },
];

const statusBadgeStyle: Record<TenantStatus, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-400/15 dark:text-green-400",
  trial: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-400",
  limited: "bg-yellow-100 text-yellow-800 dark:bg-yellow-400/15 dark:text-yellow-400",
  suspended: "bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-400/15 dark:text-gray-400",
};

interface MerchantStatusDropdownProps {
  merchantId: string;
  status: TenantStatus;
  /** Whether its trial was paid: which moves are offered, and what Active saves. */
  trialPayment: TrialPayment;
}

export const MerchantStatusDropdown = memo(function MerchantStatusDropdown({
  merchantId,
  status,
  trialPayment,
}: MerchantStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<TenantStatus | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const can = useCan();

  // Click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmAction(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (newStatus: TenantStatus) => {
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update status");
      }
      return res.json();
    },
    onMutate: async (newStatus) => {
      // Optimistic update, with the status the server will save.
      await queryClient.cancelQueries({ queryKey: ["admin", "merchants"] });
      const saves = statusPickSaves({ status, trial_payment: trialPayment }, newStatus);
      return { restore: patchMerchantInCache(queryClient, merchantId, { status: saves }) };
    },
    // A held trial that was never paid comes back as Trial when Active is
    // picked: the card says so and shows Trial at once.
    onSuccess: (answer, picked) => {
      const landed = statusLandedText(picked, answer);
      if (!landed) return;
      patchMerchantInCache(queryClient, merchantId, { status: "trial" });
      toast.info(landed);
    },
    // The server says why it refused (a paused shop, a trial, the demo store).
    // The card goes back to the real status at once, before the list is read again.
    onError: (error: Error, _newStatus, context) => {
      context?.restore();
      toast.error(error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "merchant", merchantId] });
    },
  });

  const handleSelect = (newStatus: TenantStatus) => {
    if (newStatus === status) {
      setOpen(false);
      return;
    }

    const opt = STATUS_OPTIONS.find((o) => o.value === newStatus);
    if (opt?.destructive) {
      setConfirmAction(newStatus);
      return;
    }

    mutation.mutate(newStatus);
    setOpen(false);
    setConfirmAction(null);
  };

  const handleConfirm = () => {
    if (confirmAction) {
      mutation.mutate(confirmAction);
      setOpen(false);
      setConfirmAction(null);
    }
  };

  const current = STATUS_OPTIONS.find((o) => o.value === status);
  // The current status, then only the moves admin_update_shop accepts. "Paused"
  // is set by Pause on the shop page, and a paused shop has no move at all
  // until its pause is lifted.
  const menu = STATUS_OPTIONS.filter(
    (o) => o.value === status || statusPickRefusal({ status, trial_payment: trialPayment }, o.value) === null,
  );

  // A status change goes through the same PATCH as a plan change, which needs
  // change_plan; without it, or with no move to offer, the status is shown, not offered.
  if (!can("change_plan") || menu.length < 2) {
    return (
      <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1", statusBadgeStyle[status])}>
        <span className={cn("w-1.5 h-1.5 rounded-full", current?.dot)} />
        {current?.label ?? status}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
          setConfirmAction(null);
        }}
        className={cn(
          "px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer",
          statusBadgeStyle[status]
        )}
      >
        <span className={cn("w-1.5 h-1.5 rounded-full", current?.dot)} />
        {current?.label ?? status}
        <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-40 py-1 bg-[var(--card-bg)] rounded-xl shadow-xl border border-[var(--card-border)] z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {confirmAction ? (
            <div className="p-3 space-y-2">
              <p className="text-xs text-foreground/70">
                Change status to <strong className="capitalize">{confirmAction}</strong>?
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                  className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmAction(null); }}
                  className="flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold border border-[var(--card-border)] text-foreground/60 hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            menu.map((opt) => (
              <button
                key={opt.value}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelect(opt.value);
                }}
                className={cn(
                  "w-full px-3 py-1.5 text-xs font-medium flex items-center gap-2 transition-colors",
                  opt.value === status
                    ? "bg-foreground/[0.04] font-bold"
                    : "hover:bg-foreground/[0.04]"
                )}
              >
                <span className={cn("w-2 h-2 rounded-full shrink-0", opt.dot)} />
                <span className="flex-1 text-left">{opt.label}</span>
                {opt.value === status && <Check className="w-3 h-3 text-foreground/50" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
});
