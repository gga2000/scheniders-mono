"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PLAN_LABELS, PLAN_TIERS, type PlanTier } from "@/types/admin";
import { X, Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { createRequestIds } from "@/lib/request-ids";
import { isStaffReason } from "@/lib/billing-lock-tools";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { isBulkFailureList, notDoneLines, tooManyShops, type BulkFailure } from "@/lib/bulk-not-done";
import { adminFetch } from "@/lib/admin-fetch";
import { toast } from "sonner";
import { formatIQD } from "@/lib/format";
import { useStillDrawn, WillHappen } from "./detail/action-ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BulkActionDialogProps {
  action: string | null; // null = closed
  selectedCount: number;
  selectedIds: string[];
  /** The plan of each picked shop the page has loaded, so Change Plan can say which already have it. */
  planOf?: ReadonlyMap<string, string>;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * What the server did, per shop. `failed` is empty when everything went
 * through; `repeats` counts wallets that already had this top-up (its request
 * id was seen), so they were not credited again.
 */
type BulkOutcome = { done: number; failed: BulkFailure[]; repeats: number };

const shops = (n: number) => (n === 1 ? "1 shop" : `${n} shops`);

/** Before the press: how many picked shops move, and that the ones already on the plan stay as they are. */
export function planMoveWords(count: number, alreadyOn: number, label: string): string {
  const unchanged = " Nothing is charged and nothing is refunded.";
  if (alreadyOn >= count) return `Every picked shop is on ${label} already, so nothing changes.`;
  const moving = count - alreadyOn;
  const stay =
    alreadyOn === 0
      ? ""
      : ` ${alreadyOn === 1 ? "1 is" : `${alreadyOn} are`} on ${label} already and ${alreadyOn === 1 ? "stays as it is" : "stay as they are"}.`;
  return `${moving === 1 ? "1 shop moves" : `${moving} shops move`} to ${label} now.${stay}${unchanged}`;
}

/**
 * After a bulk step that went through for every shop: what it did, said in a
 * toast, as the leads bulk bar does (round 20: a success closed in silence).
 */
export function bulkDoneWords(
  action: string,
  outcome: BulkOutcome,
  params: Record<string, unknown> | undefined,
): string {
  const n = outcome.done;
  switch (action) {
    case "change-plan": {
      const tier = PLAN_TIERS.find((t) => t === params?.plan);
      const label = tier ? PLAN_LABELS[tier] : "the new plan";
      return `${shops(n)} ${n === 1 ? "is" : "are"} on ${label} now.`;
    }
    case "extend-trial":
      return `${n === 1 ? "1 trial" : `${n} trials`} got ${Number(params?.days)} more days.`;
    case "top-up": {
      const amount = formatIQD(Number(params?.amount_iqd));
      const credited = n - outcome.repeats;
      if (credited === 0) return `Every wallet had ${amount} already, so nothing was added again.`;
      const again =
        outcome.repeats === 0
          ? ""
          : ` ${outcome.repeats === 1 ? "1 had it already and was" : `${outcome.repeats} had it already and were`} not credited again.`;
      return `${amount} added to ${credited === 1 ? "1 wallet" : `${credited} wallets`}.${again}`;
    }
    case "suspend":
      return `${shops(n)} suspended.`;
    case "reactivate":
      return `${shops(n)} reactivated.`;
    default:
      return `Done for ${shops(n)}.`;
  }
}

/** How many shops the server says it did, and how many top-ups it had seen before. */
function doneFrom(body: Record<string, unknown>, sent: number): Pick<BulkOutcome, "done" | "repeats"> {
  const succeeded = Array.isArray(body.succeeded) ? body.succeeded : null;
  const repeats = (succeeded ?? []).filter(
    (s: unknown) => typeof s === "object" && s !== null && "duplicate" in s && s.duplicate === true,
  ).length;
  return { done: succeeded ? succeeded.length : sent, repeats };
}

const PLAN_OPTIONS = PLAN_TIERS.map((value) => ({ value, label: PLAN_LABELS[value] }));

const DAY_PRESETS = [3, 7, 14, 30];
const TOPUP_PRESETS = [5_000, 10_000, 25_000, 50_000];

const ACTION_TITLES: Record<string, string> = {
  "change-plan": "Change Plan",
  suspend: "Suspend Merchants",
  reactivate: "Reactivate Merchants",
  "extend-trial": "Extend Trial",
  "top-up": "Top Up Wallets",
};

// Map the UI action keys (kebab-case) to the API action values (snake_case)
function toApiAction(action: string): string {
  const map: Record<string, string> = {
    "change-plan": "change_plan",
    suspend: "suspend",
    reactivate: "reactivate",
    "extend-trial": "extend_trial",
    "top-up": "top_up",
  };
  return map[action] ?? action;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkActionDialog({
  action,
  selectedCount,
  selectedIds,
  planOf,
  onClose,
  onSuccess,
}: BulkActionDialogProps) {
  const queryClient = useQueryClient();

  // Local form state
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>("starter");
  const [planReason, setPlanReason] = useState("");
  const [extensionDays, setExtensionDays] = useState<number>(7);
  const [extensionReason, setExtensionReason] = useState("");
  const [topUpAmount, setTopUpAmount] = useState<number>(10_000);
  const [topUpCustom, setTopUpCustom] = useState("");
  const [topUpDescription, setTopUpDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Set when the server did the action for some shops and not for others.
  const [partial, setPartial] = useState<BulkOutcome | null>(null);
  const [requestIds] = useState(createRequestIds);
  const stillDrawn = useStillDrawn();
  const title = action ? (ACTION_TITLES[action] ?? action) : "";

  // Reset form state when switching actions
  useEffect(() => {
    setSelectedPlan("starter");
    setPlanReason("");
    setExtensionDays(7);
    setExtensionReason("");
    setTopUpAmount(10_000);
    setTopUpCustom("");
    setTopUpDescription("");
    setError(null);
    setPartial(null);
  }, [action]);

  const mutation = useMutation({
    mutationFn: async (payload: {
      action: string;
      tenant_ids: string[];
      params?: Record<string, unknown>;
    }) => {
      const res = await adminFetch("/api/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: unknown = await res.json().catch(() => null);
      const body = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
      if (!res.ok) {
        // Done for some shops, not for others: report it, do not offer a blind retry.
        if (Array.isArray(body.succeeded) && isBulkFailureList(body.failed)) {
          return { ...doneFrom(body, payload.tenant_ids.length), failed: body.failed } satisfies BulkOutcome;
        }
        throw new Error(typeof body.error === "string" ? body.error : "Failed to execute bulk action");
      }
      return { ...doneFrom(body, payload.tenant_ids.length), failed: [] } satisfies BulkOutcome;
    },
    onSuccess: (outcome, payload) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
      if (outcome.failed.length > 0) {
        // Staff left Merchants during the write: say it where they are now.
        if (!stillDrawn()) {
          const total = outcome.done + outcome.failed.length;
          toast.error(`${title}: done for ${outcome.done} of ${total} ${total === 1 ? "merchant" : "merchants"}.`, {
            description: notDoneLines(outcome.failed).join(" "),
          });
        }
        setPartial(outcome);
        return;
      }
      requestIds.done();
      toast.success(bulkDoneWords(action ?? "", outcome, payload.params));
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      if (!stillDrawn()) toast.error(`${title} was not done. ${err.message}`);
      setError(err.message);
    },
  });

  if (!action) return null;

  // Steps that change what shops pay or get wait for a reason; Confirm stays
  // grey until it has one, as every shop page form's button does (round 20).
  const reason =
    action === "change-plan"
      ? planReason
      : action === "extend-trial"
        ? extensionReason
        : action === "top-up"
          ? topUpDescription
          : null;
  const waitsForReason = reason !== null && !isStaffReason(reason);
  const alreadyOn = selectedIds.filter((id) => planOf?.get(id) === selectedPlan).length;

  function close() {
    // The action already ran for some shops: drop the selection so the same
    // shops are not picked up again by the next action.
    if (partial) onSuccess();
    onClose();
  }

  function handleConfirm() {
    setError(null);
    const tooMany = tooManyShops(selectedIds.length);
    if (tooMany) {
      setError(tooMany);
      return;
    }

    const apiAction = toApiAction(action!);
    let params: Record<string, unknown> | undefined;

    switch (action) {
      case "change-plan":
        params = { plan: selectedPlan, reason: planReason.trim() };
        break;
      case "extend-trial":
        params = {
          days: extensionDays,
          reason: extensionReason.trim(),
          // The same days for the same shops again (a retry, the reason typed
          // anew) reuse the id, so no shop is extended twice.
          request_id: requestIds.idFor(`extend:${extensionDays}:${[...selectedIds].sort().join(",")}`),
        };
        break;
      case "top-up": {
        const amount = topUpCustom ? Number(topUpCustom) : topUpAmount;
        if (!Number.isFinite(amount) || amount < 1000) {
          setError("Amount must be at least 1,000 IQD");
          return;
        }
        if (amount > 10_000_000) {
          setError("Amount cannot exceed 10,000,000 IQD");
          return;
        }
        const description = topUpDescription.trim();
        params = {
          amount_iqd: amount,
          description,
          // The same amount for the same shops again (a retry, the note typed
          // anew) reuses the id, so a wallet already credited is not credited twice.
          request_id: requestIds.idFor(`top-up:${amount}:${[...selectedIds].sort().join(",")}`),
        };
        break;
      }
      default:
        // suspend / reactivate don't need params
        break;
    }

    mutation.mutate({
      action: apiAction,
      tenant_ids: selectedIds,
      params,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !mutation.isPending) close();
      }}
    >
      <div className="bg-[var(--card-bg)] rounded-2xl shadow-2xl border border-[var(--card-border)] p-6 w-full max-w-md">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {title}
            </h2>
            <p className="text-sm text-foreground/70 mt-0.5">
              {selectedCount} selected merchant{selectedCount !== 1 ? "s" : ""}
            </p>
          </div>
          {/* While the write runs, every way out waits, so its answer is seen. */}
          <button
            onClick={close}
            disabled={mutation.isPending}
            aria-label="Close"
            className="p-1.5 rounded-lg text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="mb-6">
          {/* ---- Change Plan ---- */}
          {action === "change-plan" && (
            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground/70">
                New Plan
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PLAN_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedPlan(opt.value)}
                    className={`px-4 py-3 rounded-xl border cursor-pointer transition-all text-sm font-semibold text-left ${
                      selectedPlan === opt.value
                        ? "border-[#1E1E1E] bg-[#1E1E1E]/5 text-foreground"
                        : "border-[var(--card-border)] text-foreground/70 hover:border-foreground/30"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <label className="block text-sm font-semibold text-foreground/70">
                Reason
              </label>
              <StaffReasonInput
                value={planReason}
                onChange={setPlanReason}
                placeholder="Why? (each shop's timeline shows it)"
              />
              <WillHappen>{planMoveWords(selectedCount, alreadyOn, PLAN_LABELS[selectedPlan])}</WillHappen>
            </div>
          )}

          {/* ---- Top Up ---- */}
          {action === "top-up" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/70">
                  Amount (IQD)
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {TOPUP_PRESETS.map((amt) => (
                    <button
                      key={amt}
                      onClick={() => { setTopUpAmount(amt); setTopUpCustom(""); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                        !topUpCustom && topUpAmount === amt
                          ? "border-[#1E1E1E] bg-[#1E1E1E]/5 text-foreground"
                          : "border-[var(--card-border)] bg-foreground/5 text-foreground/70 hover:bg-foreground/10 hover:text-foreground"
                      }`}
                    >
                      {new Intl.NumberFormat("en-IQ").format(amt)}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-foreground/70">Custom:</span>
                  <input
                    type="number"
                    value={topUpCustom}
                    onChange={(e) => setTopUpCustom(e.target.value)}
                    placeholder="e.g. 100,000"
                    min={1000}
                    max={10_000_000}
                    className="flex-1 px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-[#1E1E1E]/20 transition-all"
                  />
                  <span className="text-xs text-foreground/70">IQD</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/70">
                  Reason <span className="font-normal text-foreground/70">(saved in the log)</span>
                </label>
                <StaffReasonInput
                  value={topUpDescription}
                  onChange={setTopUpDescription}
                  placeholder="e.g. Monthly credit bonus"
                />
              </div>
              <div className="px-3 py-2 rounded-xl bg-green-50 dark:bg-green-400/10 border border-green-200 dark:border-green-400/20 text-xs text-green-700 dark:text-green-400">
                Total: <strong>{new Intl.NumberFormat("en-IQ").format((topUpCustom ? (Number.isFinite(Number(topUpCustom)) ? Number(topUpCustom) : 0) : topUpAmount) * selectedCount)} IQD</strong> across {selectedCount} merchant{selectedCount !== 1 ? "s" : ""}
              </div>
            </div>
          )}

          {/* ---- Suspend ---- */}
          {action === "suspend" && (
            <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">
                  Warning: Suspension
                </p>
                <p className="text-sm text-red-700 mt-1">
                  This will suspend {selectedCount} merchant
                  {selectedCount !== 1 ? "s" : ""}. They will lose access to
                  their dashboard.
                </p>
              </div>
            </div>
          )}

          {/* ---- Reactivate ---- */}
          {action === "reactivate" && (
            <div className="px-4 py-3 rounded-xl bg-green-50 border border-green-200 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-800">
                  Reactivation
                </p>
                <p className="text-sm text-green-700 mt-1">
                  This will reactivate {selectedCount} merchant
                  {selectedCount !== 1 ? "s" : ""}.
                </p>
              </div>
            </div>
          )}

          {/* ---- Extend Trial ---- */}
          {action === "extend-trial" && (
            <div className="space-y-3">
              <label className="text-sm font-semibold text-foreground/70">
                Extension Days
              </label>
              <div className="flex items-center gap-2">
                {DAY_PRESETS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setExtensionDays(d)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
                      extensionDays === d
                        ? "border-[#1E1E1E] bg-[#1E1E1E]/5 text-foreground"
                        : "border-[var(--card-border)] bg-foreground/5 text-foreground/70 hover:bg-foreground/10 hover:text-foreground"
                    }`}
                  >
                    +{d} days
                  </button>
                ))}
              </div>
              <label className="block text-sm font-semibold text-foreground/70">
                Reason
              </label>
              <StaffReasonInput
                value={extensionReason}
                onChange={setExtensionReason}
                placeholder="Why? (saved in each store's log)"
              />
            </div>
          )}

        </div>

        {/* Partly done: say what happened, per reason */}
        {partial && (
          <div className="mb-4 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900 space-y-1.5">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Done for {partial.done} of {partial.done + partial.failed.length}{" "}
              {partial.done + partial.failed.length === 1 ? "merchant" : "merchants"}
            </p>
            <ul className="list-disc pl-5 space-y-0.5">
              {notDoneLines(partial.failed).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={close}
            disabled={mutation.isPending}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-foreground/70 hover:text-foreground border border-[var(--card-border)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {partial ? "Close" : "Cancel"}
          </button>
          {/* After a partial result there is nothing left to confirm: a second
              press would run the action again for the shops already done. */}
          {!partial && (
            <button
              onClick={handleConfirm}
              disabled={mutation.isPending || waitsForReason}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1E1E1E] text-white hover:bg-[#2D2D2D] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {mutation.isPending && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              Confirm
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
