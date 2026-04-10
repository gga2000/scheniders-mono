"use client";

import { useState, useRef, useEffect, memo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TenantStatus } from "@/types/admin";

const STATUS_OPTIONS: Array<{
  value: TenantStatus;
  label: string;
  dot: string;
  destructive?: boolean;
}> = [
  { value: "trial", label: "Trial", dot: "bg-amber-500" },
  { value: "active", label: "Active", dot: "bg-green-500" },
  { value: "suspended", label: "Suspended", dot: "bg-red-500", destructive: true },
  { value: "cancelled", label: "Cancelled", dot: "bg-gray-400", destructive: true },
];

const statusBadgeStyle: Record<TenantStatus, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-400/15 dark:text-green-400",
  trial: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-400",
  suspended: "bg-red-100 text-red-800 dark:bg-red-400/15 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-400/15 dark:text-gray-400",
};

interface MerchantStatusDropdownProps {
  merchantId: string;
  status: TenantStatus;
}

export const MerchantStatusDropdown = memo(function MerchantStatusDropdown({
  merchantId,
  status,
}: MerchantStatusDropdownProps) {
  const [open, setOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<TenantStatus | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

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
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onMutate: async (newStatus) => {
      // Optimistic update
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
                m.id === merchantId ? { ...m, status: newStatus } : m
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
            STATUS_OPTIONS.map((opt) => (
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
