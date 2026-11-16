"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, Wallet, Building2, Clock, AlertTriangle } from "lucide-react";
import { EASE_CHROME } from "@/lib/animation-constants";
import { useQueryClient } from "@tanstack/react-query";
import { TopupRequestsSection, useTopupRequests } from "./topup-requests-section";
import { WhatsAppHealthAlert, WhatsAppPausedAlert, useWhatsAppHealth } from "./whatsapp-health-alert";
import { BillingCheckAlert, billingCheckCount, useBillingCheck } from "./billing-check-alert";
import { PrimeLinkRequestsSection, usePrimeLinkRequests } from "./prime-link-requests-section";
import { formatWhen } from "@/lib/format";

interface Notification {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  tenant_id: string | null;
  created_at: string;
}

const ACTION_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  top_up_wallet: { icon: <Wallet className="w-3.5 h-3.5" />, label: "Wallet Top-Up", color: "text-green-600" },
  change_plan: { icon: <Building2 className="w-3.5 h-3.5" />, label: "Plan Changed", color: "text-blue-600" },
  extend_trial: { icon: <Clock className="w-3.5 h-3.5" />, label: "Trial Extended", color: "text-amber-600" },
  suspend_tenant: { icon: <AlertTriangle className="w-3.5 h-3.5" />, label: "Tenant Suspended", color: "text-red-600" },
  reactivate_tenant: { icon: <Check className="w-3.5 h-3.5" />, label: "Tenant Reactivated", color: "text-green-600" },
  add_note: { icon: <Building2 className="w-3.5 h-3.5" />, label: "Note Added", color: "text-foreground/60" },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] || {
    icon: <Bell className="w-3.5 h-3.5" />,
    label: action.replace(/_/g, " "),
    color: "text-foreground/60",
  };
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Read notifications from the dashboard v2 cache
  useEffect(() => {
    const cache = queryClient.getQueryData<{ recentActivity?: Notification[] }>(["admin", "dashboard-v2"]);
    if (cache?.recentActivity) {
      setNotifications(cache.recentActivity);
    }

    const unsub = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.query.queryKey[0] === "admin" && event.query.queryKey[1] === "dashboard-v2") {
        const data = event.query.state.data as { recentActivity?: Notification[] } | undefined;
        if (data?.recentActivity) {
          setNotifications(data.recentActivity);
        }
      }
    });

    return unsub;
  }, [queryClient]);
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
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="relative p-2 rounded-xl text-foreground/60 hover:text-foreground hover:bg-foreground/5 transition-colors"
      >
        <Bell className="w-4.5 h-4.5" />
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold tabular-nums text-white"
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
                  className="text-xs text-foreground/40 hover:text-foreground transition-colors"
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
              {notifications.length === 0 && openPrime.length === 0 && openTopups.length === 0 && !interaktEmpty && pausedShops === 0 && !billingMissed ? (
                <div className="px-4 py-8 text-center text-sm text-foreground/40">
                  No notifications yet
                </div>
              ) : (
                notifications.map((notif) => {
                  const config = getActionConfig(notif.action);
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
                          {config.label}
                        </p>
                        {notif.details && (
                          <p className="text-xs text-foreground/50 truncate mt-0.5">
                            {typeof notif.details === "object"
                              ? Object.values(notif.details).filter(Boolean).join(" · ")
                              : String(notif.details)}
                          </p>
                        )}
                        <p className="text-xs text-foreground/30 mt-1">
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
