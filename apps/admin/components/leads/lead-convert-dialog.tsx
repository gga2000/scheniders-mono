"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Lead } from "@/types/leads";
import { LEAD_TIER_CONFIG, PLATFORM_CONFIG } from "@/types/leads";
import { useConvertLead } from "@/hooks/use-lead-mutations";
import {
  Trophy,
  X,
  CheckCircle2,
  AlertTriangle,
  Store,
  Phone,
  UserPlus,
  Wallet,
  ArrowRightCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { EASE_CHROME, STAGGER_CHILDREN } from "@/lib/animation-constants";

// ── Types ──────────────────────────────────────────────────────────────

interface LeadConvertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
}

type ChecklistItemStatus = "pass" | "warn";

interface ChecklistItem {
  label: string;
  status: ChecklistItemStatus;
  detail?: string;
}

// ── Component ──────────────────────────────────────────────────────────

export function LeadConvertDialog({ isOpen, onClose, lead }: LeadConvertDialogProps) {
  const convertLead = useConvertLead();
  const [notes, setNotes] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setNotes("");
      setShowSuccess(false);
      convertLead.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Build checklist
  const hasStore = !!lead.prospect_tenant_id;
  const hasPhone = !!lead.page_phone;

  const checklist: ChecklistItem[] = [
    { label: "Lead information complete", status: "pass" },
    {
      label: "Store built",
      status: hasStore ? "pass" : "warn",
      detail: hasStore ? undefined : "No prospect store found",
    },
    {
      label: "Contact info available",
      status: hasPhone ? "pass" : "warn",
      detail: hasPhone ? undefined : "No phone number on file",
    },
    { label: "Will create merchant account", status: "pass" },
    { label: "Will create wallet", status: "pass" },
    { label: "Will set lead status to \"converted\"", status: "pass" },
  ];

  const tierConfig = LEAD_TIER_CONFIG[lead.tier];
  const platformConfig = PLATFORM_CONFIG[lead.platform];

  // Submit
  const handleConvert = () => {
    convertLead.mutate(
      { leadId: lead.id, data: { notes: notes || undefined } },
      {
        onSuccess: () => {
          setShowSuccess(true);
          setTimeout(() => {
            onClose();
          }, 1500);
        },
      }
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 24 }}
            transition={{ duration: 0.2, ease: EASE_CHROME }}
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="pointer-events-auto w-full max-w-lg rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <AnimatePresence mode="wait">
                {showSuccess ? (
                  /* ── Success State ───────────────────────────────── */
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.3, ease: EASE_CHROME }}
                    className="flex flex-col items-center justify-center py-16 px-6"
                  >
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.2, 1] }}
                      transition={{ duration: 0.5, times: [0, 0.6, 1] }}
                      className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4"
                    >
                      <Trophy className="w-8 h-8 text-emerald-500" />
                    </motion.div>
                    <motion.h3
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, duration: 0.3 }}
                      className="text-lg font-bold text-[var(--foreground)] mb-1"
                    >
                      Lead converted successfully!
                    </motion.h3>
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.35, duration: 0.3 }}
                      className="text-sm text-[var(--muted)]"
                    >
                      {lead.merchant_name} is now a merchant.
                    </motion.p>
                    {/* Decorative sparkle dots */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{ delay: 0.1, duration: 1.2, repeat: 1 }}
                      className="absolute inset-0 pointer-events-none overflow-hidden"
                    >
                      {[...Array(6)].map((_, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{
                            opacity: [0, 1, 0],
                            scale: [0, 1, 0],
                            x: [0, (i % 2 === 0 ? 1 : -1) * (30 + i * 15)],
                            y: [0, -(20 + i * 10)],
                          }}
                          transition={{ delay: 0.2 + i * 0.08, duration: 0.7 }}
                          className="absolute left-1/2 top-1/2 w-2 h-2 rounded-full"
                          style={{
                            backgroundColor: ["#34D399", "#F59E0B", "#3B82F6", "#EC4899", "#8B5CF6", "#06B6D4"][i],
                          }}
                        />
                      ))}
                    </motion.div>
                  </motion.div>
                ) : (
                  /* ── Main Content ────────────────────────────────── */
                  <motion.div
                    key="content"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                  >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)]">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                          <Trophy className="w-5 h-5 text-emerald-500" />
                        </div>
                        <h2 className="text-lg font-bold text-[var(--foreground)]">
                          Convert to Merchant
                        </h2>
                      </div>
                      <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Body */}
                    <div className="px-6 py-5 space-y-5">
                      {/* Lead Summary Card */}
                      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.02] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-bold text-[var(--foreground)] text-base truncate">
                              {lead.merchant_name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={{ backgroundColor: `${tierConfig.color}20`, color: tierConfig.color }}
                              >
                                {tierConfig.label}
                              </span>
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                                style={{ backgroundColor: `${platformConfig.color}15`, color: platformConfig.color }}
                              >
                                {platformConfig.label}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-2xl font-bold text-[var(--foreground)]">
                              {lead.lead_score}
                            </div>
                            <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider">
                              Score
                            </div>
                          </div>
                        </div>
                        {lead.estimated_daily_orders > 0 && (
                          <div className="mt-3 pt-3 border-t border-[var(--card-border)] flex items-center gap-4 text-xs text-[var(--muted)]">
                            <span>
                              ~<strong className="text-[var(--foreground)]">{lead.estimated_daily_orders}</strong> orders/day
                            </span>
                            <span>
                              ~<strong className="text-[var(--foreground)]">{lead.follower_count.toLocaleString()}</strong> followers
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Conversion Checklist */}
                      <div className="space-y-1.5">
                        {checklist.map((item, index) => (
                          <motion.div
                            key={item.label}
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{
                              delay: 0.1 + index * STAGGER_CHILDREN * 2,
                              duration: 0.25,
                              ease: EASE_CHROME,
                            }}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg"
                          >
                            {item.status === "pass" ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                            )}
                            <span
                              className={cn(
                                "text-sm",
                                item.status === "pass"
                                  ? "text-[var(--foreground)]"
                                  : "text-amber-600 dark:text-amber-400"
                              )}
                            >
                              {item.label}
                            </span>
                            {item.detail && (
                              <span className="text-[10px] text-[var(--muted)] ml-auto">
                                {item.detail}
                              </span>
                            )}
                          </motion.div>
                        ))}
                      </div>

                      {/* Store Status Info */}
                      <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-[var(--foreground)]/[0.03] border border-[var(--card-border)]">
                        <Store className="w-4 h-4 text-[var(--muted)] mt-0.5 shrink-0" />
                        <p className="text-xs text-[var(--muted)] leading-relaxed">
                          {hasStore
                            ? "The existing prospect store will become the merchant's live store."
                            : "A new store will be created from the lead's information."}
                        </p>
                      </div>

                      {/* Notes */}
                      <div>
                        <label className="block text-xs font-semibold text-[var(--muted)] uppercase tracking-wider mb-1.5">
                          Notes (optional)
                        </label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 rounded-xl border border-[var(--card-border)] bg-[var(--foreground)]/[0.02] text-[var(--foreground)] text-sm placeholder:text-[var(--muted)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 transition-shadow resize-none"
                          placeholder="Any notes about this conversion..."
                        />
                      </div>

                      {/* Error State */}
                      {convertLead.isError && (
                        <div className="px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 font-medium">
                          {convertLead.error?.message || "Failed to convert lead. Please try again."}
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--card-border)]">
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleConvert}
                        disabled={convertLead.isPending}
                        className={cn(
                          "flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all",
                          "bg-emerald-600 text-white hover:bg-emerald-700",
                          "disabled:opacity-40 disabled:cursor-not-allowed"
                        )}
                      >
                        {convertLead.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trophy className="w-4 h-4" />
                        )}
                        Convert Now
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
