"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Search,
  ClipboardList,
  Loader2,
  Check,
  AlertTriangle,
  Package,
  Clock,
  ArrowLeft,
  Download,
  Trash2,
  Save,
  ChevronUp,
  ChevronDown,
  X,
  ToggleLeft,
  ToggleRight,
  Timer,
  MapPin,
  ArrowUpDown,
  FileSpreadsheet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockTake {
  id: string;
  tenant_id: string;
  name: string;
  status: "in_progress" | "completed" | "cancelled";
  started_by: string | null;
  completed_at: string | null;
  notes: string | null;
  total_counted: number;
  total_variance: number;
  variance_value: number;
  created_at: string;
  updated_at: string;
}

interface StockTakeItem {
  id: string;
  stock_take_id: string;
  product_id: string;
  variant_id: string | null;
  location_id: string | null;
  expected_quantity: number;
  counted_quantity: number | null;
  variance: number | null;
  reason: string | null;
  counted_at: string | null;
  created_at: string;
  product?: {
    id: string;
    name: string;
    sku: string;
    stock_quantity: number;
    cost: number;
    price: number;
    image_url: string | null;
  };
  location?: {
    id: string;
    name: string;
    code: string;
    type: string;
  } | null;
}

type FilterTab = "all" | "uncounted" | "discrepancies" | "by_location";
type SortOption = "name" | "location" | "variance" | "status";
type AdjustmentReason = "physical_count" | "damage_found" | "theft_loss" | "system_correction";

