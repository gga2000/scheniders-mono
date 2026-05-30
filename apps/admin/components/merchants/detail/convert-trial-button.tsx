"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpCircle, ChevronDown, Sparkles, Zap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui";
import { cn } from "@/lib/utils";

interface ConvertTrialButtonProps {
  merchantId: string;
}

const PERIOD_PRESETS = [
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
  { label: "1 year", days: 365 },
];

export function ConvertTrialButton({ merchantId }: ConvertTrialButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(30);
  const [reason, setReason] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/merchants/${merchantId}/convert-trial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_days: days, reason: reason || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Convert failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "merchant", merchantId] });
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
      setOpen(false);
      setReason("");
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-xs font-bold shadow-sm shadow-violet-500/30 ring-1 ring-white/20 hover:scale-105 active:scale-95 transition-all"
        >
          <ArrowUpCircle className="w-3.5 h-3.5" />
          Convert to paid
          <ChevronDown
            className={cn("w-3 h-3 transition-transform opacity-80", open && "rotate-180")}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl"
      >
        <div className="flex items-center gap-1.5 mb-3">
          <Sparkles className="w-3 h-3 text-violet-600 dark:text-violet-400" />
          <p className="text-[10px] font-black uppercase tracking-wider text-foreground/55">
            Convert trial to paid
          </p>
        </div>

        <p className="text-[11px] text-foreground/65 leading-snug mb-3">
          The merchant will move to <span className="font-bold text-foreground">active</span> with
          a new billing period starting now. You can adjust the duration below.
        </p>

        {/* Period */}
        <p className="text-[10px] font-semibold text-foreground/55 mb-1.5">Initial period</p>
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => setDays(p.days)}
              className={cn(
                "px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all",
                days === p.days
                  ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30 ring-1 ring-white/20"
                  : "bg-foreground/[0.04] hover:bg-foreground/10 text-foreground"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={reason}
          placeholder="Note (e.g., 'Sales call closed')..."
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2 mb-3 rounded-xl bg-foreground/[0.04] border border-transparent focus:border-foreground/20 outline-none text-xs placeholder:text-foreground/40"
        />

        {mutation.error && (
          <p className="text-[11px] text-rose-600 mb-2">{mutation.error.message}</p>
        )}

        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 hover:from-violet-400 hover:to-fuchsia-500 text-white text-xs font-black shadow-sm shadow-violet-500/40 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
        >
          {mutation.isPending ? (
            "Converting..."
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" />
              Confirm conversion
            </>
          )}
        </button>
      </PopoverContent>
    </Popover>
  );
}
