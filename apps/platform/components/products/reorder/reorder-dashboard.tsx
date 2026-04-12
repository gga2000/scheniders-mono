"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package,
  Truck,
  AlertTriangle,
  Download,
  FileText,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  ShoppingCart,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Supplier {
  supplier_name: string;
  supplier_contact: string;
  supplier_email: string;
  lead_time_days: number | null;
  minimum_order_quantity: number | null;
  unit_cost: number | null;
  is_primary: boolean;
}

interface ReorderProduct {
  id: string;
  name: string;
  sku: string;
  stock_quantity: number;
  low_stock_threshold: number;
  reorder_point: number;
  cost: number;
  price: number;
  product_type: string;
  suppliers: Supplier[];
}

interface SalesData {
  product_id: string;
  total_sold: number;
}

interface ReorderItem {
  product: ReorderProduct;
  primarySupplier: Supplier | null;
  dailySalesRate: number;
  daysUntilStockout: number | null;
  suggestedQuantity: number;
  unitCost: number;
  leadTimeDays: number;
  urgency: "red" | "yellow" | "green";
}

interface SupplierGroup {
  supplierName: string;
  supplierEmail: string;
  supplierContact: string;
  items: ReorderItem[];
  totalCost: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUrgency(
  daysUntilStockout: number | null,
  leadTimeDays: number
): "red" | "yellow" | "green" {
  if (daysUntilStockout === null) return "green";
  if (daysUntilStockout < leadTimeDays) return "red";
  if (daysUntilStockout < leadTimeDays * 2) return "yellow";
  return "green";
}

function calcSuggestedQty(
  leadTimeDays: number,
  dailySalesRate: number,
  lowStockThreshold: number,
  currentStock: number,
  moq: number
): number {
  const raw =
    leadTimeDays * dailySalesRate * 1.5 + (lowStockThreshold - currentStock);
  const needed = Math.max(0, Math.ceil(raw));
  if (moq <= 1) return needed;
  return Math.ceil(needed / moq) * moq;
}

const URGENCY_CONFIG = {
  red: {
    dot: "bg-rose-500",
    bg: "bg-rose-50 dark:bg-rose-950/20",
    text: "text-rose-700 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-800/40",
    label: "Critical",
  },
  yellow: {
    dot: "bg-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/20",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800/40",
    label: "Warning",
  },
  green: {
    dot: "bg-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    text: "text-emerald-700 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800/40",
    label: "OK",
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReorderDashboard() {
  const { t } = useLanguage();
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [editedQuantities, setEditedQuantities] = useState<
    Record<string, number>
  >({});
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(
    new Set(["__all__"])
  );
  const [generatingPO, setGeneratingPO] = useState<Set<string>>(new Set());

  // ── Fetch products at or below reorder point ──
  const {
    data: products,
    isLoading: productsLoading,
    error: productsError,
  } = useQuery({
    queryKey: ["reorder-products", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, sku, stock_quantity, low_stock_threshold, reorder_point, cost, price, product_type, suppliers"
        )
        .eq("tenant_id", tenantId)
        .or("is_archived.is.null,is_archived.eq.false");

      if (error) throw error;
      return (data ?? []) as ReorderProduct[];
    },
    enabled: !!tenantId,
  });

  // ── Fetch 30-day sales data from inventory_history ──
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["reorder-sales", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from("inventory_history")
        .select("product_id, quantity_change")
        .eq("change_type", "sold")
        .eq("tenant_id", tenantId)
        .gte("created_at", thirtyDaysAgo.toISOString());

      if (error) throw error;

      // Aggregate by product_id
      const map = new Map<string, number>();
      for (const row of data ?? []) {
        const pid = row.product_id;
        const qty = Math.abs(row.quantity_change);
        map.set(pid, (map.get(pid) ?? 0) + qty);
      }
      return Array.from(map.entries()).map(([product_id, total_sold]) => ({
        product_id,
        total_sold,
      })) as SalesData[];
    },
    enabled: !!tenantId,
  });

