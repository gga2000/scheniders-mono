"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, AlertTriangle, CheckCircle, Bell, MessageSquare, Mail, Sparkles } from "lucide-react";

const NOTIFICATION_TEMPLATES: Array<{
  key: string;
  label: string;
  body: string;
}> = [
  {
    key: "trial_reminder",
    label: "Trial Reminder",
    body:
      "Hi! Your trial is ending soon. Upgrade now to keep your store live and avoid any disruption.",
  },
  {
    key: "failed_payment",
    label: "Failed Payment",
    body:
      "Your last payment didn't go through. Please update your billing details to avoid account suspension.",
  },
  {
    key: "welcome_back",
    label: "Welcome Back",
    body:
      "Glad to have you back! Let us know if there's anything we can do to help you get the most out of your store.",
  },
  {
    key: "new_feature",
    label: "New Feature",
    body:
      "We just shipped a new feature we think you'll love — check it out in your dashboard.",
  },
  {
    key: "checkin",
    label: "Check-in",
    body:
      "Hi! Just a quick check-in to see how things are going. Let us know if there's anything we can help with.",
  },
];

type Channel = "in_app" | "whatsapp" | "email";

const CHANNELS: Array<{
  value: Channel;
  label: string;
  icon: typeof Bell;
  available: boolean;
  hint?: string;
}> = [
  { value: "in_app", label: "In-app", icon: Bell, available: true },
  {
    value: "whatsapp",
    label: "WhatsApp",
    icon: MessageSquare,
    available: false,
    hint: "Coming soon",
  },
  {
    value: "email",
    label: "Email",
    icon: Mail,
    available: false,
    hint: "Coming soon",
  },
];

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

type PlanOption = "starter" | "growth" | "professional" | "enterprise";

const PLAN_OPTIONS: { value: PlanOption; label: string }[] = [
  { value: "starter", label: "Starter" },
  { value: "growth", label: "Growth" },
  { value: "professional", label: "Professional" },
  { value: "enterprise", label: "Enterprise" },
];

const DAY_PRESETS = [3, 7, 14, 30];
const TOPUP_PRESETS = [5_000, 10_000, 25_000, 50_000];

const ACTION_TITLES: Record<string, string> = {
  "change-plan": "Change Plan",
  suspend: "Suspend Merchants",
  reactivate: "Reactivate Merchants",
  "extend-trial": "Extend Trial",
  "send-notification": "Send Notification",
  "top-up": "Top Up Wallets",
};

