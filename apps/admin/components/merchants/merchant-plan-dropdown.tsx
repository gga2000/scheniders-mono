"use client";

import { patchMerchantInCache } from "@/hooks/use-infinite-merchants";
import { useState, useRef, useEffect, memo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCan } from "@/hooks/use-admin-auth";
import { PLAN_LABELS, type PlanTier } from "@/types/admin";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { ConfirmButton, ErrorLine, postJson, WillHappen } from "./detail/action-ui";

const PLAN_OPTIONS: Array<{
  value: PlanTier;
  label: string;
  color: string;
}> = [
  { value: "starter", label: PLAN_LABELS.starter, color: "bg-gradient-to-r from-sky-400 to-cyan-400 text-white" },
  { value: "internal", label: PLAN_LABELS.internal, color: "bg-gradient-to-r from-slate-400 to-slate-500 text-white" },
];

const planBadgeStyle: Record<PlanTier, string> = {
  starter:
    "bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-sm shadow-sky-500/30 ring-1 ring-white/20",
  internal:
    "bg-gradient-to-br from-slate-400 to-slate-500 text-white shadow-sm shadow-slate-500/30 ring-1 ring-white/20",
};

interface MerchantPlanDropdownProps {
  merchantId: string;
  plan: PlanTier;
  /** Named in the confirm, so a slip on the wrong card is seen before the press. */
  shopName?: string;
}

/**
 * The plan chip on a Merchants card. A pick used to move the shop at once,
 * with the card changed before the server answered (staff console audit
 * W-04). A pick now opens a confirm in the menu, worded as the shop page's
 * plan form: the move named, a reason for the staff log, and the server's
 * refusal said in the menu.
 */
export const MerchantPlanDropdown = memo(function MerchantPlanDropdown({
  merchantId,
  plan,
  shopName,
}: MerchantPlanDropdownProps) {
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState<PlanTier | null>(null);
  const [why, setWhy] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const can = useCan();

  const close = () => {
    setOpen(false);
    setNext(null);
    setWhy("");
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setNext(null);
        setWhy("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // The card shows the new plan only once the server took it.
  const mutation = useMutation({
    mutationFn: (newPlan: PlanTier) =>
      postJson(`/api/merchants/${merchantId}`, { plan: newPlan, reason: why.trim() }, "PATCH"),
    onSuccess: (_data, newPlan) => {
      patchMerchantInCache(queryClient, merchantId, { plan: newPlan });
      toast.success(`${shopName ?? "The shop"} moved to ${PLAN_LABELS[newPlan]}.`);
      close();
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "merchant", merchantId] });
    },
  });

  const handleSelect = (newPlan: PlanTier) => {
    if (newPlan === plan) {
      close();
      return;
    }
    mutation.reset();
    setNext(newPlan);
  };

  const current = PLAN_OPTIONS.find((o) => o.value === plan);

  // Without change_plan the server refuses every choice, so the plan is shown, not offered.
  if (!can("change_plan")) {
    return (
      <span className={cn("px-3 py-1 rounded-full text-xs font-black", planBadgeStyle[plan])}>
        {current?.label ?? plan}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (open) close();
          else setOpen(true);
        }}
        className={cn(
          "px-3 py-1 rounded-full text-xs font-black flex items-center gap-1 transition-all cursor-pointer hover:scale-105 active:scale-95",
          planBadgeStyle[plan]
        )}
      >
        {current?.label ?? plan}
        <ChevronDown
          className={cn(
            "w-3 h-3 transition-transform opacity-80",
            open && "rotate-180"
          )}
        />
      </button>

      {open && next && (
        <div
          role="dialog"
          aria-label={`Move to ${PLAN_LABELS[next]}`}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-full right-0 mt-1 w-72 p-3 bg-[var(--card-bg)] rounded-xl shadow-xl border border-[var(--card-border)] z-50"
        >
          <WillHappen>
            {shopName ?? "This shop"} moves from {current?.label ?? plan} to {PLAN_LABELS[next]} now. Nothing is
            charged and nothing is refunded.
          </WillHappen>
          <StaffReasonInput value={why} onChange={setWhy} placeholder="Why? (the shop's timeline shows it)" className="mb-3" />
          <ErrorLine error={mutation.error} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={close}
              className="rounded-lg px-3 py-2.5 text-[13px] font-semibold text-foreground/70 hover:bg-foreground/5"
            >
              Cancel
            </button>
            <ConfirmButton
              className="flex-1"
              disabled={!isStaffReason(why) || mutation.isPending}
              onClick={() => mutation.mutate(next)}
            >
              {mutation.isPending ? "Moving..." : `Move to ${PLAN_LABELS[next]}`}
            </ConfirmButton>
          </div>
        </div>
      )}

      {open && !next && (
        <div className="absolute top-full right-0 mt-1 w-36 py-1 bg-[var(--card-bg)] rounded-xl shadow-xl border border-[var(--card-border)] z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          {PLAN_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(opt.value);
              }}
              className={cn(
                "w-full px-3 py-1.5 text-xs font-medium flex items-center gap-2 transition-colors",
                opt.value === plan
                  ? "bg-foreground/[0.04] font-bold"
                  : "hover:bg-foreground/[0.04]"
              )}
            >
              <span className={cn("px-1.5 py-0.5 rounded text-xs font-bold", opt.color)}>
                {opt.label}
              </span>
              <span className="flex-1" />
              {opt.value === plan && <Check className="w-3 h-3 text-foreground/50" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
