"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PLAN_LABELS, PLAN_TIERS, type PlanTier } from "@/types/admin";
import { X, Loader2, AlertTriangle, CheckCircle } from "lucide-react";
import { createRequestIds } from "@/lib/request-ids";
import { isStaffReason, STAFF_REASON_MAX, STAFF_REASON_TOO_SHORT } from "@/lib/billing-lock-tools";
import { StaffReasonInput } from "@/components/shared/staff-reason-input";
import { isBulkFailureList, notDoneLines, tooManyShops, type BulkFailure } from "@/lib/bulk-not-done";
import { adminFetch } from "@/lib/admin-fetch";
import { WillHappen } from "./detail/action-ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BulkActionDialogProps {
  action: string | null; // null = closed
  selectedCount: number;
  selectedIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

/** What the server did, per shop. `failed` is empty when everything went through. */
type BulkOutcome = { done: number; failed: BulkFailure[] };

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
          return { done: body.succeeded.length, failed: body.failed } satisfies BulkOutcome;
        }
        throw new Error(typeof body.error === "string" ? body.error : "Failed to execute bulk action");
      }
      return { done: payload.tenant_ids.length, failed: [] } satisfies BulkOutcome;
    },
    onSuccess: (outcome) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
      if (outcome.failed.length > 0) {
        setPartial(outcome);
        return;
      }
      requestIds.done();
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  if (!action) return null;

  function close() {
    // The action already ran for some shops: drop the selection so the same
    // shops are not picked up again by the next action.
    if (partial) onSuccess();
    onClose();
  }

  /** A reason box says the rule itself once something is typed; an empty one is said here. */
  function sayReasonMissing(reason: string) {
    if (reason.trim() === "") setError(STAFF_REASON_TOO_SHORT);
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
        if (!isStaffReason(planReason)) {
          sayReasonMissing(planReason);
          return;
        }
        params = { plan: selectedPlan, reason: planReason.trim() };
        break;
      case "extend-trial":
        if (!isStaffReason(extensionReason)) {
          sayReasonMissing(extensionReason);
          return;
        }
        params = {
          days: extensionDays,
          reason: extensionReason.trim(),
          // The same ask again (a retry) reuses the id, so no shop is extended twice.
          request_id: requestIds.idFor(
            `extend:${extensionDays}:${extensionReason.trim()}:${[...selectedIds].sort().join(",")}`,
          ),
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
        if (!isStaffReason(description)) {
          setError(STAFF_REASON_TOO_SHORT);
          return;
        }
        params = {
          amount_iqd: amount,
          description,
          // Same amount, note and shops asked again (a retry) reuses the id,
          // so a wallet this request already credited is not credited twice.
          request_id: requestIds.idFor(
            `${amount}:${description}:${[...selectedIds].sort().join(",")}`,
          ),
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
              {ACTION_TITLES[action] ?? action}
            </h2>
            <p className="text-sm text-foreground/70 mt-0.5">
              {selectedCount} selected merchant{selectedCount !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={close}
            className="p-1.5 rounded-lg text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-colors"
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
              <WillHappen>
                {selectedCount} {selectedCount === 1 ? "shop moves" : "shops move"} to {PLAN_LABELS[selectedPlan]} now.
                Nothing is charged and nothing is refunded.
              </WillHappen>
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
                <input
                  type="text"
                  value={topUpDescription}
                  onChange={(e) => setTopUpDescription(e.target.value)}
                  placeholder="e.g. Monthly credit bonus"
                  maxLength={STAFF_REASON_MAX}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-[#1E1E1E]/20 transition-all"
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
            className="px-4 py-2 rounded-xl text-sm font-semibold text-foreground/70 hover:text-foreground border border-[var(--card-border)] transition-all"
          >
            {partial ? "Close" : "Cancel"}
          </button>
          {/* After a partial result there is nothing left to confirm: a second
              press would run the action again for the shops already done. */}
          {!partial && (
            <button
              onClick={handleConfirm}
              disabled={mutation.isPending}
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
