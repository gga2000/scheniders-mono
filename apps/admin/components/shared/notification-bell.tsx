"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, Wallet, Building2, Clock, AlertTriangle } from "lucide-react";
import { EASE_CHROME } from "@/lib/animation-constants";
import { TopupRequestsSection, useTopupRequests } from "./topup-requests-section";
import { WhatsAppHealthAlert, WhatsAppPausedAlert, useWhatsAppHealth } from "./whatsapp-health-alert";
import { BillingCheckAlert, billingCheckCount, useBillingCheck } from "./billing-check-alert";
import { PrimeLinkRequestsSection, usePrimeLinkRequests } from "./prime-link-requests-section";
import { formatWhen } from "@/lib/format";
import { staffActionText } from "@/lib/staff-actions";
import { activityKind } from "@/lib/activity-kinds";
import { useRecentSteps, type RecentStep } from "@/hooks/use-recent-steps";

// Icon and tint per kind of step (lib/activity-kinds), keyed on the names the
// console writes; the words come from staffActionText, as on the Team page.
const FREE_TIME = new Set(["extend_trial", "extend_subscription", "convert_trial"]);
const STOPPED = new Set(["suspended", "cancelled", "limited"]);

function getActionConfig(action: string, details: Record<string, unknown> | null): { icon: React.ReactNode; color: string } {
  if (action === "status_change") {
    if (typeof details?.status === "string" && STOPPED.has(details.status)) {
      return { icon: <AlertTriangle className="w-3.5 h-3.5" />, color: "text-[var(--ink-red)]" };
    }
    if (details?.status === "active") return { icon: <Check className="w-3.5 h-3.5" />, color: "text-[var(--ink-green)]" };
  }
  if (FREE_TIME.has(action)) return { icon: <Clock className="w-3.5 h-3.5" />, color: "text-[var(--ink-amber)]" };
  switch (activityKind(action)) {
    case "money":
      return { icon: <Wallet className="w-3.5 h-3.5" />, color: "text-[var(--ink-green)]" };
    case "shop":
      return { icon: <Building2 className="w-3.5 h-3.5" />, color: "text-[var(--ink-blue)]" };
    case "notes":
      return { icon: <Building2 className="w-3.5 h-3.5" />, color: "text-foreground/70" };
    default:
      return { icon: <Bell className="w-3.5 h-3.5" />, color: "text-foreground/70" };
  }
}

const NO_NOTIFICATIONS: RecentStep[] = [];

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  // The bell reads the newest steps itself, so it is right on every page.
  const recent = useRecentSteps();
  const notifications = recent.data ?? NO_NOTIFICATIONS;
  const primeRequests = usePrimeLinkRequests();
  const openPrime = primeRequests.data ?? [];
  const openTopups = useTopupRequests().data ?? [];
  const whatsapp = useWhatsAppHealth().data;
  const interaktEmpty = whatsapp?.interaktEmpty === true;
  const pausedShops = whatsapp?.pausedShops ?? 0;
  const billingCheck = useBillingCheck().data;
  const billingMissed = billingCheckCount(billingCheck) > 0;
  // Open Prime and top-up requests always count: they wait on the team, not on a read mark.
  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length + openPrime.length + openTopups.length + (interaktEmpty ? 1 : 0) + (pausedShops > 0 ? 1 : 0) + (billingMissed ? 1 : 0);

  const markAllRead = useCallback(() => {
    setReadIds(new Set(notifications.map((n) => n.id)));
  }, [notifications]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button: an icon, so it says what it is and how many wait */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} new` : "Notifications"}
        aria-expanded={isOpen}
        className="relative p-2 rounded-xl text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-colors"
      >
        <Bell className="w-4.5 h-4.5" aria-hidden />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold tabular-nums text-white"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </motion.span>
        )}
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.2, ease: EASE_CHROME }}
            className="absolute right-0 top-full mt-2 w-[340px] bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-foreground/70 hover:text-foreground transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* A daily billing job missed shops: trial not paused or month not renewed */}
            {billingMissed && billingCheck && <BillingCheckAlert check={billingCheck} />}

            {/* Interakt wallet empty: every shop's WhatsApp is stopped */}
            {interaktEmpty && <WhatsAppHealthAlert since={whatsapp?.since ?? null} />}

            {/* Shops whose automatic WhatsApp is paused to protect the shared number */}
            {pausedShops > 0 && <WhatsAppPausedAlert count={pausedShops} onOpen={() => setIsOpen(false)} />}

            {/* Top-up receipts: shops waiting for our team to add their money */}
            <TopupRequestsSection requests={openTopups} />

            {/* Prime link requests: shops whose link waits on Prime or on us */}
            <PrimeLinkRequestsSection requests={openPrime} />

            {/* Notifications list */}
            <div className="max-h-[360px] overflow-y-auto">
              {recent.isError ? (
                <div role="alert" className="px-4 py-6 text-center text-sm text-foreground/70">
                  <p>Could not load the recent steps.</p>
                  <button
                    type="button"
                    onClick={() => void recent.refetch()}
                    disabled={recent.isFetching}
                    className="mt-2 text-xs font-semibold text-foreground underline underline-offset-2 disabled:opacity-50"
                  >
                    {recent.isFetching ? "Loading" : "Try again"}
                  </button>
                </div>
              ) : recent.isLoading ? (
                <div className="px-4 py-8 text-center text-sm text-foreground/70">Loading...</div>
              ) : notifications.length === 0 && openPrime.length === 0 && openTopups.length === 0 && !interaktEmpty && pausedShops === 0 && !billingMissed ? (
                <div className="px-4 py-8 text-center text-sm text-foreground/70">
                  No notifications yet
                </div>
              ) : (
                notifications.map((notif) => {
                  const config = getActionConfig(notif.action, notif.details);
                  const isRead = readIds.has(notif.id);

                  return (
                    <div
                      key={notif.id}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-[var(--card-border)] last:border-0 transition-colors ${
                        isRead ? "opacity-60" : "bg-foreground/[0.02]"
                      }`}
                    >
                      <span className={`mt-0.5 ${config.color}`}>{config.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">
                          {staffActionText(notif.action, notif.details)}
                        </p>
                        {notif.details && (
                          <p className="text-xs text-foreground/70 truncate mt-0.5">
                            {typeof notif.details === "object"
                              ? Object.values(notif.details).filter(Boolean).join(" · ")
                              : String(notif.details)}
                          </p>
                        )}
                        <p className="text-xs text-foreground/70 mt-1">
                          {formatWhen(notif.created_at)}
                        </p>
                      </div>
                      {!isRead && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
