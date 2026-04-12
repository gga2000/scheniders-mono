"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardList,
  Plus,
  Search,
  Package,
  Calendar,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn, formatIQD } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type POStatus =
  | "draft"
  | "sent"
  | "confirmed"
  | "partial"
  | "received"
  | "cancelled";

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_name: string;
  status: POStatus;
  total_cost: number;
  expected_date: string | null;
  created_at: string;
  item_count: number;
}

interface POListProps {
  onSelectPO: (poId: string) => void;
  onCreatePO: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_TABS: { key: POStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "confirmed", label: "Confirmed" },
  { key: "partial", label: "Partial" },
  { key: "received", label: "Received" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_COLORS: Record<POStatus, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  confirmed:
    "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  partial:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  received:
    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const STATUS_DOT: Record<POStatus, string> = {
  draft: "bg-gray-400",
  sent: "bg-blue-500",
  confirmed: "bg-indigo-500",
  partial: "bg-amber-500",
  received: "bg-green-500",
  cancelled: "bg-red-500",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function POList({ onSelectPO, onCreatePO }: POListProps) {
  const { tenantId } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<POStatus | "all">("all");
  const [search, setSearch] = useState("");

  // Fetch POs with item count
  const { data: purchaseOrders = [], isLoading } = useQuery({
    queryKey: ["purchase-orders", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, po_number, supplier_name, status, total_cost, expected_date, created_at, purchase_order_items(id)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((po: any) => ({
        id: po.id,
        po_number: po.po_number,
        supplier_name: po.supplier_name,
        status: po.status as POStatus,
        total_cost: po.total_cost ?? 0,
        expected_date: po.expected_date,
        created_at: po.created_at,
        item_count: Array.isArray(po.purchase_order_items)
          ? po.purchase_order_items.length
          : 0,
      }));
    },
    enabled: !!tenantId,
  });

  // Filter
  const filtered = useMemo(() => {
    let list = purchaseOrders;
    if (activeTab !== "all") {
      list = list.filter((po) => po.status === activeTab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (po) =>
          po.po_number.toLowerCase().includes(q) ||
          po.supplier_name.toLowerCase().includes(q)
      );
    }
    return list;
  }, [purchaseOrders, activeTab, search]);

  // Counts per tab
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: purchaseOrders.length };
    for (const po of purchaseOrders) {
      c[po.status] = (c[po.status] || 0) + 1;
    }
    return c;
  }, [purchaseOrders]);

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
            <ClipboardList className="w-6 h-6 text-indigo-500" />
            {t("products.po.title") || "Purchase Orders"}
          </h2>
          <p className="text-muted text-sm mt-1">
            {t("products.po.subtitle") ||
              "Manage supplier orders and stock receiving"}
          </p>
        </div>
        <button
          onClick={onCreatePO}
          className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-xl font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          {t("products.po.new") || "New PO"}
        </button>
      </div>

      {/* Search */}
      <div className="relative w-full md:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
        <input
          type="text"
          placeholder={
            t("products.po.searchPlaceholder") ||
            "Search PO number or supplier..."
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors",
              activeTab === tab.key
                ? "bg-foreground text-background"
                : "bg-[var(--card-bg)] text-muted hover:text-foreground border border-[var(--card-border)]"
            )}
          >
            {tab.label}
            {(counts[tab.key] ?? 0) > 0 && (
              <span className="ml-1.5 text-xs opacity-70">
                ({counts[tab.key]})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="py-16 text-center text-muted">
          <div className="inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-sm">
            {t("products.po.loading") || "Loading purchase orders..."}
          </p>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filtered.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-12 text-center"
        >
          <Inbox className="h-12 w-12 text-muted mx-auto mb-4" />
          <p className="text-lg font-medium text-foreground">
            {activeTab === "all"
              ? t("products.po.emptyAll") || "No purchase orders yet"
              : t("products.po.emptyFiltered") ||
                `No ${activeTab} purchase orders`}
          </p>
          <p className="text-sm text-muted mt-1">
            {t("products.po.emptyHint") ||
              "Create your first purchase order to get started."}
          </p>
          {activeTab === "all" && (
            <button
              onClick={onCreatePO}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-xl font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              {t("products.po.new") || "New PO"}
            </button>
          )}
        </motion.div>
      )}

      {/* Table */}
      {!isLoading && filtered.length > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
          {/* Desktop header */}
          <div className="hidden md:grid grid-cols-[1fr_1fr_auto_auto_auto_auto_auto] gap-4 px-5 py-3 border-b border-[var(--card-border)] text-xs font-semibold text-muted uppercase tracking-wider">
            <span>{t("products.po.colPO") || "PO Number"}</span>
            <span>{t("products.po.colSupplier") || "Supplier"}</span>
            <span>{t("products.po.colStatus") || "Status"}</span>
            <span className="text-center">
              {t("products.po.colItems") || "Items"}
            </span>
            <span className="text-right">
              {t("products.po.colTotal") || "Total Cost"}
            </span>
            <span>{t("products.po.colExpected") || "Expected"}</span>
            <span>{t("products.po.colCreated") || "Created"}</span>
          </div>

          <AnimatePresence mode="popLayout">
            {filtered.map((po, idx) => (
              <motion.div
                key={po.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ delay: idx * 0.02 }}
                onClick={() => onSelectPO(po.id)}
                className={cn(
                  "grid grid-cols-1 md:grid-cols-[1fr_1fr_auto_auto_auto_auto_auto] gap-2 md:gap-4 px-5 py-4 cursor-pointer hover:bg-[var(--background)] transition-colors items-center",
                  idx < filtered.length - 1 &&
                    "border-b border-[var(--card-border)]"
                )}
              >
                {/* PO Number */}
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {po.po_number}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted md:hidden" />
                </div>

                {/* Supplier */}
                <span className="text-sm text-muted truncate">
                  {po.supplier_name}
                </span>

                {/* Status badge */}
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium w-fit",
                    STATUS_COLORS[po.status]
                  )}
                >
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      STATUS_DOT[po.status]
                    )}
                  />
                  {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                </span>

                {/* Items */}
                <span className="text-sm text-muted text-center flex items-center gap-1 justify-center md:justify-start">
                  <Package className="w-3.5 h-3.5 md:hidden" />
                  {po.item_count}
                </span>

                {/* Total */}
                <span className="text-sm font-medium text-foreground text-right">
                  {formatIQD(po.total_cost)}
                </span>

                {/* Expected Date */}
                <span className="text-sm text-muted flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 md:hidden" />
                  {formatDate(po.expected_date)}
                </span>

                {/* Created Date */}
                <span className="text-xs text-muted">
                  {formatDate(po.created_at)}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