// Map the UI action keys (kebab-case) to the API action values (snake_case)
function toApiAction(action: string): string {
  const map: Record<string, string> = {
    "change-plan": "change_plan",
    suspend: "suspend",
    reactivate: "reactivate",
    "extend-trial": "extend_trial",
    "send-notification": "send_notification",
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
  const [selectedPlan, setSelectedPlan] = useState<PlanOption>("starter");
  const [extensionDays, setExtensionDays] = useState<number>(7);
  const [notificationMessage, setNotificationMessage] = useState("");
  const [notificationTemplate, setNotificationTemplate] = useState<string | null>(null);
  const [notificationChannel, setNotificationChannel] = useState<Channel>("in_app");
  const [topUpAmount, setTopUpAmount] = useState<number>(10_000);
  const [topUpCustom, setTopUpCustom] = useState("");
  const [topUpDescription, setTopUpDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset form state when switching actions
  useEffect(() => {
    setSelectedPlan("starter");
    setExtensionDays(7);
    setNotificationMessage("");
    setNotificationTemplate(null);
    setNotificationChannel("in_app");
    setTopUpAmount(10_000);
    setTopUpCustom("");
    setTopUpDescription("");
    setError(null);
  }, [action]);

  const mutation = useMutation({
    mutationFn: async (payload: {
      action: string;
      tenant_ids: string[];
      params?: Record<string, unknown>;
    }) => {
      const res = await fetch("/api/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to execute bulk action");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  if (!action) return null;

  function handleConfirm() {
    setError(null);

    const apiAction = toApiAction(action!);
    let params: Record<string, unknown> | undefined;

    switch (action) {
      case "change-plan":
        params = { plan: selectedPlan };
        break;
      case "extend-trial":
        params = { days: extensionDays };
        break;
      case "send-notification":
        if (!notificationMessage.trim()) {
          setError("Message is required");
          return;
        }
        params = {
          message: notificationMessage.trim(),
          channel: notificationChannel,
          ...(notificationTemplate && { template: notificationTemplate }),
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
        params = {
          amount_iqd: amount,
          ...(topUpDescription.trim() && { description: topUpDescription.trim() }),
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
        if (e.target === e.currentTarget && !mutation.isPending) onClose();
      }}
    >
      <div className="bg-[var(--card-bg)] rounded-2xl shadow-2xl border border-[var(--card-border)] p-6 w-full max-w-md">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {ACTION_TITLES[action] ?? action}
            </h2>
            <p className="text-sm text-foreground/50 mt-0.5">
              {selectedCount} selected merchant{selectedCount !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-colors"
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
                        : "border-[var(--card-border)] text-foreground/60 hover:border-foreground/30"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
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
                  <span className="text-xs text-foreground/50">Custom:</span>
                  <input
                    type="number"
                    value={topUpCustom}
                    onChange={(e) => setTopUpCustom(e.target.value)}
                    placeholder="e.g. 100,000"
                    min={1000}
                    max={10_000_000}
                    className="flex-1 px-3 py-1.5 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-[#1E1E1E]/20 transition-all"
                  />
                  <span className="text-xs text-foreground/40">IQD</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground/70">
                  Description <span className="font-normal text-foreground/40">(optional)</span>
                </label>
                <input
                  type="text"
                  value={topUpDescription}
                  onChange={(e) => setTopUpDescription(e.target.value)}
                  placeholder="e.g. Monthly credit bonus"
                  maxLength={200}
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
            </div>
          )}

          {/* ---- Send Notification ---- */}
          {action === "send-notification" && (
            <div className="space-y-4">
              {/* Channel selector */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.08em] text-foreground/50">
                  Channel
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {CHANNELS.map((ch) => {
                    const ChIcon = ch.icon;
                    const isSelected = notificationChannel === ch.value;
                    return (
                      <button
                        key={ch.value}
                        type="button"
                        onClick={() => ch.available && setNotificationChannel(ch.value)}
                        disabled={!ch.available}
                        className={`relative flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                          isSelected
                            ? "border-violet-500 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30 ring-1 ring-white/20"
                            : ch.available
                              ? "border-[var(--card-border)] bg-foreground/[0.02] text-foreground/70 hover:bg-foreground/[0.06] hover:text-foreground"
                              : "border-[var(--card-border)] bg-foreground/[0.02] text-foreground/30 cursor-not-allowed"
                        }`}
                      >
                        <ChIcon className="w-4 h-4" />
                        <span>{ch.label}</span>
                        {!ch.available && ch.hint && (
                          <span className="text-[8px] font-medium opacity-70">
                            {ch.hint}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Template picker */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.08em] text-foreground/50 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Templates
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {NOTIFICATION_TEMPLATES.map((t) => {
                    const isActive = notificationTemplate === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => {
                          setNotificationTemplate(t.key);
                          setNotificationMessage(t.body);
                        }}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                          isActive
                            ? "bg-foreground text-background"
                            : "bg-foreground/[0.04] text-foreground/70 hover:bg-foreground/[0.08] hover:text-foreground"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setNotificationTemplate(null);
                      setNotificationMessage("");
                    }}
                    className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-foreground/[0.04] text-foreground/55 hover:bg-foreground/[0.08] hover:text-foreground transition-all"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Message body */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.08em] text-foreground/50">
                  Message
                </label>
                <textarea
                  value={notificationMessage}
                  onChange={(e) => {
                    setNotificationMessage(e.target.value);
                    if (notificationTemplate) setNotificationTemplate(null);
                  }}
                  placeholder="Pick a template above or write your own..."
                  rows={4}
                  maxLength={500}
                  className="w-full px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none transition-all"
                />
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-foreground/45 font-medium">
                    Will be sent to{" "}
                    <span className="font-black text-foreground">
                      {selectedCount}
                    </span>{" "}
                    {selectedCount === 1 ? "merchant" : "merchants"}
                  </p>
                  <p className="text-[10px] text-foreground/40 tabular-nums">
                    {notificationMessage.length}/500
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-foreground/60 hover:text-foreground border border-[var(--card-border)] transition-all"
          >
            Cancel
          </button>
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
        </div>
      </div>
    </div>
  );
}
