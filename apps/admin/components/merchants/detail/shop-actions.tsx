"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, ChevronDown, ChevronLeft, Wallet } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { freeDaysKind, moreActions, type MoreAction, type ShopFacts } from "@/lib/shop-actions";
import type { AdminAction } from "@/types/admin";
import { AddMoneyForm } from "./add-money-form";
import { FreeDaysForm } from "./free-days-form";
import { PlanForm } from "./plan-form";
import { PauseForm } from "./pause-form";
import { HoldForm } from "./hold-form";
import { ConvertTrialForm } from "./convert-trial-form";

const MORE_LABEL: Record<MoreAction, string> = {
  orders: "Give more store orders",
  plan: "Change plan",
  pause: "Pause for some days",
  hold: "Put on hold",
  reactivate: "Reactivate",
  convert: "Start paid time, no charge",
  note: "Add a note",
};

const PANEL = "w-80 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-xl";
const SECONDARY =
  "inline-flex items-center gap-1.5 rounded-lg border border-[var(--card-border)] px-3.5 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.05]";

interface ShopActionsProps {
  shopId: string;
  facts: ShopFacts;
  plan: string;
  balance: number;
  /** When the trial, or this month, ends: where free days start. */
  freeDaysFrom: string | null;
  /** The lock card holds the store-orders tool; this brings it into view. */
  onGiveOrders: () => void;
  onAddNote: () => void;
}

/**
 * The shop page's actions (board m4): Add money first, Give free days beside
 * it, the rest under More. Each opens a short form whose button says what
 * will happen, so the press is the confirm. A staff member sees only what
 * their login may do.
 */
export function ShopActions({ shopId, facts, plan, balance, freeDaysFrom, onGiveOrders, onAddNote }: ShopActionsProps) {
  const { role } = useAdminAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<"money" | "days" | "more" | null>(null);
  const [view, setView] = useState<MoreAction | null>(null);

  if (!role) return null;
  const can = (action: AdminAction) => hasPermission(role, action);
  const daysKind = freeDaysKind(facts, can);
  const more = moreActions(facts, can);
  const canAddMoney = can("top_up_wallet");
  if (!canAddMoney && !daysKind && more.length === 0) return null;

  const toggle = (which: "money" | "days" | "more") => (next: boolean) => {
    setOpen(next ? which : null);
    if (!next) setView(null);
  };
  const done = () => {
    queryClient.invalidateQueries({ queryKey: ["admin", "merchant", shopId] });
    queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
    setOpen(null);
    setView(null);
  };
  const pick = (action: MoreAction) => {
    if (action === "orders" || action === "note") {
      setOpen(null);
      if (action === "orders") onGiveOrders();
      else onAddNote();
      return;
    }
    setView(action);
  };

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="shop-actions">
      {canAddMoney && (
        <Popover open={open === "money"} onOpenChange={toggle("money")}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-800"
            >
              <Wallet className="h-4 w-4" aria-hidden />
              Add money
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className={PANEL}>
            <AddMoneyForm shopId={shopId} balance={balance} onDone={done} />
          </PopoverContent>
        </Popover>
      )}

      {daysKind && (
        <Popover open={open === "days"} onOpenChange={toggle("days")}>
          <PopoverTrigger asChild>
            <button type="button" className={SECONDARY}>
              <CalendarPlus className="h-4 w-4" aria-hidden />
              Give free days
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className={PANEL}>
            <FreeDaysForm shopId={shopId} kind={daysKind} endsAt={freeDaysFrom} locked={facts.locked} onDone={done} />
          </PopoverContent>
        </Popover>
      )}

      {more.length > 0 && (
        <Popover open={open === "more"} onOpenChange={toggle("more")}>
          <PopoverTrigger asChild>
            <button type="button" className={SECONDARY}>
              More
              <ChevronDown className="h-4 w-4" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className={PANEL}>
            {view ? (
              <>
                <button
                  type="button"
                  onClick={() => setView(null)}
                  className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-foreground/70 hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Back
                </button>
                {view === "plan" && <PlanForm shopId={shopId} plan={plan} onDone={done} />}
                {view === "pause" && <PauseForm shopId={shopId} onDone={done} />}
                {view === "hold" && <HoldForm shopId={shopId} mode="hold" onDone={done} />}
                {view === "reactivate" && <HoldForm shopId={shopId} mode="reactivate" onDone={done} />}
                {view === "convert" && <ConvertTrialForm shopId={shopId} onDone={done} />}
              </>
            ) : (
              <ul className="-m-1.5">
                {more.map((action) => (
                  <li key={action}>
                    <button
                      type="button"
                      onClick={() => pick(action)}
                      className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-foreground hover:bg-foreground/[0.05]"
                    >
                      {MORE_LABEL[action]}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