const STATUS_STYLES: Record<string, string> = {
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const REASON_OPTIONS: { value: AdjustmentReason; label: string }[] = [
  { value: "physical_count", label: "Physical count" },
  { value: "damage_found", label: "Damage found" },
  { value: "theft_loss", label: "Theft/loss" },
  { value: "system_correction", label: "System correction" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(startTime: string): string {
  const diff = Date.now() - new Date(startTime).getTime();
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function getVarianceStatus(item: StockTakeItem) {
  if (item.counted_quantity === null) return "pending";
  if (item.variance === 0) return "match";
  if ((item.variance ?? 0) < 0) return "short";
  return "over";
}

function getVarianceRowClass(item: StockTakeItem): string {
  if (item.counted_quantity === null) return "";
  const v = Math.abs(item.variance ?? 0);
  if (v === 0) return "bg-emerald-50/50";
  if (v <= 2) return "bg-amber-50/50";
  return "bg-rose-50/50";
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StockTakeMode() {
  const { tenantId } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);

  if (!tenantId) return null;

  return activeSessionId ? (
    <ActiveStockTake
      stockTakeId={activeSessionId}
      tenantId={tenantId}
      readOnly={readOnly}
      onBack={() => {
        setActiveSessionId(null);
        setReadOnly(false);
      }}
    />
  ) : (
    <SessionListView
      tenantId={tenantId}
      onOpenSession={(id, ro) => {
        setActiveSessionId(id);
        setReadOnly(ro);
      }}
    />
  );
}

// ─── Session List View ────────────────────────────────────────────────────────

function SessionListView({
  tenantId,
  onOpenSession,
}: {
  tenantId: string;
  onOpenSession: (id: string, readOnly: boolean) => void;
}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["stock-takes", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_takes")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as StockTake[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      // Create the stock_take session
      const now = new Date().toISOString();
      const name = `Stock Take ${new Date().toLocaleDateString("en-GB")}`;
      const { data: session, error: sessionError } = await supabase
        .from("stock_takes")
        .insert({
          tenant_id: tenantId,
          name,
          status: "in_progress",
          total_counted: 0,
          total_variance: 0,
          variance_value: 0,
        })
        .select()
        .single();
      if (sessionError) throw sessionError;

      // Load all products and create stock_take_items
      const { data: products, error: prodError } = await supabase
        .from("products")
        .select("id, stock_quantity")
        .eq("tenant_id", tenantId);
      if (prodError) throw prodError;

      if (products && products.length > 0) {
        const items = products.map((p: { id: string; stock_quantity: number }) => ({
          stock_take_id: session.id,
          product_id: p.id,
          variant_id: null,
          location_id: null,
          expected_quantity: p.stock_quantity ?? 0,
          counted_quantity: null,
          variance: null,
          reason: null,
          counted_at: null,
        }));

        // Insert in batches of 500
        for (let i = 0; i < items.length; i += 500) {
          const batch = items.slice(i, i + 500);
          const { error: itemsError } = await supabase
            .from("stock_take_items")
            .insert(batch);
          if (itemsError) throw itemsError;
        }
      }

      return session as StockTake;
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["stock-takes", tenantId] });
      toast.success(t("products.stockTake.created") || "Stock take session created");
      onOpenSession(session.id, false);
    },
    onError: () => {
      toast.error(t("products.stockTake.createError") || "Failed to create stock take");
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            {t("products.stockTake.title") || "Stock Take / Audit"}
          </h2>
          <p className="text-sm text-muted mt-1">
            {t("products.stockTake.subtitle") || "Count and reconcile your physical inventory"}
          </p>
        </div>
        <button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="flex items-center gap-2 px-5 py-3 bg-foreground text-background rounded-xl font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {createMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          {t("products.stockTake.newSession") || "New Stock Take"}
        </button>
      </div>

      {/* Sessions Table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-muted" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <ClipboardList className="w-12 h-12 text-muted/40" />
            <p className="text-muted text-sm">
              {t("products.stockTake.empty") || "No stock take sessions yet"}
            </p>
            <p className="text-muted/60 text-xs">
              {t("products.stockTake.emptyHint") || "Create your first stock take to start counting inventory"}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] text-muted text-left">
                <th className="px-4 py-3 font-medium">{t("products.stockTake.name") || "Name"}</th>
                <th className="px-4 py-3 font-medium">{t("products.stockTake.status") || "Status"}</th>
                <th className="px-4 py-3 font-medium">{t("products.stockTake.date") || "Date"}</th>
                <th className="px-4 py-3 font-medium text-right">{t("products.stockTake.counted") || "Counted"}</th>
                <th className="px-4 py-3 font-medium text-right">{t("products.stockTake.totalVariance") || "Variance"}</th>
                <th className="px-4 py-3 font-medium text-right">{t("products.stockTake.varianceValue") || "Value"}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <motion.tr
                  key={session.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() =>
                    onOpenSession(session.id, session.status !== "in_progress")
                  }
                  className="border-b border-[var(--card-border)] last:border-0 hover:bg-[var(--background)]/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {session.name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex px-2.5 py-1 rounded-full text-xs font-medium",
                        STATUS_STYLES[session.status]
                      )}
                    >
                      {session.status === "in_progress"
                        ? t("products.stockTake.inProgress") || "In Progress"
                        : session.status === "completed"
                        ? t("products.stockTake.completed") || "Completed"
                        : t("products.stockTake.cancelled") || "Cancelled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {new Date(session.created_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground tabular-nums">
                    {session.total_counted}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span
                      className={cn(
                        session.total_variance === 0
                          ? "text-emerald-600"
                          : session.total_variance < 0
                          ? "text-rose-600"
                          : "text-amber-600"
                      )}
                    >
                      {session.total_variance > 0 ? "+" : ""}
                      {session.total_variance}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {formatIQD(Math.abs(session.variance_value))}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Active Stock Take View ───────────────────────────────────────────────────

function ActiveStockTake({
  stockTakeId,
  tenantId,
  readOnly,
  onBack,
}: {
  stockTakeId: string;
  tenantId: string;
  readOnly: boolean;
  onBack: () => void;
}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [sortOption, setSortOption] = useState<SortOption>("name");
  const [quickCountMode, setQuickCountMode] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [bulkReason, setBulkReason] = useState<AdjustmentReason>("physical_count");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [timerTick, setTimerTick] = useState(0);

  const countInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const nextUncountedRef = useRef<string | null>(null);

  // Timer tick for duration display
  useEffect(() => {
    if (readOnly) return;
    const interval = setInterval(() => setTimerTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [readOnly]);

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: stockTake, isLoading: loadingSession } = useQuery({
    queryKey: ["stock-take", stockTakeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_takes")
        .select("*")
        .eq("id", stockTakeId)
        .single();
      if (error) throw error;
      return data as StockTake;
    },
  });

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ["stock-take-items", stockTakeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_take_items")
        .select(
          "*, product:products(id, name, sku, stock_quantity, cost, price, image_url), location:storage_locations(id, name, code, type)"
        )
        .eq("stock_take_id", stockTakeId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as StockTakeItem[];
    },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["storage-locations", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storage_locations")
        .select("id, name, code, type")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return data as { id: string; name: string; code: string; type: string }[];
    },
  });

  // ── Local state for optimistic counts ─────────────────────────────────────

  const [localCounts, setLocalCounts] = useState<Record<string, number | null>>({});

  const getCountedValue = useCallback(
    (item: StockTakeItem): number | null => {
      if (item.id in localCounts) return localCounts[item.id];
      return item.counted_quantity;
    },
    [localCounts]
  );

  const getVariance = useCallback(
    (item: StockTakeItem): number | null => {
      const counted = getCountedValue(item);
      if (counted === null) return null;
      return counted - item.expected_quantity;
    },
    [getCountedValue]
  );

  // ── Computed values ───────────────────────────────────────────────────────

  const summary = useMemo(() => {
    let matched = 0;
    let shortCount = 0;
    let shortUnits = 0;
    let overCount = 0;
    let overUnits = 0;
    let totalVarianceValue = 0;
    let countedCount = 0;

    items.forEach((item) => {
      const counted = getCountedValue(item);
      if (counted === null) return;
      countedCount++;
      const variance = counted - item.expected_quantity;
      const cost = item.product?.cost ?? 0;

      if (variance === 0) {
        matched++;
      } else if (variance < 0) {
        shortCount++;
        shortUnits += Math.abs(variance);
        totalVarianceValue += Math.abs(variance) * cost;
      } else {
        overCount++;
        overUnits += variance;
        totalVarianceValue += variance * cost;
      }
    });

    return { matched, shortCount, shortUnits, overCount, overUnits, totalVarianceValue, countedCount };
  }, [items, getCountedValue]);

  const progress = items.length > 0 ? (summary.countedCount / items.length) * 100 : 0;

  // ── Filtering & Sorting ───────────────────────────────────────────────────

  const filteredItems = useMemo(() => {
    let result = [...items];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (item) =>
          item.product?.name?.toLowerCase().includes(q) ||
          item.product?.sku?.toLowerCase().includes(q)
      );
    }

    // Filter tab
    if (filterTab === "uncounted") {
      result = result.filter((item) => getCountedValue(item) === null);
    } else if (filterTab === "discrepancies") {
      result = result.filter((item) => {
        const v = getVariance(item);
        return v !== null && v !== 0;
      });
    } else if (filterTab === "by_location" && locationFilter !== "all") {
      result = result.filter((item) => item.location_id === locationFilter);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortOption) {
        case "name":
          return (a.product?.name ?? "").localeCompare(b.product?.name ?? "");
        case "location":
          return (a.location?.name ?? "").localeCompare(b.location?.name ?? "");
        case "variance": {
          const va = Math.abs(getVariance(a) ?? 0);
          const vb = Math.abs(getVariance(b) ?? 0);
          return vb - va;
        }
        case "status": {
          const order = { pending: 0, short: 1, over: 2, match: 3 };
          const sa = getCountedValue(a) === null ? "pending" : getVariance(a) === 0 ? "match" : (getVariance(a) ?? 0) < 0 ? "short" : "over";
          const sb = getCountedValue(b) === null ? "pending" : getVariance(b) === 0 ? "match" : (getVariance(b) ?? 0) < 0 ? "short" : "over";
          return (order[sa] ?? 0) - (order[sb] ?? 0);
        }
        default:
          return 0;
      }
    });

    return result;
  }, [items, search, filterTab, locationFilter, sortOption, getCountedValue, getVariance]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const updateCountMutation = useMutation({
    mutationFn: async ({ itemId, count }: { itemId: string; count: number }) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return;
      const variance = count - item.expected_quantity;
      const { error } = await supabase
        .from("stock_take_items")
        .update({
          counted_quantity: count,
          variance,
          counted_at: new Date().toISOString(),
        })
        .eq("id", itemId);
      if (error) throw error;
    },
    onError: () => {
      toast.error(t("products.stockTake.countError") || "Failed to save count");
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      // Batch update all locally changed counts
      const updates = Object.entries(localCounts)
        .filter(([, val]) => val !== null)
        .map(([itemId, count]) => {
          const item = items.find((i) => i.id === itemId);
          const variance = (count ?? 0) - (item?.expected_quantity ?? 0);
          return supabase
            .from("stock_take_items")
            .update({
              counted_quantity: count,
              variance,
              counted_at: new Date().toISOString(),
            })
            .eq("id", itemId);
        });

      const results = await Promise.all(updates);
      const errors = results
        .map((r, i) => (r.error ? `Item ${Object.keys(localCounts)[i]}: ${r.error.message}` : null))
        .filter(Boolean);
      if (errors.length > 0) {
        throw new Error(`${errors.length} item(s) failed to save:\n${errors.join("\n")}`);
      }

      // Update stock_take summary
      const totalCounted = items.filter((i) => getCountedValue(i) !== null).length;
      const totalVariance = items.reduce((sum, i) => sum + (getVariance(i) ?? 0), 0);

      const { error: summaryErr } = await supabase
        .from("stock_takes")
        .update({
          total_counted: totalCounted,
          total_variance: totalVariance,
          variance_value: summary.totalVarianceValue,
          updated_at: new Date().toISOString(),
        })
        .eq("id", stockTakeId);
      if (summaryErr) throw summaryErr;
    },
    onSuccess: () => {
      // Clear local counts only after successful save; re-fetch will
      // populate items with the persisted values so getVariance keeps working.
      queryClient.invalidateQueries({ queryKey: ["stock-take-items", stockTakeId] });
      queryClient.invalidateQueries({ queryKey: ["stock-take", stockTakeId] });
      setLocalCounts({});
      toast.success(t("products.stockTake.draftSaved") || "Draft saved");
    },
    onError: (err: Error) => {
      // Don't clear localCounts on error so the user can retry
      console.error("[StockTake] saveDraft errors:", err.message);
      toast.error(t("products.stockTake.saveError") || "Failed to save draft");
    },
  });

  const discardMutation = useMutation({
    mutationFn: async () => {
      await supabase.from("stock_take_items").delete().eq("stock_take_id", stockTakeId);
      await supabase.from("stock_takes").delete().eq("id", stockTakeId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-takes", tenantId] });
      toast.success(t("products.stockTake.discarded") || "Stock take discarded");
      onBack();
    },
    onError: () => {
      toast.error(t("products.stockTake.discardError") || "Failed to discard stock take");
    },
  });

  const applyAdjustmentsMutation = useMutation({
    mutationFn: async () => {
      // 1. Save all pending counts first
      await saveDraftMutation.mutateAsync();

      // 2. For each item with a variance, update product stock and create inventory_history
      const itemsWithVariance = items.filter((i) => {
        const v = getVariance(i);
        return v !== null && v !== 0;
      });

      const errors: string[] = [];

      for (const item of itemsWithVariance) {
        const variance = getVariance(item) ?? 0;
        const counted = getCountedValue(item) ?? 0;
        const productName = item.product?.name ?? item.product_id;

        // Update product stock_quantity
        const { error: stockErr } = await supabase
          .from("products")
          .update({ stock_quantity: counted })
          .eq("id", item.product_id);
        if (stockErr) {
          errors.push(`${productName}: stock update failed — ${stockErr.message}`);
          continue;
        }

        // Create inventory_history entry
        const { error: histErr } = await supabase.from("inventory_history").insert({
          product_id: item.product_id,
          change_type: "stock_take",
          quantity_change: variance,
          quantity_before: item.expected_quantity,
          quantity_after: counted,
          reference_id: stockTakeId,
          notes: `Stock take adjustment: ${bulkReason.replace(/_/g, " ")}`,
          tenant_id: tenantId,
        });
        if (histErr) {
          errors.push(`${productName}: history insert failed — ${histErr.message}`);
          continue;
        }

        // Update reason on the item
        const { error: reasonErr } = await supabase
          .from("stock_take_items")
          .update({ reason: bulkReason })
          .eq("id", item.id);
        if (reasonErr) {
          errors.push(`${productName}: reason update failed — ${reasonErr.message}`);
        }
      }

      // If any item-level errors occurred, don't mark as completed
      if (errors.length > 0) {
        throw new Error(
          `${errors.length} error(s) applying adjustments:\n${errors.join("\n")}`
        );
      }

      // 3. Mark stock_take as completed only when all adjustments succeeded
      const totalCounted = items.filter((i) => getCountedValue(i) !== null).length;
      const totalVariance = items.reduce((sum, i) => sum + (getVariance(i) ?? 0), 0);

      const { error: completeErr } = await supabase
        .from("stock_takes")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          total_counted: totalCounted,
          total_variance: totalVariance,
          variance_value: summary.totalVarianceValue,
          updated_at: new Date().toISOString(),
        })
        .eq("id", stockTakeId);
      if (completeErr) throw completeErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock-takes", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["stock-take", stockTakeId] });
      toast.success(t("products.stockTake.applied") || "Adjustments applied successfully");
      setShowConfirmModal(false);
      onBack();
    },
    onError: (err: Error) => {
      console.error("[StockTake] applyAdjustments errors:", err.message);
      toast.error(t("products.stockTake.applyError") || "Failed to apply adjustments");
    },
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCountChange = useCallback(
    (itemId: string, value: number) => {
      setLocalCounts((prev) => ({ ...prev, [itemId]: Math.max(0, value) }));
      // Persist individually
      updateCountMutation.mutate({ itemId, count: Math.max(0, value) });
    },
    [updateCountMutation]
  );

  const handleCountKeyDown = useCallback(
    (e: React.KeyboardEvent, itemId: string) => {
      if (e.key === "Enter" && quickCountMode) {
        e.preventDefault();
        // Find next uncounted item
        const currentIdx = filteredItems.findIndex((i) => i.id === itemId);
        for (let i = currentIdx + 1; i < filteredItems.length; i++) {
          if (getCountedValue(filteredItems[i]) === null) {
            const ref = countInputRefs.current.get(filteredItems[i].id);
            if (ref) {
              ref.focus();
              ref.select();
            }
            return;
          }
        }
        // Wrap around
        for (let i = 0; i < currentIdx; i++) {
          if (getCountedValue(filteredItems[i]) === null) {
            const ref = countInputRefs.current.get(filteredItems[i].id);
            if (ref) {
              ref.focus();
              ref.select();
            }
            return;
          }
        }
      }
    },
    [filteredItems, quickCountMode, getCountedValue]
  );

  const handleExportCSV = useCallback(() => {
    const headers = ["Product", "SKU", "Location", "Expected", "Counted", "Variance", "Status"];
    const rows = items.map((item) => {
      const counted = getCountedValue(item);
      const variance = getVariance(item);
      const status = counted === null ? "Pending" : variance === 0 ? "Match" : (variance ?? 0) < 0 ? "Short" : "Over";
      return [
        item.product?.name ?? "",
        item.product?.sku ?? "",
        item.location?.name ?? "",
        item.expected_quantity,
        counted ?? "",
        variance ?? "",
        status,
      ];
    });

    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stock-take-${stockTakeId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t("products.stockTake.exported") || "CSV exported");
  }, [items, getCountedValue, getVariance, stockTakeId, t]);

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loadingSession || loadingItems) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-muted" />
      </div>
    );
  }

  if (!stockTake) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <AlertTriangle className="w-10 h-10 text-muted/40" />
        <p className="text-muted">{t("products.stockTake.notFound") || "Stock take not found"}</p>
        <button onClick={onBack} className="text-sm text-blue-600 hover:underline">
          {t("products.stockTake.goBack") || "Go back"}
        </button>
      </div>
    );
  }

  const filterTabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: t("products.stockTake.filterAll") || "All" },
    { key: "uncounted", label: t("products.stockTake.filterUncounted") || "Uncounted" },
    { key: "discrepancies", label: t("products.stockTake.filterDiscrepancies") || "Discrepancies" },
    { key: "by_location", label: t("products.stockTake.filterByLocation") || "By Location" },
  ];

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "name", label: t("products.stockTake.sortName") || "Name" },
    { value: "location", label: t("products.stockTake.sortLocation") || "Location" },
    { value: "variance", label: t("products.stockTake.sortVariance") || "Variance" },
    { value: "status", label: t("products.stockTake.sortStatus") || "Status" },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex-shrink-0 space-y-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 hover:bg-[var(--background)] rounded-xl transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-foreground">{stockTake.name}</h2>
              <div className="flex items-center gap-3 mt-0.5">
                <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", STATUS_STYLES[stockTake.status])}>
                  {stockTake.status === "in_progress" ? "In Progress" : stockTake.status === "completed" ? "Completed" : "Cancelled"}
                </span>
                {!readOnly && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Timer className="w-3.5 h-3.5" />
                    {formatDuration(stockTake.created_at)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          {!readOnly && (
            <div className="flex items-center gap-2">
              {/* Quick Count Toggle */}
              <button
                onClick={() => setQuickCountMode(!quickCountMode)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors border",
                  quickCountMode
                    ? "bg-blue-50 border-blue-200 text-blue-700"
                    : "bg-[var(--background)] border-[var(--card-border)] text-muted hover:text-foreground"
                )}
              >
                {quickCountMode ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                {t("products.stockTake.quickCount") || "Quick Count"}
              </button>

              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-xs font-medium text-muted hover:text-foreground transition-colors"
              >
                <Download className="w-4 h-4" />
                {t("products.stockTake.exportCSV") || "Export CSV"}
              </button>

              <button
                onClick={() => saveDraftMutation.mutate()}
                disabled={saveDraftMutation.isPending}
                className="flex items-center gap-2 px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-xs font-medium text-foreground hover:bg-[var(--card-bg)] transition-colors disabled:opacity-50"
              >
                {saveDraftMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t("products.stockTake.saveDraft") || "Save Draft"}
              </button>

              <button
                onClick={() => setShowDiscardConfirm(true)}
                className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium text-rose-600 hover:bg-rose-100 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                {t("products.stockTake.discard") || "Discard"}
              </button>

              <button
                onClick={() => setShowConfirmModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-foreground text-background rounded-xl text-xs font-medium hover:opacity-90 transition-opacity"
              >
                <Check className="w-4 h-4" />
                {t("products.stockTake.applyAdjustments") || "Apply Adjustments"}
              </button>
            </div>
          )}

          {readOnly && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-sm font-medium text-foreground hover:bg-[var(--card-bg)] transition-colors"
            >
              <Download className="w-4 h-4" />
              {t("products.stockTake.exportCSV") || "Export CSV"}
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-foreground font-medium">
              {summary.countedCount}/{items.length} {t("products.stockTake.productsCounted") || "products counted"}
              <span className="text-muted ml-1">({progress.toFixed(1)}%)</span>
            </span>
          </div>
          <div className="w-full h-2.5 bg-[var(--background)] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("products.stockTake.searchPlaceholder") || "Search by name or SKU..."}
              className="w-full pl-10 px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] text-sm"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-muted hover:text-foreground" />
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center bg-[var(--background)] border border-[var(--card-border)] rounded-xl overflow-hidden">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilterTab(tab.key)}
                className={cn(
                  "px-3 py-2.5 text-xs font-medium transition-colors",
                  filterTab === tab.key
                    ? "bg-foreground text-background"
                    : "text-muted hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Location dropdown when by_location is active */}
          {filterTab === "by_location" && (
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-3 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
            >
              <option value="all">{t("products.stockTake.allLocations") || "All Locations"}</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          )}

          {/* Sort */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-3.5 h-3.5 text-muted" />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="px-2 py-2.5 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Product Counting Table */}
      <div className="flex-1 min-h-0 overflow-auto bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <FileSpreadsheet className="w-10 h-10 text-muted/40" />
            <p className="text-sm text-muted">
              {search
                ? t("products.stockTake.noSearchResults") || "No products match your search"
                : t("products.stockTake.noItems") || "No items in this view"}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--card-bg)] z-10">
              <tr className="border-b border-[var(--card-border)] text-muted text-left">
                <th className="px-4 py-3 font-medium w-[40%]">{t("products.stockTake.colProduct") || "Product"}</th>
                <th className="px-4 py-3 font-medium">{t("products.stockTake.colLocation") || "Location"}</th>
                <th className="px-4 py-3 font-medium text-right">{t("products.stockTake.colExpected") || "Expected"}</th>
                <th className="px-4 py-3 font-medium text-center w-[160px]">{t("products.stockTake.colCounted") || "Counted"}</th>
                <th className="px-4 py-3 font-medium text-right">{t("products.stockTake.colVariance") || "Variance"}</th>
                <th className="px-4 py-3 font-medium text-center">{t("products.stockTake.colStatus") || "Status"}</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filteredItems.map((item) => {
                  const counted = getCountedValue(item);
                  const variance = getVariance(item);
                  const status = counted === null ? "pending" : variance === 0 ? "match" : (variance ?? 0) < 0 ? "short" : "over";

                  return (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={cn(
                        "border-b border-[var(--card-border)] last:border-0 transition-colors",
                        !readOnly && getVarianceRowClass({ ...item, counted_quantity: counted, variance })
                      )}
                    >
                      {/* Product */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {item.product?.image_url ? (
                            <img
                              src={item.product.image_url}
                              alt=""
                              className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-[var(--background)] flex items-center justify-center flex-shrink-0">
                              <Package className="w-4 h-4 text-muted" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-foreground font-medium truncate">
                              {item.product?.name ?? "Unknown"}
                            </p>
                            <p className="text-xs text-muted">{item.product?.sku ?? ""}</p>
                          </div>
                        </div>
                      </td>

                      {/* Location */}
                      <td className="px-4 py-3">
                        {item.location ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted bg-[var(--background)] px-2 py-1 rounded-lg">
                            <MapPin className="w-3 h-3" />
                            {item.location.name}
                          </span>
                        ) : (
                          <span className="text-xs text-muted/40">--</span>
                        )}
                      </td>

                      {/* Expected */}
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {item.expected_quantity}
                      </td>

                      {/* Counted */}
                      <td className="px-4 py-3">
                        {readOnly ? (
                          <div className="text-center tabular-nums text-foreground">
                            {counted ?? "--"}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleCountChange(item.id, (counted ?? 0) - 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-muted hover:text-foreground hover:border-foreground/20 transition-colors"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <input
                              ref={(el) => {
                                if (el) countInputRefs.current.set(item.id, el);
                              }}
                              type="number"
                              min={0}
                              value={counted ?? ""}
                              onChange={(e) => {
                                const val = e.target.value === "" ? null : parseInt(e.target.value, 10);
                                if (val !== null && !isNaN(val)) {
                                  handleCountChange(item.id, val);
                                }
                              }}
                              onKeyDown={(e) => handleCountKeyDown(e, item.id)}
                              placeholder="--"
                              className="w-16 text-center px-2 py-1.5 bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-foreground text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                              onClick={() => handleCountChange(item.id, (counted ?? 0) + 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-lg bg-[var(--background)] border border-[var(--card-border)] text-muted hover:text-foreground hover:border-foreground/20 transition-colors"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Variance */}
                      <td className="px-4 py-3 text-right tabular-nums">
                        {variance !== null ? (
                          <span
                            className={cn(
                              "font-medium",
                              variance === 0
                                ? "text-emerald-600"
                                : variance < 0
                                ? "text-rose-600"
                                : "text-amber-600"
                            )}
                          >
                            {variance > 0 ? "+" : ""}
                            {variance}
                          </span>
                        ) : (
                          <span className="text-muted/40">--</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        {status === "match" && (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600" title="Match">
                            <Check className="w-4 h-4" />
                          </span>
                        )}
                        {status === "short" && (
                          <span className="inline-flex items-center gap-1 text-xs text-rose-600" title="Short">
                            <AlertTriangle className="w-4 h-4" />
                          </span>
                        )}
                        {status === "over" && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600" title="Over">
                            <Package className="w-4 h-4" />
                          </span>
                        )}
                        {status === "pending" && (
                          <span className="inline-flex items-center gap-1 text-xs text-muted/50" title="Pending">
                            <Clock className="w-4 h-4" />
                          </span>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>

      {/* Summary Bar (sticky bottom) */}
      <div className="flex-shrink-0 mt-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-emerald-600">
            <Check className="w-4 h-4" />
            {summary.matched} {t("products.stockTake.match") || "Match"}
          </span>
          <span className="flex items-center gap-1.5 text-rose-600">
            <AlertTriangle className="w-4 h-4" />
            {summary.shortCount} {t("products.stockTake.short") || "Short"}{" "}
            <span className="text-xs text-rose-500">(-{summary.shortUnits})</span>
          </span>
          <span className="flex items-center gap-1.5 text-amber-600">
            <Package className="w-4 h-4" />
            {summary.overCount} {t("products.stockTake.over") || "Over"}{" "}
            <span className="text-xs text-amber-500">(+{summary.overUnits})</span>
          </span>
        </div>
        <div className="text-sm font-medium text-foreground">
          {t("products.stockTake.varianceCost") || "Variance value"}:{" "}
          <span className={cn(summary.totalVarianceValue > 0 ? "text-rose-600" : "text-emerald-600")}>
            {formatIQD(summary.totalVarianceValue)}
          </span>
        </div>
      </div>

      {/* ── Discard Confirmation Modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {showDiscardConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowDiscardConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 w-full max-w-md shadow-xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-foreground font-bold">
                    {t("products.stockTake.discardTitle") || "Discard Stock Take?"}
                  </h3>
                  <p className="text-sm text-muted">
                    {t("products.stockTake.discardMessage") || "This will permanently delete this stock take session and all counts."}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowDiscardConfirm(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors rounded-xl"
                >
                  {t("products.stockTake.cancel") || "Cancel"}
                </button>
                <button
                  onClick={() => discardMutation.mutate()}
                  disabled={discardMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-medium hover:bg-rose-700 transition-colors disabled:opacity-50"
                >
                  {discardMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t("products.stockTake.confirmDiscard") || "Discard"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Apply Adjustments Confirmation Modal ───────────────────────────── */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setShowConfirmModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 w-full max-w-lg shadow-xl"
            >
              <h3 className="text-foreground font-bold text-lg mb-4">
                {t("products.stockTake.applyTitle") || "Apply Stock Adjustments"}
              </h3>

              {/* Variance Summary */}
              <div className="bg-[var(--background)] rounded-xl p-4 mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">{t("products.stockTake.totalProducts") || "Total products"}</span>
                  <span className="text-foreground font-medium">{items.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted">{t("products.stockTake.totalCounted") || "Counted"}</span>
                  <span className="text-foreground font-medium">{summary.countedCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-600">{t("products.stockTake.matchingItems") || "Matching"}</span>
                  <span className="text-emerald-600 font-medium">{summary.matched}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-rose-600">{t("products.stockTake.shortItems") || "Short"}</span>
                  <span className="text-rose-600 font-medium">
                    {summary.shortCount} (-{summary.shortUnits} units)
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-amber-600">{t("products.stockTake.overItems") || "Over"}</span>
                  <span className="text-amber-600 font-medium">
                    {summary.overCount} (+{summary.overUnits} units)
                  </span>
                </div>
                <div className="border-t border-[var(--card-border)] pt-2 flex justify-between text-sm font-bold">
                  <span className="text-foreground">{t("products.stockTake.varianceCost") || "Variance value"}</span>
                  <span className="text-rose-600">{formatIQD(summary.totalVarianceValue)}</span>
                </div>
              </div>

              {/* Reason Selection */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-foreground mb-2">
                  {t("products.stockTake.adjustmentReason") || "Adjustment Reason"}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {REASON_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setBulkReason(option.value)}
                      className={cn(
                        "px-3 py-2.5 rounded-xl text-xs font-medium border transition-colors text-left",
                        bulkReason === option.value
                          ? "bg-foreground text-background border-foreground"
                          : "bg-[var(--background)] border-[var(--card-border)] text-muted hover:text-foreground"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl mb-5">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  {t("products.stockTake.applyWarning") ||
                    "This will update stock quantities for all products with discrepancies and cannot be undone."}
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors rounded-xl"
                >
                  {t("products.stockTake.cancel") || "Cancel"}
                </button>
                <button
                  onClick={() => applyAdjustmentsMutation.mutate()}
                  disabled={applyAdjustmentsMutation.isPending}
                  className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {applyAdjustmentsMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t("products.stockTake.confirmApply") || "Apply Adjustments"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
