"use client";

import { useState } from "react";
import { useIsMutating } from "@tanstack/react-query";
import { CalendarPlus, ChevronDown, ChevronLeft, Wallet } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { hasPermission } from "@/lib/admin-permissions";
import { keptRequestIds } from "@/lib/request-ids";
import {
  CONVERT_ACTION,
  freeDaysKind,
  moreActions,
  shopActionKey,
  type Comeback,
  type MoreAction,
  type ShopFacts,
  type ShopForm,
} from "@/lib/shop-actions";
import type { AdminAction } from "@/types/admin";
import { AddMoneyForm } from "./add-money-form";
import { FreeDaysForm } from "./free-days-form";
import { PlanForm } from "./plan-form";
import { PauseForm } from "./pause-form";
import { HoldForm } from "./hold-form";
import { ConvertTrialForm } from "./convert-trial-form";
import { useRereadShop } from "./action-ui";

const MORE_LABEL: Record<MoreAction, string> = {
  orders: "Give more store orders",
  plan: "Change plan",
  pause: "Pause for some days",
  hold: "Put on hold",
  reactivate: "Reactivate",
  convert: CONVERT_ACTION,
  note: "Add a note",
};

const PANEL = "w-80 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4 shadow-xl";
/** A button waits (grey, wait cursor) while a write on this shop runs. */
const WAITS = "disabled:cursor-wait disabled:opacity-60";
const SECONDARY = `inline-flex items-center gap-1.5 rounded-lg border border-[var(--card-border)] px-3.5 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.05] ${WAITS}`;

interface ShopActionsProps {
  shopId: string;
  /** Names the shop in a refusal said after its panel is gone. */
  shopName: string;
  facts: ShopFacts;
  plan: string;
  balance: number;
  /** When the trial, or this month, ends: where free days start. */
  freeDaysFrom: string | null;
  /** What the shop comes back as from hold (Reactivate says so). */
  comeback: Comeback;
  trialEndsAt: string | null;
  /** Staff turned monthly renewal off: the free-time panel warns it turns it back on. */
  renewalOff: boolean;
  /** The lock card holds the store-orders tool; this brings it into view. */
  onGiveOrders: () => void;
  onAddNote: () => void;
  /** The form a link asked for (shopFormHref), open when the page loads. */
  startOpen?: ShopForm | null;
}

/**
 * The shop page's actions (board m4): Add money first, Give free days beside
 * it, the rest under More. Each opens a short form whose button says what
 * will happen, so the press is the confirm. A staff member sees only what
 * their login may do.
 *
 * While a panel's write runs, the panel stays open, and Back and the other
 * panels' buttons wait, so its answer is always seen in the panel that asked
 * (round 20: a sibling button closed a running panel, and its answer then
 * closed the panel staff were typing in). The request ids live here, above the panels, so a
 * form closed after its answer was lost and opened again sends the same ask
 * with the same id, and the money or days are given once (round 19).
 */
export function ShopActions({
  shopId,
  shopName,
  facts,
  plan,
  balance,
  freeDaysFrom,
  comeback,
  trialEndsAt,
  renewalOff,
  onGiveOrders,
  onAddNote,
  startOpen = null,
}: ShopActionsProps) {
  const { role } = useAdminAuth();
  const rereadShop = useRereadShop(shopId);
  const [open, setOpen] = useState<ShopForm | "more" | null>(startOpen);
  const [view, setView] = useState<MoreAction | null>(null);
  const [requestIds] = useState(() => ({
    money: keptRequestIds("topup"),
    days: keptRequestIds("free-days"),
    convert: keptRequestIds("convert"),
  }));
  const writing = useIsMutating({ mutationKey: shopActionKey(shopId) }) > 0;

  if (!role) return null;
  const can = (action: AdminAction) => hasPermission(role, action);
  const daysKind = freeDaysKind(facts, can);
  const more = moreActions(facts, can);
  const canAddMoney = can("top_up_wallet");
  if (!canAddMoney && !daysKind && more.length === 0) return null;

  const toggle = (which: "money" | "days" | "more") => (next: boolean) => {
    if (writing) return;
    setOpen(next ? which : null);
    if (!next) setView(null);
  };
  const done = () => {
    rereadShop();
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
              disabled={writing}
              className={`inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-800 ${WAITS}`}
            >
              <Wallet className="h-4 w-4" aria-hidden />
              Add money
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className={PANEL}>
            <AddMoneyForm shopId={shopId} shopName={shopName} balance={balance} requestIds={requestIds.money} onDone={done} />
          </PopoverContent>
        </Popover>
      )}

      {daysKind && (
        <Popover open={open === "days"} onOpenChange={toggle("days")}>
          <PopoverTrigger asChild>
            <button type="button" disabled={writing} className={SECONDARY}>
              <CalendarPlus className="h-4 w-4" aria-hidden />
              Give free days
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className={PANEL}>
            <FreeDaysForm
              shopId={shopId}
              shopName={shopName}
              kind={daysKind}
              endsAt={freeDaysFrom}
              locked={facts.locked}
              requestIds={requestIds.days}
              onDone={done}
            />
          </PopoverContent>
        </Popover>
      )}

      {more.length > 0 && (
        <Popover open={open === "more"} onOpenChange={toggle("more")}>
          <PopoverTrigger asChild>
            <button type="button" disabled={writing} className={SECONDARY}>
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
                  disabled={writing}
                  className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-foreground/70 hover:text-foreground disabled:cursor-wait disabled:opacity-60"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                  Back
                </button>
                {view === "plan" && <PlanForm shopId={shopId} shopName={shopName} plan={plan} onDone={done} />}
                {view === "pause" && <PauseForm shopId={shopId} shopName={shopName} onDone={done} />}
                {view === "hold" && (
                  <HoldForm
                    shopId={shopId}
                    shopName={shopName}
                    mode="hold"
                    comeback={comeback}
                    trialEndsAt={trialEndsAt}
                    onDone={done}
                  />
                )}
                {view === "reactivate" && (
                  <HoldForm
                    shopId={shopId}
                    shopName={shopName}
                    mode="reactivate"
                    comeback={comeback}
                    trialEndsAt={trialEndsAt}
                    onDone={done}
                  />
                )}
                {view === "convert" && (
                  <ConvertTrialForm
                    shopId={shopId}
                    shopName={shopName}
                    requestIds={requestIds.convert}
                    locked={facts.locked}
                    renewalOff={renewalOff}
                    onDone={done}
                  />
                )}
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
