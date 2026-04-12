"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Package,
  Search,
  Plus,
  X,
  Download,
  FileText,
  BarChart3,
  ShieldAlert,
  Calendar,
  Loader2,
  PackageX,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn, formatIQD } from "@/lib/utils";
import { toast } from "sonner";

// =============================================
// TYPES
// =============================================

interface ShrinkageReportProps {
  onProductClick?: (productId: string) => void;
}

type TimePeriod = "week" | "month" | "quarter" | "year" | "custom";

interface ShrinkageEvent {
  id: string;
  product_id: string;
  variant_id: string | null;
  change_type: string;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  notes: string | null;
  created_at: string;
  products: {
    id: string;
    name: string;
    sku: string;
    cost: number;
    price: number;
    category_id: string | null;
    image_url: string | null;
  };
}

interface CategoryInfo {
  id: string;
  name: string;
}

interface ProductShrinkageRow {
  productId: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  categoryName: string;
  events: number;
  unitsLost: number;
  valueLost: number;
  pctOfTotal: number;
}

// =============================================
// CONSTANTS
// =============================================

const SHRINKAGE_TYPES = [
  "shrinkage_damaged",
  "shrinkage_stolen",
  "shrinkage_expired",
  "shrinkage_other",
] as const;

const PIE_COLORS = ["#f43f5e", "#f59e0b", "#3b82f6", "#6b7280"];

const REASON_LABELS: Record<string, string> = {
  shrinkage_damaged: "Damaged",
  shrinkage_stolen: "Stolen",
  shrinkage_expired: "Expired",
  shrinkage_other: "Other",
};

const INDUSTRY_AVG_RATE = 1.5;

const PERIOD_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "year", label: "This Year" },
  { value: "custom", label: "Custom" },
];

// =============================================
// HELPERS
// =============================================

function getDateRange(
  period: TimePeriod,
  customStart?: string,
  customEnd?: string
): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();

  if (period === "custom" && customStart && customEnd) {
    return {
      start: new Date(customStart).toISOString(),
      end: new Date(customEnd + "T23:59:59").toISOString(),
    };
  }

  const start = new Date(now);
  switch (period) {
    case "week":
      start.setDate(start.getDate() - 7);
      break;
    case "month":
      start.setMonth(start.getMonth() - 1);
      break;
    case "quarter":
      start.setMonth(start.getMonth() - 3);
      break;
    case "year":
      start.setFullYear(start.getFullYear() - 1);
      break;
    default:
      start.setMonth(start.getMonth() - 1);
  }

  return { start: start.toISOString(), end };
}

function groupByMonth(events: ShrinkageEvent[]): { month: string; value: number }[] {
  const map = new Map<string, number>();
  for (const ev of events) {
    const d = new Date(ev.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cost = ev.products?.cost ?? 0;
    const val = Math.abs(ev.quantity_change) * cost;
    map.set(key, (map.get(key) ?? 0) + val);
  }
  const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  return sorted.map(([month, value]) => ({ month, value }));
}

// =============================================
// SKELETON COMPONENTS
// =============================================

function CardSkeleton() {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 animate-pulse">
      <div className="h-4 w-24 bg-[var(--card-border)] rounded mb-3" />
      <div className="h-7 w-32 bg-[var(--card-border)] rounded mb-2" />
      <div className="h-3 w-20 bg-[var(--card-border)] rounded" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 animate-pulse">
      <div className="h-5 w-36 bg-[var(--card-border)] rounded mb-4" />
      <div className="h-48 bg-[var(--card-border)] rounded" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5 animate-pulse space-y-3">
      <div className="h-5 w-48 bg-[var(--card-border)] rounded mb-4" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-10 bg-[var(--card-border)] rounded" />
      ))}
    </div>
  );
}

// =============================================
// LOG SHRINKAGE MODAL
// =============================================

