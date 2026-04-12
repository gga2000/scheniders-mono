"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  BellRing,
  X,
  Clock,
  Eye,
  EyeOff,
  ShoppingCart,
  Package,
  AlertTriangle,
  TrendingUp,
  CalendarClock,
  Moon,
  CheckCheck,
  Settings,
  ExternalLink,
  Layers,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AlertType =
  | "stockout"
  | "low_stock"
  | "overstock"
  | "expiring"
  | "dead_stock"
  | "po_due";

interface InventoryAlert {
  id: string;
  tenant_id: string;
  product_id: string | null;
  alert_type: AlertType;
  message: string;
  is_read: boolean;
  is_dismissed: boolean;
  snoozed_until: string | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}

interface NotificationSettings {
  stockout: boolean;
  low_stock: boolean;
  overstock: boolean;
  expiring: boolean;
  dead_stock: boolean;
  po_due: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  stockout: true,
  low_stock: true,
  overstock: true,
  expiring: true,
  dead_stock: true,
  po_due: true,
};

// ---------------------------------------------------------------------------
// Alert type config
// ---------------------------------------------------------------------------

const ALERT_CONFIG: Record<
  AlertType,
  {
    icon: React.ElementType;
    color: string;
    bgColor: string;
    borderColor: string;
    label: string;
  }
