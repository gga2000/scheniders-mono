"use client";

import { useState, useRef, useEffect, memo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanTier } from "@/types/admin";

const PLAN_OPTIONS: Array<{
  value: PlanTier;
  label: string;
  color: string;
}> = [
  { value: "starter", label: "Starter", color: "bg-gradient-to-r from-sky-400 to-cyan-400 text-white" },
  { value: "growth", label: "Growth", color: "bg-gradient-to-r from-emerald-400 to-teal-500 text-white" },
  { value: "professional", label: "Pro", color: "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white" },
  { value: "enterprise", label: "Enterprise", color: "bg-gradient-to-r from-amber-400 to-orange-500 text-white" },
];

const planBadgeStyle: Record<PlanTier, string> = {
  starter:
    "bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-sm shadow-sky-500/30 ring-1 ring-white/20",
  growth:
    "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm shadow-emerald-500/30 ring-1 ring-white/20",
  professional:
    "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30 ring-1 ring-white/20",
  enterprise:
    "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm shadow-amber-500/30 ring-1 ring-white/20",
};

interface MerchantPlanDropdownProps {
  merchantId: string;
  plan: PlanTier;
}

export const MerchantPlanDropdown = memo(function MerchantPlanDropdown({
  merchantId,
  plan,
}: MerchantPlanDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (newPlan: PlanTier) => {
      const res = await fetch(`/api/merchants/${merchantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan }),
      });
      if (!res.ok) throw new Error("Failed to update plan");
      return res.json();
    },
    onMutate: async (newPlan) => {
      await queryClient.cancelQueries({ queryKey: ["admin", "merchants"] });
      queryClient.setQueriesData(
        { queryKey: ["admin", "merchants"] },
        (old: any) => {
          if (!old?.pages) return old;
          return {
            ...old,
            pages: old.pages.map((page: any) => ({
              ...page,
              merchants: page.merchants.map((m: any) =>
                m.id === merchantId ? { ...m, plan: newPlan } : m
              ),
            })),
          };
        }
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "merchant", merchantId] });
    },
  });

  const handleSelect = (newPlan: PlanTier) => {
    if (newPlan === plan) {
      setOpen(false);
      return;
    }
    mutation.mutate(newPlan);
    setOpen(false);
  };

  const current = PLAN_OPTIONS.find((o) => o.value === plan);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={cn(
          "px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer hover:scale-105 active:scale-95",
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

      {open && (
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
              <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold", opt.color)}>
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