function LogShrinkageModal({
  tenantId,
  onClose,
  onSuccess,
}: {
  tenantId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useLanguage();
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<{
    id: string;
    name: string;
    sku: string;
    stock_quantity: number;
  } | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [reason, setReason] = useState<(typeof SHRINKAGE_TYPES)[number]>("shrinkage_damaged");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: searchResults = [] } = useQuery({
    queryKey: ["product-search-shrinkage", tenantId, productSearch],
    queryFn: async () => {
      if (!productSearch || productSearch.length < 2) return [];
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, stock_quantity")
        .eq("tenant_id", tenantId)
        .or(`name.ilike.%${productSearch}%,sku.ilike.%${productSearch}%`)
        .limit(10);
      return data ?? [];
    },
    enabled: productSearch.length >= 2 && !selectedProduct,
  });

  const handleSave = async () => {
    if (!selectedProduct || quantity <= 0) return;
    setSaving(true);
    try {
      const { data: current } = await supabase
        .from("products")
        .select("stock_quantity")
        .eq("id", selectedProduct.id)
        .single();

      const qtyBefore = current?.stock_quantity ?? 0;
      const qtyAfter = Math.max(0, qtyBefore - quantity);

      const { error: histError } = await supabase.from("inventory_history").insert({
        product_id: selectedProduct.id,
        change_type: reason,
        quantity_change: -quantity,
        quantity_before: qtyBefore,
        quantity_after: qtyAfter,
        notes: notes || null,
        tenant_id: tenantId,
      });

      if (histError) throw histError;

      const { error: updError } = await supabase
        .from("products")
        .update({ stock_quantity: qtyAfter })
        .eq("id", selectedProduct.id)
        .eq("tenant_id", tenantId);

      if (updError) throw updError;

      toast.success(
        t("products.shrinkage.logged") || "Shrinkage logged successfully"
      );
      onSuccess();
      onClose();
    } catch (err) {
      console.error("Failed to log shrinkage:", err);
      toast.error(t("products.shrinkage.logError") || "Failed to log shrinkage");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl w-full max-w-md p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-foreground">
            {t("products.shrinkage.logTitle") || "Log Shrinkage"}
          </h3>
          <button onClick={onClose} className="text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Product search */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t("products.shrinkage.product") || "Product"}
          </label>
          {selectedProduct ? (
            <div className="flex items-center justify-between bg-[var(--background)] border border-[var(--card-border)] rounded-xl px-3 py-2">
              <span className="text-sm text-foreground">
                {selectedProduct.name}{" "}
                <span className="text-muted">({selectedProduct.sku})</span>
              </span>
              <button
                onClick={() => {
                  setSelectedProduct(null);
                  setProductSearch("");
                }}
                className="text-muted hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                placeholder={
                  t("products.shrinkage.searchProduct") || "Search by name or SKU..."
                }
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
              />
              {searchResults.length > 0 && (
                <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProduct(p);
                        setProductSearch("");
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--background)] text-foreground"
                    >
                      {p.name}{" "}
                      <span className="text-muted">({p.sku})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quantity */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t("products.shrinkage.quantity") || "Quantity Lost"}
          </label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
          />
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t("products.shrinkage.reason") || "Reason"}
          </label>
          <select
            value={reason}
            onChange={(e) =>
              setReason(e.target.value as (typeof SHRINKAGE_TYPES)[number])
            }
            className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
          >
            {SHRINKAGE_TYPES.map((type) => (
              <option key={type} value={type}>
                {REASON_LABELS[type]}
              </option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">
            {t("products.shrinkage.notes") || "Notes"}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={
              t("products.shrinkage.notesPlaceholder") || "Optional details..."
            }
            className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-[var(--card-border)] rounded-xl text-sm font-medium text-foreground hover:bg-[var(--background)] transition-colors"
          >
            {t("common.cancel") || "Cancel"}
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedProduct || quantity <= 0 || saving}
            className={cn(
              "flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2",
              selectedProduct && quantity > 0 && !saving
                ? "bg-[var(--ink)] text-white hover:opacity-90"
                : "bg-[var(--card-border)] text-muted cursor-not-allowed"
            )}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("common.save") || "Save"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// =============================================
// MAIN COMPONENT
// =============================================

export function ShrinkageReport({ onProductClick }: ShrinkageReportProps) {
  const { tenantId } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const [period, setPeriod] = useState<TimePeriod>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showLogModal, setShowLogModal] = useState(false);

  const dateRange = useMemo(
    () => getDateRange(period, customStart, customEnd),
    [period, customStart, customEnd]
  );

  // ── Fetch shrinkage events ──
  const {
    data: shrinkageEvents = [],
    isLoading: eventsLoading,
    error: eventsError,
  } = useQuery({
    queryKey: ["shrinkage-events", tenantId, dateRange.start, dateRange.end],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("inventory_history")
        .select(
          "id, product_id, variant_id, change_type, quantity_change, quantity_before, quantity_after, notes, created_at, products(id, name, sku, cost, price, category_id, image_url)"
        )
        .eq("tenant_id", tenantId)
        .in("change_type", [...SHRINKAGE_TYPES])
        .gte("created_at", dateRange.start)
        .lte("created_at", dateRange.end)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data as unknown as ShrinkageEvent[]) ?? [];
    },
    enabled: !!tenantId,
  });

  // ── Fetch categories ──
  const { data: categories = [] } = useQuery({
    queryKey: ["categories-for-shrinkage", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data } = await supabase
        .from("categories")
        .select("id, name")
        .eq("tenant_id", tenantId);
      return (data as CategoryInfo[]) ?? [];
    },
    enabled: !!tenantId,
  });

  // ── Fetch total inventory value for shrinkage rate ──
  const { data: totalInventoryValue = 0 } = useQuery({
    queryKey: ["total-inventory-value", tenantId],
    queryFn: async () => {
      if (!tenantId) return 0;
      const { data } = await supabase
        .from("products")
        .select("stock_quantity, cost")
        .eq("tenant_id", tenantId);
      if (!data) return 0;
      return data.reduce(
        (sum, p) => sum + (p.stock_quantity ?? 0) * (p.cost ?? 0),
        0
      );
    },
    enabled: !!tenantId,
  });

  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.name);
    return map;
  }, [categories]);

  // ── Computed data ──
  const computed = useMemo(() => {
    const totalEvents = shrinkageEvents.length;
    const totalUnitsLost = shrinkageEvents.reduce(
      (sum, e) => sum + Math.abs(e.quantity_change),
      0
    );
    const totalValueLost = shrinkageEvents.reduce(
      (sum, e) => sum + Math.abs(e.quantity_change) * (e.products?.cost ?? 0),
      0
    );
    const shrinkageRate =
      totalInventoryValue > 0
        ? (totalValueLost / totalInventoryValue) * 100
        : 0;

    // By reason
    const byReason = SHRINKAGE_TYPES.map((type, i) => {
      const events = shrinkageEvents.filter((e) => e.change_type === type);
      const value = events.reduce(
        (sum, e) => sum + Math.abs(e.quantity_change) * (e.products?.cost ?? 0),
        0
      );
      return {
        name: REASON_LABELS[type],
        value,
        count: events.length,
        color: PIE_COLORS[i],
      };
    }).filter((r) => r.value > 0);

    // By category
    const catMap = new Map<string, number>();
    for (const ev of shrinkageEvents) {
      const catId = ev.products?.category_id;
      const catName = catId ? categoryMap.get(catId) ?? "Uncategorized" : "Uncategorized";
      const val = Math.abs(ev.quantity_change) * (ev.products?.cost ?? 0);
      catMap.set(catName, (catMap.get(catName) ?? 0) + val);
    }
    const byCategory = Array.from(catMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Trend
    const trend = groupByMonth(shrinkageEvents);

    // Top products
    const prodMap = new Map<
      string,
      { name: string; sku: string; imageUrl: string | null; categoryId: string | null; events: number; unitsLost: number; valueLost: number }
    >();
    for (const ev of shrinkageEvents) {
      const pid = ev.product_id;
      const existing = prodMap.get(pid);
      const val = Math.abs(ev.quantity_change) * (ev.products?.cost ?? 0);
      if (existing) {
        existing.events += 1;
        existing.unitsLost += Math.abs(ev.quantity_change);
        existing.valueLost += val;
      } else {
        prodMap.set(pid, {
          name: ev.products?.name ?? "Unknown",
          sku: ev.products?.sku ?? "",
          imageUrl: ev.products?.image_url ?? null,
          categoryId: ev.products?.category_id ?? null,
          events: 1,
          unitsLost: Math.abs(ev.quantity_change),
          valueLost: val,
        });
      }
    }
    const topProducts: ProductShrinkageRow[] = Array.from(prodMap.entries())
      .map(([productId, p]) => ({
        productId,
        name: p.name,
        sku: p.sku,
        imageUrl: p.imageUrl,
        categoryName: p.categoryId
          ? categoryMap.get(p.categoryId) ?? "Uncategorized"
          : "Uncategorized",
        events: p.events,
        unitsLost: p.unitsLost,
        valueLost: p.valueLost,
        pctOfTotal: totalValueLost > 0 ? (p.valueLost / totalValueLost) * 100 : 0,
      }))
      .sort((a, b) => b.valueLost - a.valueLost)
      .slice(0, 20);

    return {
      totalEvents,
      totalUnitsLost,
      totalValueLost,
      shrinkageRate,
      byReason,
      byCategory,
      trend,
      topProducts,
    };
  }, [shrinkageEvents, totalInventoryValue, categoryMap]);

  // ── Export handlers ──
  const handleExportCSV = useCallback(() => {
    const headers = ["Product", "SKU", "Category", "Events", "Units Lost", "Value Lost", "% of Total"];
    const rows = computed.topProducts.map((p) => [
      p.name,
      p.sku,
      p.categoryName,
      p.events,
      p.unitsLost,
      p.valueLost,
      p.pctOfTotal.toFixed(1) + "%",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shrinkage-report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t("products.shrinkage.exported") || "CSV exported");
  }, [computed.topProducts, t]);

  const handleExportPDF = useCallback(() => {
    window.print();
    toast.success(t("products.shrinkage.pdfExported") || "PDF export initiated");
  }, [t]);

  const handleLogSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["shrinkage-events"] });
    queryClient.invalidateQueries({ queryKey: ["total-inventory-value"] });
  }, [queryClient]);

  // ── Loading state ──
  if (eventsLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-[var(--card-border)] rounded animate-pulse" />
          <div className="h-10 w-64 bg-[var(--card-border)] rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <ChartSkeleton key={i} />
          ))}
        </div>
        <TableSkeleton />
      </div>
    );
  }

  // ── Error state ──
  if (eventsError) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-12 text-center">
        <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <p className="text-foreground font-medium">
          {t("products.shrinkage.error") || "Failed to load shrinkage data"}
        </p>
        <p className="text-sm text-muted mt-1">Please try again later.</p>
      </div>
    );
  }

  const rateColor =
    computed.shrinkageRate < 1
      ? "text-green-500"
      : computed.shrinkageRate <= 2
        ? "text-amber-500"
        : "text-red-500";

  const vsIndustry = computed.shrinkageRate - INDUSTRY_AVG_RATE;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">
              {t("products.shrinkage.title") || "Shrinkage Report"}
            </h2>
            <p className="text-sm text-muted">
              {t("products.shrinkage.subtitle") || "Track and analyze inventory losses"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period selector */}
          <div className="flex bg-[var(--background)] rounded-xl p-1 border border-[var(--card-border)]">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  period === opt.value
                    ? "bg-[var(--ink)] text-white"
                    : "text-muted hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Quick log button */}
          <button
            onClick={() => setShowLogModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--ink)] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            {t("products.shrinkage.log") || "Log Shrinkage"}
          </button>
        </div>
      </div>

      {/* Custom date range */}
      <AnimatePresence>
        {period === "custom" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted" />
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-3 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                />
                <span className="text-muted text-sm">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-3 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Shrinkage */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0 }}
          className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 text-muted text-sm mb-2">
            <Package className="w-4 h-4" />
            {t("products.shrinkage.totalShrinkage") || "Total Shrinkage"}
          </div>
          <p className="text-2xl font-bold text-foreground">
            {computed.totalEvents}
            <span className="text-sm font-normal text-muted ml-2">
              {t("products.shrinkage.events") || "events"}
            </span>
          </p>
          <p className="text-sm text-muted mt-1">
            {computed.totalUnitsLost} {t("products.shrinkage.unitsLost") || "units lost"}
          </p>
        </motion.div>

        {/* Shrinkage Value */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 text-muted text-sm mb-2">
            <DollarSign className="w-4 h-4" />
            {t("products.shrinkage.shrinkageValue") || "Shrinkage Value"}
          </div>
          <p className="text-2xl font-bold text-foreground">
            {formatIQD(computed.totalValueLost)}
          </p>
          <p className="text-sm text-muted mt-1">
            {t("products.shrinkage.costBasis") || "at cost basis"}
          </p>
        </motion.div>

        {/* Shrinkage Rate */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 text-muted text-sm mb-2">
            <BarChart3 className="w-4 h-4" />
            {t("products.shrinkage.shrinkageRate") || "Shrinkage Rate"}
          </div>
          <p className={cn("text-2xl font-bold", rateColor)}>
            {computed.shrinkageRate.toFixed(2)}%
          </p>
          <p className="text-sm text-muted mt-1">
            {t("products.shrinkage.ofInventoryValue") || "of inventory value"}
          </p>
        </motion.div>

        {/* vs Industry */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5"
        >
          <div className="flex items-center gap-2 text-muted text-sm mb-2">
            {vsIndustry <= 0 ? (
              <TrendingDown className="w-4 h-4 text-green-500" />
            ) : (
              <TrendingUp className="w-4 h-4 text-red-500" />
            )}
            {t("products.shrinkage.vsIndustry") || "vs Industry"}
          </div>
          <p className="text-sm text-muted mb-1">
            {t("products.shrinkage.industryAvg") || "Industry avg:"} {INDUSTRY_AVG_RATE}%
          </p>
          <p
            className={cn(
              "text-xl font-bold",
              vsIndustry <= 0 ? "text-green-500" : "text-red-500"
            )}
          >
            {vsIndustry > 0 ? "+" : ""}
            {vsIndustry.toFixed(2)}%
          </p>
          <p className="text-sm text-muted mt-1">
            {vsIndustry <= 0
              ? t("products.shrinkage.belowAvg") || "Below average"
              : t("products.shrinkage.aboveAvg") || "Above average"}
          </p>
        </motion.div>
      </div>

      {/* ── Charts ── */}
      {shrinkageEvents.length === 0 ? (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--background)] flex items-center justify-center">
            <PackageX className="w-8 h-8 text-muted" />
          </div>
          <p className="text-lg font-medium text-foreground">
            {t("products.shrinkage.noData") || "No shrinkage events found"}
          </p>
          <p className="text-sm text-muted mt-1">
            {t("products.shrinkage.noDataDesc") ||
              "No shrinkage has been recorded for this period. Use the Log Shrinkage button to record events."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* By Reason Pie */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5"
            >
              <h3 className="text-sm font-semibold text-foreground mb-4">
                {t("products.shrinkage.byReason") || "By Reason"}
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={computed.byReason}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {computed.byReason.map((entry, idx) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatIQD(value)}
                    contentStyle={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--card-border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    formatter={(value) => (
                      <span className="text-xs text-foreground">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Trend Line */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5"
            >
              <h3 className="text-sm font-semibold text-foreground mb-4">
                {t("products.shrinkage.trend") || "Trend Over Time"}
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={computed.trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatIQD(v)}
                  />
                  <Tooltip
                    formatter={(value: number) => formatIQD(value)}
                    contentStyle={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--card-border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#f43f5e"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#f43f5e" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>

            {/* By Category Bar */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-5"
            >
              <h3 className="text-sm font-semibold text-foreground mb-4">
                {t("products.shrinkage.byCategory") || "By Category"}
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={computed.byCategory} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--card-border)" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatIQD(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                    axisLine={false}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip
                    formatter={(value: number) => formatIQD(value)}
                    contentStyle={{
                      background: "var(--card-bg)",
                      border: "1px solid var(--card-border)",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* ── Top Shrinkage Products Table ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-[var(--card-border)]">
              <h3 className="text-sm font-semibold text-foreground">
                {t("products.shrinkage.topProducts") || "Top Shrinkage Products"}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-[var(--card-border)] rounded-xl text-xs font-medium text-foreground hover:bg-[var(--background)] transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {t("products.shrinkage.exportCSV") || "Export CSV"}
                </button>
                <button
                  onClick={handleExportPDF}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-[var(--card-border)] rounded-xl text-xs font-medium text-foreground hover:bg-[var(--background)] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t("products.shrinkage.exportPDF") || "Export PDF"}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--card-border)] bg-[var(--background)]/50">
                    <th className="p-4 font-semibold text-sm text-foreground">
                      {t("products.shrinkage.colProduct") || "Product"}
                    </th>
                    <th className="p-4 font-semibold text-sm text-foreground">
                      {t("products.shrinkage.colCategory") || "Category"}
                    </th>
                    <th className="p-4 font-semibold text-sm text-foreground text-right">
                      {t("products.shrinkage.colEvents") || "Events"}
                    </th>
                    <th className="p-4 font-semibold text-sm text-foreground text-right">
                      {t("products.shrinkage.colUnitsLost") || "Units Lost"}
                    </th>
                    <th className="p-4 font-semibold text-sm text-foreground text-right">
                      {t("products.shrinkage.colValueLost") || "Value Lost"}
                    </th>
                    <th className="p-4 font-semibold text-sm text-foreground text-right">
                      {t("products.shrinkage.colPctTotal") || "% of Total"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {computed.topProducts.map((product, idx) => (
                    <tr
                      key={product.productId}
                      onClick={() => onProductClick?.(product.productId)}
                      className={cn(
                        "border-b border-[var(--card-border)] transition-colors",
                        onProductClick
                          ? "cursor-pointer hover:bg-[var(--background)]/50"
                          : ""
                      )}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {product.imageUrl ? (
                            <img
                              src={product.imageUrl}
                              alt={product.name}
                              className="w-8 h-8 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-[var(--background)] flex items-center justify-center">
                              <Package className="w-4 h-4 text-muted" />
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium text-foreground">
                              {product.name}
                            </p>
                            <p className="text-xs text-muted">{product.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm text-muted">{product.categoryName}</td>
                      <td className="p-4 text-sm text-foreground text-right">
                        {product.events}
                      </td>
                      <td className="p-4 text-sm text-foreground text-right">
                        {product.unitsLost}
                      </td>
                      <td className="p-4 text-sm font-medium text-red-500 text-right">
                        {formatIQD(product.valueLost)}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-500 rounded-full"
                              style={{ width: `${Math.min(product.pctOfTotal, 100)}%` }}
                            />
                          </div>
                          <span className="text-sm text-foreground">
                            {product.pctOfTotal.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}

      {/* ── Log Shrinkage Modal ── */}
      <AnimatePresence>
        {showLogModal && tenantId && (
          <LogShrinkageModal
            tenantId={tenantId}
            onClose={() => setShowLogModal(false)}
            onSuccess={handleLogSuccess}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