  // ── Build reorder items grouped by supplier ──
  const { supplierGroups, totalReorderCount } = useMemo(() => {
    if (!products || !salesData) return { supplierGroups: [], totalReorderCount: 0 };

    const salesMap = new Map<string, number>();
    for (const s of salesData) {
      salesMap.set(s.product_id, s.total_sold);
    }

    const items: ReorderItem[] = [];

    for (const product of products) {
      const totalSold = salesMap.get(product.id) ?? 0;
      const dailySalesRate = totalSold / 30;

      const suppliers: Supplier[] = Array.isArray(product.suppliers)
        ? product.suppliers
        : [];
      const primarySupplier =
        suppliers.find((s) => s.is_primary) ?? suppliers[0] ?? null;

      const leadTimeDays = primarySupplier?.lead_time_days ?? 7;
      const moq = primarySupplier?.minimum_order_quantity ?? 1;
      const unitCost = primarySupplier?.unit_cost ?? product.cost ?? 0;

      const daysUntilStockout =
        dailySalesRate > 0
          ? Math.round(product.stock_quantity / dailySalesRate)
          : null;

      // Only include if stock <= reorder_point OR days_until_stockout < lead_time
      const belowReorder =
        product.stock_quantity <= (product.reorder_point ?? product.low_stock_threshold ?? 5);
      const supplyAtRisk =
        daysUntilStockout !== null && daysUntilStockout < leadTimeDays;

      if (!belowReorder && !supplyAtRisk) continue;
      if (dismissedIds.has(product.id)) continue;

      const suggestedQuantity = calcSuggestedQty(
        leadTimeDays,
        dailySalesRate,
        product.low_stock_threshold ?? 5,
        product.stock_quantity,
        moq
      );

      items.push({
        product,
        primarySupplier,
        dailySalesRate,
        daysUntilStockout,
        suggestedQuantity,
        unitCost,
        leadTimeDays,
        urgency: getUrgency(daysUntilStockout, leadTimeDays),
      });
    }

    // Group by supplier
    const groupMap = new Map<string, SupplierGroup>();
    const noSupplierKey = "__no_supplier__";

    for (const item of items) {
      const key = item.primarySupplier?.supplier_name || noSupplierKey;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          supplierName:
            key === noSupplierKey
              ? (t("products.reorder.noSupplier") || "No Supplier Assigned")
              : key,
          supplierEmail: item.primarySupplier?.supplier_email ?? "",
          supplierContact: item.primarySupplier?.supplier_contact ?? "",
          items: [],
          totalCost: 0,
        });
      }
      const group = groupMap.get(key)!;
      const qty = editedQuantities[item.product.id] ?? item.suggestedQuantity;
      group.items.push(item);
      group.totalCost += qty * item.unitCost;
    }

    // Sort: groups with critical items first
    const groups = Array.from(groupMap.values()).sort((a, b) => {
      const aHasCritical = a.items.some((i) => i.urgency === "red");
      const bHasCritical = b.items.some((i) => i.urgency === "red");
      if (aHasCritical && !bHasCritical) return -1;
      if (!aHasCritical && bHasCritical) return 1;
      return b.items.length - a.items.length;
    });

    // Sort items within each group by urgency
    const urgencyOrder = { red: 0, yellow: 1, green: 2 };
    for (const group of groups) {
      group.items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
    }

    return {
      supplierGroups: groups,
      totalReorderCount: items.length,
    };
  }, [products, salesData, dismissedIds, editedQuantities, t]);

  // ── Generate PO number ──
  const generatePONumber = useCallback(async (): Promise<string> => {
    const year = new Date().getFullYear();
    const { data } = await supabase
      .from("purchase_orders")
      .select("po_number")
      .eq("tenant_id", tenantId!)
      .like("po_number", `PO-${year}-%`)
      .order("po_number", { ascending: false })
      .limit(1);

    let seq = 1;
    if (data && data.length > 0) {
      const last = data[0].po_number;
      const parts = last.split("-");
      seq = (parseInt(parts[2], 10) || 0) + 1;
    }
    return `PO-${year}-${String(seq).padStart(3, "0")}`;
  }, [tenantId]);

  // ── Generate PO mutation ──
  const generatePOMutation = useMutation({
    mutationFn: async (group: SupplierGroup) => {
      if (!tenantId) throw new Error("No tenant");

      const poNumber = await generatePONumber();
      const items = group.items.map((item) => ({
        product_id: item.product.id,
        product_name: item.product.name,
        sku: item.product.sku,
        quantity_ordered:
          editedQuantities[item.product.id] ?? item.suggestedQuantity,
        unit_cost: item.unitCost,
      }));

      const totalCost = items.reduce(
        (sum, i) => sum + i.quantity_ordered * i.unit_cost,
        0
      );

      // Insert PO
      const { data: po, error: poError } = await supabase
        .from("purchase_orders")
        .insert({
          tenant_id: tenantId,
          po_number: poNumber,
          supplier_name: group.supplierName,
          status: "draft",
          total_cost: totalCost,
          notes: `Auto-generated reorder for ${group.items.length} product(s)`,
          expected_date: new Date(
            Date.now() +
              Math.max(...group.items.map((i) => i.leadTimeDays)) *
                86400000
          )
            .toISOString()
            .split("T")[0],
        })
        .select("id")
        .single();

      if (poError) throw poError;

      // Insert PO items
      const { error: itemsError } = await supabase
        .from("purchase_order_items")
        .insert(
          items.map((item) => ({
            po_id: po.id,
            ...item,
          }))
        );

      if (itemsError) throw itemsError;

      return { poNumber, itemCount: items.length };
    },
    onSuccess: (result) => {
      toast.success(
        t("products.reorder.poCreated") ||
          `Purchase order ${result.poNumber} created with ${result.itemCount} item(s)`
      );
      queryClient.invalidateQueries({ queryKey: ["reorder-products"] });
    },
    onError: (err: Error) => {
      toast.error(
        t("products.reorder.poError") || `Failed to create PO: ${err.message}`
      );
    },
  });

  // ── Handlers ──

  const handleGeneratePO = useCallback(
    async (group: SupplierGroup) => {
      const key = group.supplierName;
      setGeneratingPO((prev) => new Set(prev).add(key));
      try {
        await generatePOMutation.mutateAsync(group);
      } finally {
        setGeneratingPO((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [generatePOMutation]
  );

  const handleGenerateAllPOs = useCallback(async () => {
    for (const group of supplierGroups) {
      if (group.supplierName === (t("products.reorder.noSupplier") || "No Supplier Assigned")) {
        continue;
      }
      await handleGeneratePO(group);
    }
  }, [supplierGroups, handleGeneratePO, t]);

  const handleDismiss = useCallback((productId: string) => {
    setDismissedIds((prev) => new Set(prev).add(productId));
  }, []);

  const handleEditQuantity = useCallback(
    (productId: string, qty: number) => {
      setEditedQuantities((prev) => ({ ...prev, [productId]: qty }));
    },
    []
  );

  const toggleSupplierExpand = useCallback((name: string) => {
    setExpandedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const handleExportCSV = useCallback(() => {
    const headers = [
      "Supplier",
      "Product",
      "SKU",
      "Current Stock",
      "Daily Sales Rate",
      "Days Until Stockout",
      "Suggested Qty",
      "Lead Time (days)",
      "Unit Cost",
      "Line Total",
      "Urgency",
    ];

    const rows: string[][] = [];
    for (const group of supplierGroups) {
      for (const item of group.items) {
        const qty =
          editedQuantities[item.product.id] ?? item.suggestedQuantity;
        rows.push([
          group.supplierName,
          item.product.name,
          item.product.sku,
          String(item.product.stock_quantity),
          item.dailySalesRate.toFixed(1),
          item.daysUntilStockout !== null
            ? String(item.daysUntilStockout)
            : "N/A",
          String(qty),
          String(item.leadTimeDays),
          String(item.unitCost),
          String(qty * item.unitCost),
          item.urgency.toUpperCase(),
        ]);
      }
    }

    const csvContent = [
      headers.join(","),
      ...rows.map((r) =>
        r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reorder-report-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success(t("products.reorder.exported") || "Reorder report exported");
  }, [supplierGroups, editedQuantities, t]);

  // ── Loading state ──
  const isLoading = productsLoading || salesLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 text-muted animate-spin" />
        <p className="text-sm text-muted">
          {t("products.reorder.loading") || "Analyzing inventory levels..."}
        </p>
      </div>
    );
  }

  if (productsError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <AlertTriangle className="w-8 h-8 text-rose-500" />
        <p className="text-sm text-rose-600">
          {t("products.reorder.error") || "Failed to load reorder data"}
        </p>
        <p className="text-xs text-muted">
          {(productsError as Error).message}
        </p>
      </div>
    );
  }

  // ── Empty state ──
  if (totalReorderCount === 0) {
    return (
      <div className="space-y-6">
        <DashboardHeader
          t={t}
          totalCount={0}
          onGenerateAll={handleGenerateAllPOs}
          onExportCSV={handleExportCSV}
          isGenerating={false}
        />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-20 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl"
        >
          <div className="w-16 h-16 rounded-2xl bg-[var(--pastel-green)] flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-emerald-700" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            {t("products.reorder.allGood") || "All stocked up!"}
          </h3>
          <p className="text-sm text-muted max-w-sm text-center">
            {t("products.reorder.allGoodDesc") ||
              "No products currently need reordering. All inventory levels are within safe thresholds."}
          </p>
        </motion.div>
      </div>
    );
  }

  // ── Main render ──
  return (
    <div className="space-y-5">
      <DashboardHeader
        t={t}
        totalCount={totalReorderCount}
        onGenerateAll={handleGenerateAllPOs}
        onExportCSV={handleExportCSV}
        isGenerating={generatingPO.size > 0}
      />

      <AnimatePresence mode="popLayout">
        {supplierGroups.map((group) => (
          <motion.div
            key={group.supplierName}
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <SupplierGroupCard
              group={group}
              t={t}
              isExpanded={expandedSuppliers.has(group.supplierName) || expandedSuppliers.has("__all__")}
              isGenerating={generatingPO.has(group.supplierName)}
              editedQuantities={editedQuantities}
              onToggleExpand={() => toggleSupplierExpand(group.supplierName)}
              onGeneratePO={() => handleGeneratePO(group)}
              onDismiss={handleDismiss}
              onEditQuantity={handleEditQuantity}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Header
// ---------------------------------------------------------------------------

function DashboardHeader({
  t,
  totalCount,
  onGenerateAll,
  onExportCSV,
  isGenerating,
}: {
  t: (key: string) => string;
  totalCount: number;
  onGenerateAll: () => void;
  onExportCSV: () => void;
  isGenerating: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--pastel-blue)] flex items-center justify-center">
          <ShoppingCart className="w-5 h-5 text-blue-700" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {t("products.reorder.title") || "Reorder Dashboard"}
          </h2>
          {totalCount > 0 && (
            <p className="text-xs text-muted">
              {(t("products.reorder.countLabel") || "{count} products need reordering").replace(
                "{count}",
                String(totalCount)
              )}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onExportCSV}
          disabled={totalCount === 0}
          className="flex items-center gap-2 px-3 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm font-medium text-foreground hover:bg-[var(--background)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          {t("products.reorder.exportCSV") || "Export CSV"}
        </button>
        <button
          onClick={onGenerateAll}
          disabled={totalCount === 0 || isGenerating}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileText className="w-4 h-4" />
          )}
          {t("products.reorder.generateAll") || "Generate All POs"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supplier Group Card
// ---------------------------------------------------------------------------

function SupplierGroupCard({
  group,
  t,
  isExpanded,
  isGenerating,
  editedQuantities,
  onToggleExpand,
  onGeneratePO,
  onDismiss,
  onEditQuantity,
}: {
  group: SupplierGroup;
  t: (key: string) => string;
  isExpanded: boolean;
  isGenerating: boolean;
  editedQuantities: Record<string, number>;
  onToggleExpand: () => void;
  onGeneratePO: () => void;
  onDismiss: (id: string) => void;
  onEditQuantity: (id: string, qty: number) => void;
}) {
  const criticalCount = group.items.filter((i) => i.urgency === "red").length;
  const warningCount = group.items.filter((i) => i.urgency === "yellow").length;
  const isNoSupplier = !group.supplierEmail && group.supplierContact === "";

  // Recalculate total with edited quantities
  const totalCost = group.items.reduce((sum, item) => {
    const qty = editedQuantities[item.product.id] ?? item.suggestedQuantity;
    return sum + qty * item.unitCost;
  }, 0);

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-3 p-4 hover:bg-[var(--background)] transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-[var(--pastel-blue)] flex items-center justify-center shrink-0">
          <Truck className="w-5 h-5 text-blue-700" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {group.supplierName}
            </h3>
            {criticalCount > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded-md text-[10px] font-bold">
                {criticalCount} {t("products.reorder.critical") || "critical"}
              </span>
            )}
            {warningCount > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-md text-[10px] font-bold">
                {warningCount} {t("products.reorder.warning") || "warning"}
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">
            {group.items.length}{" "}
            {group.items.length === 1
              ? (t("products.reorder.product") || "product")
              : (t("products.reorder.products") || "products")}{" "}
            &middot; {formatIQD(totalCost)}{" "}
            {t("products.reorder.estimated") || "estimated"}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!isNoSupplier && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onGeneratePO();
              }}
              disabled={isGenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5" />
              )}
              {t("products.reorder.generatePO") || "Generate PO"}
            </button>
          )}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted" />
          )}
        </div>
      </button>

      {/* Expanded product table */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--card-border)]">
              {/* Table header */}
              <div className="hidden md:grid grid-cols-[1fr_90px_80px_80px_100px_80px_60px_40px] gap-2 px-4 py-2 text-[10px] font-semibold text-muted uppercase tracking-wider bg-[var(--background)]">
                <span>{t("products.reorder.col.product") || "Product"}</span>
                <span className="text-right">
                  {t("products.reorder.col.stock") || "Stock"}
                </span>
                <span className="text-right">
                  {t("products.reorder.col.dailyRate") || "Daily Rate"}
                </span>
                <span className="text-right">
                  {t("products.reorder.col.daysLeft") || "Days Left"}
                </span>
                <span className="text-right">
                  {t("products.reorder.col.suggestedQty") || "Suggested Qty"}
                </span>
                <span className="text-right">
                  {t("products.reorder.col.leadTime") || "Lead Time"}
                </span>
                <span className="text-center">
                  {t("products.reorder.col.urgency") || "Urgency"}
                </span>
                <span />
              </div>

              {/* Table rows */}
              <AnimatePresence mode="popLayout">
                {group.items.map((item) => (
                  <ReorderRow
                    key={item.product.id}
                    item={item}
                    t={t}
                    editedQty={editedQuantities[item.product.id]}
                    onDismiss={() => onDismiss(item.product.id)}
                    onEditQuantity={(qty) =>
                      onEditQuantity(item.product.id, qty)
                    }
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reorder Row
// ---------------------------------------------------------------------------

function ReorderRow({
  item,
  t,
  editedQty,
  onDismiss,
  onEditQuantity,
}: {
  item: ReorderItem;
  t: (key: string) => string;
  editedQty?: number;
  onDismiss: () => void;
  onEditQuantity: (qty: number) => void;
}) {
  const qty = editedQty ?? item.suggestedQuantity;
  const cfg = URGENCY_CONFIG[item.urgency];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, height: 0 }}
      transition={{ duration: 0.15 }}
      className="border-b border-[var(--card-border)] last:border-b-0 hover:bg-[var(--background)] transition-colors"
    >
      {/* Desktop row */}
      <div className="hidden md:grid grid-cols-[1fr_90px_80px_80px_100px_80px_60px_40px] gap-2 px-4 py-3 items-center">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {item.product.name}
          </p>
          <p className="text-[11px] text-muted truncate">{item.product.sku}</p>
        </div>

        <p className="text-sm text-foreground text-right tabular-nums">
          {item.product.stock_quantity}
        </p>

        <p className="text-sm text-foreground text-right tabular-nums">
          {item.dailySalesRate > 0 ? item.dailySalesRate.toFixed(1) : "--"}
        </p>

        <div className="text-right">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-sm font-medium tabular-nums",
              item.daysUntilStockout !== null && item.daysUntilStockout < item.leadTimeDays
                ? "text-rose-600"
                : item.daysUntilStockout !== null && item.daysUntilStockout < item.leadTimeDays * 2
                  ? "text-amber-600"
                  : "text-foreground"
            )}
          >
            {item.daysUntilStockout !== null ? (
              <>
                {item.daysUntilStockout}
                <span className="text-[10px] text-muted">d</span>
              </>
            ) : (
              <span title={t("products.reorder.noSales") || "No recent sales"}>
                &infin;
              </span>
            )}
          </span>
        </div>

        <div className="flex justify-end">
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val > 0) onEditQuantity(val);
            }}
            className="w-20 px-2 py-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-lg text-sm text-foreground text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
          />
        </div>

        <p className="text-sm text-muted text-right tabular-nums">
          {item.leadTimeDays}
          <span className="text-[10px]">d</span>
        </p>

        <div className="flex justify-center">
          <span
            title={cfg.label}
            className={cn(
              "w-3 h-3 rounded-full",
              cfg.dot
            )}
          />
        </div>

        <button
          onClick={onDismiss}
          className="p-1 rounded-lg hover:bg-[var(--card-border)] transition-colors"
          title={t("products.reorder.dismiss") || "Dismiss"}
        >
          <X className="w-3.5 h-3.5 text-muted" />
        </button>
      </div>

      {/* Mobile card */}
      <div className="md:hidden p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", cfg.dot)} />
              <p className="text-sm font-medium text-foreground truncate">
                {item.product.name}
              </p>
            </div>
            <p className="text-[11px] text-muted ml-[18px]">{item.product.sku}</p>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded-lg hover:bg-[var(--card-border)] transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5 text-muted" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider">
              {t("products.reorder.col.stock") || "Stock"}
            </p>
            <p className="text-sm font-medium text-foreground tabular-nums">
              {item.product.stock_quantity}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider">
              {t("products.reorder.col.daysLeft") || "Days Left"}
            </p>
            <p
              className={cn(
                "text-sm font-medium tabular-nums",
                item.daysUntilStockout !== null && item.daysUntilStockout < item.leadTimeDays
                  ? "text-rose-600"
                  : "text-foreground"
              )}
            >
              {item.daysUntilStockout !== null
                ? `${item.daysUntilStockout}d`
                : "\u221E"}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider">
              {t("products.reorder.col.leadTime") || "Lead Time"}
            </p>
            <p className="text-sm font-medium text-foreground tabular-nums">
              {item.leadTimeDays}d
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted shrink-0">
            {t("products.reorder.orderQty") || "Order Qty:"}
          </label>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val > 0) onEditQuantity(val);
            }}
            className="flex-1 px-3 py-1.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all"
          />
          <span className="text-xs text-muted shrink-0">
            = {formatIQD(qty * item.unitCost)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
