"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, Wallet, Building2, Clock, AlertTriangle, Truck, Loader2 } from "lucide-react";
import { EASE_CHROME } from "@/lib/animation-constants";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { adminFetch } from "@/lib/admin-fetch";

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

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const primeRequestsSchema = z.object({
  requests: z.array(
    z.object({
      id: z.string(),
      tenant_id: z.string(),
      prime_phone: z.string(),
      created_at: z.string(),
      tenants: z.object({ business_name: z.string(), slug: z.string() }).nullable(),
    }),
  ),
});
type PrimeLinkRequest = z.infer<typeof primeRequestsSchema>["requests"][number];

const PRIME_REQUESTS_KEY = ["admin", "prime-link-requests"] as const;

/** Shops waiting for our team to link their Prime account; refreshed every minute. */
function usePrimeLinkRequests() {
  return useQuery({
    queryKey: PRIME_REQUESTS_KEY,
    queryFn: async (): Promise<PrimeLinkRequest[]> => {
      const res = await adminFetch("/api/prime-link-requests");
      if (!res.ok) throw new Error(`Prime link requests failed: ${res.status}`);
      return primeRequestsSchema.parse(await res.json()).requests;
    },
    refetchInterval: 60_000,
  });
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
  const markLinked = useMutation({
    mutationFn: async (id: string) => {
      const res = await adminFetch(`/api/prime-link-requests/${id}`, { method: "POST" });
      if (!res.ok && res.status !== 409) throw new Error(`Marking linked failed: ${res.status}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PRIME_REQUESTS_KEY }),
  });
  // Open Prime requests always count: they wait on the team, not on a read mark.
  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length + openPrime.length;

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
            className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center"
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
                  className="text-[10px] text-foreground/40 hover:text-foreground transition-colors"
                >
                  Mark all read
                </button>
              )}
            </div>

            {/* Prime link requests: shops waiting for our team */}
            {openPrime.length > 0 && (
              <div className="border-b border-[var(--card-border)]" data-testid="prime-link-requests">
                <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-wide text-foreground/40">Prime link requests</p>
                {openPrime.map((req) => (
                  <div key={req.id} className="flex items-start gap-3 px-4 py-3">
                    <span className="mt-0.5 text-[#315EA8]"><Truck className="w-3.5 h-3.5" /></span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{req.tenants?.business_name ?? req.tenant_id}</p>
                      <p className="text-[11px] text-foreground/50 tabular-nums mt-0.5">Prime account {req.prime_phone}</p>
                      <p className="text-[10px] text-foreground/30 mt-1">{timeAgo(req.created_at)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => markLinked.mutate(req.id)}
                      disabled={markLinked.isPending}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-foreground px-2.5 py-1.5 text-[11px] font-semibold text-background hover:opacity-90 disabled:opacity-50"
                    >
                      {markLinked.isPending && markLinked.variables === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Linked
                    </button>
                  </div>
                ))}
                {markLinked.isError && <p className="px-4 pb-3 text-[11px] text-red-600">Couldn&apos;t mark it linked. Try again.</p>}
              </div>
            )}

            {/* Notifications list */}
            <div className="max-h-[360px] overflow-y-auto">
              {notifications.length === 0 && openPrime.length === 0 ? (
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
                          <p className="text-[11px] text-foreground/50 truncate mt-0.5">
                            {typeof notif.details === "object"
                              ? Object.values(notif.details).filter(Boolean).join(" · ")
                              : String(notif.details)}
                          </p>
                        )}
                        <p className="text-[10px] text-foreground/30 mt-1">
                          {timeAgo(notif.created_at)}
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