> = {
  stockout: {
    icon: AlertTriangle,
    color: "text-red-500",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    borderColor: "border-red-500",
    label: "Stockout",
  },
  low_stock: {
    icon: TrendingUp,
    color: "text-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    borderColor: "border-amber-500",
    label: "Low Stock",
  },
  overstock: {
    icon: Layers,
    color: "text-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-500",
    label: "Overstock",
  },
  expiring: {
    icon: CalendarClock,
    color: "text-orange-500",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
    borderColor: "border-orange-500",
    label: "Expiring",
  },
  dead_stock: {
    icon: Moon,
    color: "text-gray-400",
    bgColor: "bg-gray-50 dark:bg-gray-800/30",
    borderColor: "border-gray-400",
    label: "Dead Stock",
  },
  po_due: {
    icon: Package,
    color: "text-indigo-500",
    bgColor: "bg-indigo-50 dark:bg-indigo-950/30",
    borderColor: "border-indigo-500",
    label: "PO Due",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function loadSettings(): NotificationSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem("notification-settings");
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: NotificationSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem("notification-settings", JSON.stringify(settings));
}

// ---------------------------------------------------------------------------
// Alert generation logic
// ---------------------------------------------------------------------------

async function generateAlerts(tenantId: string, settings: NotificationSettings) {
  const now = new Date().toISOString();
  const alertsToUpsert: {
    tenant_id: string;
    product_id: string | null;
    alert_type: AlertType;
    message: string;
    metadata_json: Record<string, unknown>;
  }[] = [];

  // Fetch products
  if (settings.stockout || settings.low_stock || settings.overstock) {
    const { data: products } = await supabase
      .from("products")
      .select("id, name, sku, stock_quantity, low_stock_threshold, cost, price")
      .eq("tenant_id", tenantId);

    if (products) {
      for (const p of products) {
        const threshold = p.low_stock_threshold || 5;

        if (settings.stockout && p.stock_quantity === 0) {
          alertsToUpsert.push({
            tenant_id: tenantId,
            product_id: p.id,
            alert_type: "stockout",
            message: `${p.name} (${p.sku}) is out of stock`,
            metadata_json: { product_name: p.name, sku: p.sku },
          });
        } else if (
          settings.low_stock &&
          p.stock_quantity > 0 &&
          p.stock_quantity <= threshold
        ) {
          alertsToUpsert.push({
            tenant_id: tenantId,
            product_id: p.id,
            alert_type: "low_stock",
            message: `${p.name} has only ${p.stock_quantity} units left (threshold: ${threshold})`,
            metadata_json: {
              product_name: p.name,
              sku: p.sku,
              stock_quantity: p.stock_quantity,
              threshold,
            },
          });
        }

        if (settings.overstock && p.stock_quantity > threshold * 5) {
          alertsToUpsert.push({
            tenant_id: tenantId,
            product_id: p.id,
            alert_type: "overstock",
            message: `${p.name} is overstocked with ${p.stock_quantity} units (5x threshold)`,
            metadata_json: {
              product_name: p.name,
              sku: p.sku,
              stock_quantity: p.stock_quantity,
            },
          });
        }
      }
    }
  }

  // Fetch expiring batches
  if (settings.expiring) {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const { data: batches } = await supabase
      .from("product_batches")
      .select("id, product_id, expiry_date, quantity, products!inner(name, sku, tenant_id)")
      .eq("status", "active")
      .eq("products.tenant_id", tenantId)
      .lte("expiry_date", thirtyDaysFromNow.toISOString())
      .gte("expiry_date", now);

    if (batches) {
      for (const b of batches as any[]) {
        const daysLeft = Math.ceil(
          (new Date(b.expiry_date).getTime() - Date.now()) / 86400000
        );
        alertsToUpsert.push({
          tenant_id: tenantId,
          product_id: b.product_id,
          alert_type: "expiring",
          message: `Batch of ${b.products.name} (${b.quantity} units) expires in ${daysLeft} days`,
          metadata_json: {
            product_name: b.products.name,
            sku: b.products.sku,
            batch_id: b.id,
            expiry_date: b.expiry_date,
            days_left: daysLeft,
          },
        });
      }
    }
  }

  // Fetch PO due
  if (settings.po_due) {
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const { data: orders } = await supabase
      .from("purchase_orders")
      .select("id, expected_date, status")
      .eq("tenant_id", tenantId)
      .in("status", ["confirmed", "partial"])
      .lte("expected_date", threeDaysFromNow.toISOString())
      .gte("expected_date", now);

    if (orders) {
      for (const po of orders) {
        const daysLeft = Math.ceil(
          (new Date(po.expected_date).getTime() - Date.now()) / 86400000
        );
        alertsToUpsert.push({
          tenant_id: tenantId,
          product_id: null,
          alert_type: "po_due",
          message: `Purchase order due in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} (${po.status})`,
          metadata_json: { po_id: po.id, expected_date: po.expected_date },
        });
      }
    }
  }

  // Upsert alerts — avoid duplicates by checking existing non-dismissed alerts
  for (const alert of alertsToUpsert) {
    const query = supabase
      .from("inventory_alerts")
      .select("id")
      .eq("tenant_id", alert.tenant_id)
      .eq("alert_type", alert.alert_type)
      .eq("is_dismissed", false);

    if (alert.product_id) {
      query.eq("product_id", alert.product_id);
    } else {
      query.is("product_id", null);
      // For PO alerts, match by po_id in metadata
      if (alert.alert_type === "po_due" && alert.metadata_json?.po_id) {
        query.contains("metadata_json", { po_id: alert.metadata_json.po_id });
      }
    }

    const { data: existing } = await query.limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from("inventory_alerts").insert({
        ...alert,
        is_read: false,
        is_dismissed: false,
        snoozed_until: null,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Fetch alerts
// ---------------------------------------------------------------------------

async function fetchAlerts(
  tenantId: string,
  settings: NotificationSettings
): Promise<InventoryAlert[]> {
  const now = new Date().toISOString();

  const enabledTypes = (Object.keys(settings) as AlertType[]).filter(
    (k) => settings[k]
  );

  if (enabledTypes.length === 0) return [];

  const { data, error } = await supabase
    .from("inventory_alerts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_dismissed", false)
    .in("alert_type", enabledTypes)
    .or(`snoozed_until.is.null,snoozed_until.lte.${now}`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data as InventoryAlert[]) || [];
}

// ---------------------------------------------------------------------------
// NotificationBell
// ---------------------------------------------------------------------------

export function NotificationBell() {
  const { tenantId } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [settings] = useState<NotificationSettings>(loadSettings);
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const [pulse, setPulse] = useState(false);

  const { data: alerts = [] } = useQuery({
    queryKey: ["inventory-alerts", tenantId],
    queryFn: () => fetchAlerts(tenantId!, settings),
    enabled: !!tenantId,
    refetchInterval: 60000,
  });

  const unreadCount = alerts.filter((a) => !a.is_read).length;

  // Pulse when new alerts arrive
  useEffect(() => {
    if (unreadCount > prevCountRef.current && prevCountRef.current >= 0) {
      setPulse(true);
      const timer = setTimeout(() => setPulse(false), 2000);
      prevCountRef.current = unreadCount;
      return () => clearTimeout(timer);
    }
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        bellRef.current &&
        !bellRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={bellRef}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "relative p-2 rounded-xl transition-colors",
          "hover:bg-[var(--background)]",
          open && "bg-[var(--background)]"
        )}
        aria-label={t("products.alerts.title") || "Notifications"}
      >
        {open ? (
          <BellRing className="w-5 h-5 text-[var(--foreground)]" />
        ) : (
          <Bell className="w-5 h-5 text-[var(--foreground)] opacity-70" />
        )}

        {unreadCount > 0 && (
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center",
              "rounded-full bg-red-500 text-white text-[10px] font-bold px-1",
              "border-2 border-[var(--card-bg)]",
              pulse && "animate-pulse"
            )}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <div ref={panelRef}>
            <NotificationPanel
              alerts={alerts}
              onClose={() => setOpen(false)}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotificationPanel
// ---------------------------------------------------------------------------

interface NotificationPanelProps {
  alerts?: InventoryAlert[];
  onClose?: () => void;
}

export function NotificationPanel({ alerts: propAlerts, onClose }: NotificationPanelProps) {
  const { tenantId } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<NotificationSettings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [generatingAlerts, setGeneratingAlerts] = useState(false);

  // Fetch alerts if not passed as prop
  const { data: fetchedAlerts = [], isLoading } = useQuery({
    queryKey: ["inventory-alerts", tenantId],
    queryFn: () => fetchAlerts(tenantId!, settings),
    enabled: !!tenantId && !propAlerts,
    refetchInterval: 60000,
  });

  const alerts = propAlerts ?? fetchedAlerts;
  const unreadCount = alerts.filter((a) => !a.is_read).length;

  // Generate alerts on mount
  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    (async () => {
      setGeneratingAlerts(true);
      try {
        await generateAlerts(tenantId, settings);
        if (!cancelled) {
          queryClient.invalidateQueries({ queryKey: ["inventory-alerts", tenantId] });
        }
      } catch {
        // Silently fail alert generation
      } finally {
        if (!cancelled) setGeneratingAlerts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, settings, queryClient]);

  // Mutations
  const markReadMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("inventory_alerts")
        .update({ is_read: true })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-alerts", tenantId] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unreadIds = alerts.filter((a) => !a.is_read).map((a) => a.id);
      if (unreadIds.length === 0) return;
      const { error } = await supabase
        .from("inventory_alerts")
        .update({ is_read: true })
        .in("id", unreadIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-alerts", tenantId] });
      toast.success(t("products.alerts.allRead") || "All notifications marked as read");
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const { error } = await supabase
        .from("inventory_alerts")
        .update({ snoozed_until: snoozedUntil })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-alerts", tenantId] });
      toast.success(t("products.alerts.snoozed") || "Alert snoozed for 24 hours");
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("inventory_alerts")
        .update({ is_dismissed: true })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-alerts", tenantId] });
    },
  });

  // Group alerts by type
  const groupedAlerts = useMemo(() => {
    const groups: Record<AlertType, InventoryAlert[]> = {
      stockout: [],
      low_stock: [],
      overstock: [],
      expiring: [],
      dead_stock: [],
      po_due: [],
    };
    for (const alert of alerts) {
      groups[alert.alert_type]?.push(alert);
    }
    // Return only non-empty groups in priority order
    const order: AlertType[] = [
      "stockout",
      "low_stock",
      "expiring",
      "po_due",
      "overstock",
      "dead_stock",
    ];
    return order
      .filter((type) => groups[type].length > 0)
      .map((type) => ({ type, alerts: groups[type] }));
  }, [alerts]);

  const handleAlertClick = useCallback(
    (alert: InventoryAlert) => {
      if (!alert.is_read) {
        markReadMutation.mutate(alert.id);
      }
    },
    [markReadMutation]
  );

  const handleSettingsToggle = useCallback(
    (type: AlertType) => {
      setSettings((prev) => {
        const next = { ...prev, [type]: !prev[type] };
        saveSettings(next);
        return next;
      });
    },
    []
  );

  // Action buttons per alert type
  const renderActionButton = (alert: InventoryAlert) => {
    const btnClass =
      "px-2 py-1 text-[11px] font-medium rounded-lg transition-colors bg-[var(--background)] hover:bg-[var(--card-border)] text-[var(--foreground)]";

    switch (alert.alert_type) {
      case "stockout":
        return (
          <button className={btnClass} onClick={(e) => e.stopPropagation()}>
            <ShoppingCart className="w-3 h-3 inline mr-1" />
            {t("products.alerts.reorder") || "Reorder"}
          </button>
        );
      case "low_stock":
        return (
          <button className={btnClass} onClick={(e) => e.stopPropagation()}>
            <Eye className="w-3 h-3 inline mr-1" />
            {t("products.alerts.view") || "View"}
          </button>
        );
      case "expiring":
        return (
          <button className={btnClass} onClick={(e) => e.stopPropagation()}>
            <Eye className="w-3 h-3 inline mr-1" />
            {t("products.alerts.viewBatches") || "View Batches"}
          </button>
        );
      case "po_due":
        return (
          <button className={btnClass} onClick={(e) => e.stopPropagation()}>
            <Package className="w-3 h-3 inline mr-1" />
            {t("products.alerts.viewPO") || "View PO"}
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={cn(
        "absolute right-0 top-full mt-2 z-50",
        "w-[380px] max-w-sm max-h-[70vh]",
        "bg-[var(--card-bg)] border border-[var(--card-border)]",
        "rounded-2xl shadow-2xl overflow-hidden",
        "flex flex-col"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">
          {t("products.alerts.title") || "Notifications"}
          {unreadCount > 0 && (
            <span className="ml-1.5 text-xs font-normal opacity-60">
              ({unreadCount} {t("products.alerts.unread") || "unread"})
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="p-1.5 rounded-lg text-xs text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
              title={t("products.alerts.markAllRead") || "Mark all read"}
            >
              <CheckCheck className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={cn(
              "p-1.5 rounded-lg transition-colors",
              showSettings
                ? "bg-[var(--background)] text-[var(--foreground)]"
                : "text-[var(--foreground)] opacity-60 hover:opacity-100 hover:bg-[var(--background)]"
            )}
            title={t("products.alerts.settings") || "Settings"}
          >
            <Settings className="w-4 h-4" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[var(--foreground)] opacity-60 hover:opacity-100 hover:bg-[var(--background)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b border-[var(--card-border)]"
          >
            <div className="px-4 py-3 space-y-2">
              <p className="text-xs font-medium text-[var(--foreground)] opacity-60 uppercase tracking-wider">
                {t("products.alerts.alertTypes") || "Alert Types"}
              </p>
              {(Object.keys(ALERT_CONFIG) as AlertType[]).map((type) => {
                const config = ALERT_CONFIG[type];
                const Icon = config.icon;
                return (
                  <button
                    key={type}
                    onClick={() => handleSettingsToggle(type)}
                    className={cn(
                      "flex items-center gap-3 w-full px-3 py-2 rounded-xl transition-colors",
                      "hover:bg-[var(--background)]"
                    )}
                  >
                    <Icon className={cn("w-4 h-4", config.color)} />
                    <span className="flex-1 text-left text-sm text-[var(--foreground)]">
                      {config.label}
                    </span>
                    <div
                      className={cn(
                        "w-8 h-5 rounded-full transition-colors relative",
                        settings[type]
                          ? "bg-blue-500"
                          : "bg-gray-300 dark:bg-gray-600"
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform",
                          settings[type] ? "translate-x-3.5" : "translate-x-0.5"
                        )}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alert List */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {isLoading && !propAlerts ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <Bell className="w-10 h-10 text-[var(--foreground)] opacity-20 mb-3" />
            <p className="text-sm text-[var(--foreground)] opacity-50">
              {t("products.alerts.empty") || "No notifications"}
            </p>
            <p className="text-xs text-[var(--foreground)] opacity-30 mt-1">
              {t("products.alerts.emptyDesc") || "You're all caught up!"}
            </p>
          </div>
        ) : (
          <div className="py-1">
            {groupedAlerts.map(({ type, alerts: groupAlerts }) => {
              const config = ALERT_CONFIG[type];
              const Icon = config.icon;

              return (
                <div key={type}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-4 py-2 sticky top-0 bg-[var(--card-bg)]/95 backdrop-blur-sm z-10">
                    <Icon className={cn("w-3.5 h-3.5", config.color)} />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground)] opacity-50">
                      {config.label}
                    </span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--background)] text-[var(--foreground)] opacity-50">
                      {groupAlerts.length}
                    </span>
                  </div>

                  {/* Alert items */}
                  {groupAlerts.map((alert) => (
                    <motion.div
                      key={alert.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      onClick={() => handleAlertClick(alert)}
                      className={cn(
                        "relative px-4 py-3 cursor-pointer transition-colors",
                        "hover:bg-[var(--background)]",
                        "border-l-2",
                        alert.is_read
                          ? "border-l-transparent opacity-60"
                          : `border-l-blue-500`
                      )}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div
                          className={cn(
                            "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                            config.bgColor
                          )}
                        >
                          <Icon className={cn("w-4 h-4", config.color)} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <p
                            className={cn(
                              "text-sm leading-snug",
                              alert.is_read
                                ? "text-[var(--foreground)] opacity-70"
                                : "text-[var(--foreground)] font-medium"
                            )}
                          >
                            {alert.message}
                          </p>
                          <p className="text-[11px] text-[var(--foreground)] opacity-40 mt-1">
                            {relativeTime(alert.created_at)}
                          </p>

                          {/* Action buttons */}
                          <div className="flex items-center gap-1.5 mt-2">
                            {renderActionButton(alert)}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                snoozeMutation.mutate(alert.id);
                              }}
                              disabled={snoozeMutation.isPending}
                              className="px-2 py-1 text-[11px] font-medium rounded-lg transition-colors bg-[var(--background)] hover:bg-[var(--card-border)] text-[var(--foreground)] opacity-60 hover:opacity-100"
                            >
                              <Clock className="w-3 h-3 inline mr-1" />
                              {t("products.alerts.snooze") || "Snooze 24h"}
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissMutation.mutate(alert.id);
                              }}
                              disabled={dismissMutation.isPending}
                              className="px-2 py-1 text-[11px] font-medium rounded-lg transition-colors bg-[var(--background)] hover:bg-[var(--card-border)] text-[var(--foreground)] opacity-60 hover:opacity-100"
                            >
                              <EyeOff className="w-3 h-3 inline mr-1" />
                              {t("products.alerts.dismiss") || "Dismiss"}
                            </button>
                          </div>
                        </div>

                        {/* Unread dot */}
                        {!alert.is_read && (
                          <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-2" />
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {alerts.length > 0 && (
        <div className="border-t border-[var(--card-border)] px-4 py-2.5">
          <button className="flex items-center justify-center gap-1.5 w-full text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/20">
            <ExternalLink className="w-3.5 h-3.5" />
            {t("products.alerts.viewAll") || "View All Notifications"}
          </button>
        </div>
      )}
    </motion.div>
  );
}
