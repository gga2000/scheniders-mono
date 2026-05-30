"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pause, Zap, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui";
import { cn } from "@/lib/utils";

interface PauseButtonProps {
  merchantId: string;
}

const DURATION_PRESETS = [
  { label: "1 day", days: 1 },
  { label: "3 days", days: 3 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

const BLOCK_OPTIONS = [
  { key: "new_orders", label: "New orders", default: true },
  { key: "new_products", label: "Add products", default: false },
  { key: "team_invites", label: "Team invites", default: false },
  { key: "storefront_writes", label: "Storefront edits", default: false },
] as const;

export function PauseButton({ merchantId }: PauseButtonProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number | null>(7);
  const [reason, setReason] = useState("");
  const [blocks, setBlocks] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(BLOCK_OPTIONS.map((b) => [b.key, b.default]))
  );

  const pause = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/merchants/${merchantId}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration_days: days ?? undefined,
          reason: reason || undefined,
          blocks,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Pause failed");
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
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-foreground/[0.04] hover:bg-amber-50 dark:hover:bg-amber-400/10 text-foreground/70 hover:text-amber-700 dark:hover:text-amber-300 text-xs font-bold transition-all"
        >
          <Pause className="w-3.5 h-3.5" />
          Pause
          <ChevronDown
            className={cn("w-3 h-3 transition-transform opacity-80", open && "rotate-180")}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-4 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl"
      >
        <p className="text-[10px] font-black uppercase tracking-wider text-foreground/50 mb-3">
          Pause merchant
        </p>

        {/* Duration */}
        <p className="text-[10px] font-semibold text-foreground/55 mb-1.5">Duration</p>
        <div className="grid grid-cols-4 gap-1.5 mb-3">
          {DURATION_PRESETS.map((d) => (
            <button
              key={d.days}
              type="button"
              onClick={() => setDays(d.days)}
              className={cn(
                "px-2 py-1.5 rounded-xl text-[11px] font-bold transition-all",
                days === d.days
                  ? "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm shadow-amber-500/30 ring-1 ring-white/20"
                  : "bg-foreground/[0.04] hover:bg-foreground/10 text-foreground"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        {/* Blocks */}
        <p className="text-[10px] font-semibold text-foreground/55 mb-1.5">What's restricted</p>
        <div className="grid grid-cols-2 gap-1 mb-3">
          {BLOCK_OPTIONS.map((b) => (
            <label
              key={b.key}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer transition-all",
                blocks[b.key]
                  ? "bg-amber-50 dark:bg-amber-400/10 text-amber-700 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-400/30"
                  : "bg-foreground/[0.04] text-foreground/60 hover:bg-foreground/10"
              )}
            >
              <input
                type="checkbox"
                checked={!!blocks[b.key]}
                onChange={(e) =>
                  setBlocks((prev) => ({ ...prev, [b.key]: e.target.checked }))
                }
                className="w-3 h-3 accent-amber-500"
              />
              {b.label}
            </label>
          ))}
        </div>

        {/* Reason */}
        <input
          type="text"
          value={reason}
          placeholder="Reason (visible internally)..."
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2 mb-3 rounded-xl bg-foreground/[0.04] border border-transparent focus:border-foreground/20 outline-none text-xs placeholder:text-foreground/40"
        />

        {pause.error && (
          <p className="text-[11px] text-rose-600 mb-2">{pause.error.message}</p>
        )}

        <button
          type="button"
          onClick={() => pause.mutate()}
          disabled={pause.isPending}
          className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white text-xs font-black shadow-sm shadow-amber-500/40 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
        >
          {pause.isPending ? (
            "Pausing..."
          ) : (
            <>
              <Zap className="w-3.5 h-3.5" />
              Confirm pause
            </>
          )}
        </button>
      </PopoverContent>
    </Popover>
  );
}
