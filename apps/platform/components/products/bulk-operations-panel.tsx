"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  DollarSign,
  FolderOpen,
  Package,
  Tags,
  Eye,
  EyeOff,
  Download,
  Archive,
  Layers,
  PackageCheck,
  Loader2,
  AlertTriangle,
  Undo2,
  Check,
  Minus,
  Plus,
  Trash2,
  FileSpreadsheet,
  FileText,
  CheckSquare,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn, formatIQD } from "@/lib/utils";
import { CategoryCombobox } from "@/components/products/category-combobox";
import { BulkCategoryConfirmDialog } from "@/components/products/bulk-category-confirm-dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BulkOperationsPanelProps {
  selectedIds: string[];
  totalFilteredCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onClose: () => void;
  onComplete: () => void;
}

type TabKey =
  | "pricing"
  | "category"
  | "stock"
  | "tags"
  | "visibility"
  | "export"
  | "archive";

type PricingMode = "set_price" | "increase_pct" | "decrease_pct" | "set_cost";
type StockMode = "add" | "subtract" | "set";
type ExportFormat = "csv" | "excel";

const UNDO_TIMEOUT = 8000;

const TABS: { key: TabKey; icon: React.ElementType; labelKey: string; fallback: string }[] = [
  { key: "pricing", icon: DollarSign, labelKey: "products.bulk.tabs.pricing", fallback: "Pricing" },
  { key: "category", icon: FolderOpen, labelKey: "products.bulk.tabs.category", fallback: "Category" },
  { key: "stock", icon: Package, labelKey: "products.bulk.tabs.stock", fallback: "Stock" },
  { key: "tags", icon: Tags, labelKey: "products.bulk.tabs.tags", fallback: "Tags" },
  { key: "visibility", icon: Eye, labelKey: "products.bulk.tabs.visibility", fallback: "Visibility" },
  { key: "export", icon: Download, labelKey: "products.bulk.tabs.export", fallback: "Export" },
  { key: "archive", icon: Archive, labelKey: "products.bulk.tabs.archive", fallback: "Archive" },
];

const EXPORT_COLUMNS = [
  { key: "name", label: "Name" },
  { key: "sku", label: "SKU" },
  { key: "price", label: "Price" },
  { key: "cost", label: "Cost" },
  { key: "stock_quantity", label: "Stock" },
  { key: "category", label: "Category" },
  { key: "status", label: "Status" },
  { key: "barcode", label: "Barcode" },
] as const;

const INPUT_CLS =
  "px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BulkOperationsPanel({
  selectedIds,
  totalFilteredCount,
  onSelectAll,
  onClearSelection,
  onClose,
  onComplete,
}: BulkOperationsPanelProps) {
  const { t } = useLanguage();
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

  // -- shared state --
  const [activeTab, setActiveTab] = useState<TabKey>("pricing");
  const [operating, setOperating] = useState(false);

  // -- pricing state --
  const [pricingMode, setPricingMode] = useState<PricingMode>("set_price");
  const [pricingValue, setPricingValue] = useState("");

  // -- category state --
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryConfirmOpen, setCategoryConfirmOpen] = useState(false);

  // -- stock state --
  const [stockMode, setStockMode] = useState<StockMode>("add");
  const [stockValue, setStockValue] = useState("");

  // -- tags state --
  const [tagsToAdd, setTagsToAdd] = useState<string[]>([]);
  const [tagsToRemove, setTagsToRemove] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");

  // -- export state --
  const [exportCols, setExportCols] = useState<Set<string>>(
    new Set(EXPORT_COLUMNS.map((c) => c.key))
  );
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");

  // -- archive state --
  const [archiveConfirmed, setArchiveConfirmed] = useState(false);

  // -- undo state --
  const [undoState, setUndoState] = useState<{ label: string; timeLeft: number; rollback: () => Promise<void> } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearInterval(undoTimerRef.current);
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("categories")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .order("name");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ["product_tags", tenantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("product_tags")
        .select("id, name")
        .eq("tenant_id", tenantId!)
        .order("name");
      return data ?? [];
    },
    enabled: !!tenantId,
  });

  const { data: sharedTags = [] } = useQuery({
    queryKey: ["shared_tags", selectedIds],
    queryFn: async () => {
      if (selectedIds.length === 0) return [];
      const { data } = await supabase
        .from("product_tag_assignments")
        .select("tag_id, product_tags(id, name)")
        .in("product_id", selectedIds);
      if (!data) return [];
      const countMap = new Map<string, { id: string; name: string; count: number }>();
      for (const row of data) {
        const tag = (row as any).product_tags;
        if (!tag) continue;
        const existing = countMap.get(tag.id);
        if (existing) existing.count++;
        else countMap.set(tag.id, { id: tag.id, name: tag.name, count: 1 });
      }
      return Array.from(countMap.values()).filter((t) => t.count === selectedIds.length);
    },
    enabled: selectedIds.length > 0 && activeTab === "tags",
  });

  const { data: selectedProducts = [] } = useQuery({
    queryKey: ["selected_products_preview", selectedIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, price, cost, stock_quantity")
        .in("id", selectedIds.slice(0, 100));
      return data ?? [];
    },
    enabled: selectedIds.length > 0,
  });

  const filteredTags = useMemo(() => {
    if (!tagSearch) return allTags;
    const q = tagSearch.toLowerCase();
    return allTags.filter((t: any) => t.name.toLowerCase().includes(q));
  }, [allTags, tagSearch]);

  // -----------------------------------------------------------------------
  // Pricing preview
  // -----------------------------------------------------------------------

  const pricingPreview = useMemo(() => {
    const val = parseFloat(pricingValue);
    if (isNaN(val) || val <= 0 || selectedProducts.length === 0) return null;
    let total = 0;
    for (const p of selectedProducts) {
      if (pricingMode === "set_price") total += val;
      else if (pricingMode === "set_cost") total += (p.price ?? 0);
      else if (pricingMode === "increase_pct") total += (p.price ?? 0) * (1 + val / 100);
      else total += (p.price ?? 0) * (1 - val / 100);
    }
    return Math.round(total / selectedProducts.length);
  }, [pricingMode, pricingValue, selectedProducts]);

  // -----------------------------------------------------------------------
  // Undo helpers
  // -----------------------------------------------------------------------

  const startUndo = useCallback((label: string, rollback: () => Promise<void>) => {
    setUndoState({ label, timeLeft: UNDO_TIMEOUT, rollback });
    undoTimerRef.current = setInterval(() => {
      setUndoState((prev) => {
        if (!prev) return null;
        const next = prev.timeLeft - 100;
        return next <= 0 ? null : { ...prev, timeLeft: next };
      });
    }, 100);
    undoTimeoutRef.current = setTimeout(() => {
      if (undoTimerRef.current) clearInterval(undoTimerRef.current);
      setUndoState(null);
    }, UNDO_TIMEOUT);
  }, []);

  const handleUndo = useCallback(async () => {
    if (!undoState) return;
    if (undoTimerRef.current) clearInterval(undoTimerRef.current);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    const { rollback } = undoState;
    setUndoState(null);
    try {
      await rollback();
      toast.success(t("products.bulk.undone") || "Undone");
      onComplete();
    } catch {
      toast.error(t("products.bulk.error") || "Operation failed");
    }
  }, [undoState, t, onComplete]);

  // -----------------------------------------------------------------------
  // Invalidation helper
  // -----------------------------------------------------------------------

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["selected_products_preview"] });
    queryClient.invalidateQueries({ queryKey: ["shared_tags"] });
  }, [queryClient]);

  // -----------------------------------------------------------------------
  // Operations
  // -----------------------------------------------------------------------

  const applyPricing = useCallback(async () => {
    const val = parseFloat(pricingValue);
    if (isNaN(val) || val <= 0) return;
    setOperating(true);
    try {
      if (pricingMode === "set_price") {
        await supabase.from("products").update({ price: val }).in("id", selectedIds).eq("tenant_id", tenantId!);
      } else if (pricingMode === "set_cost") {
        await supabase.from("products").update({ cost: val }).in("id", selectedIds).eq("tenant_id", tenantId!);
      } else {
        for (const p of selectedProducts) {
          const newPrice = pricingMode === "increase_pct"
            ? Math.round((p.price ?? 0) * (1 + val / 100))
            : Math.round((p.price ?? 0) * (1 - val / 100));
          await supabase.from("products").update({ price: newPrice }).eq("id", p.id).eq("tenant_id", tenantId!);
        }
      }
      toast.success(t("products.bulk.pricingSuccess") || `Updated pricing for ${selectedIds.length} products`);
      invalidate();
      onComplete();
    } catch {
      toast.error(t("products.bulk.error") || "Operation failed");
    } finally {
      setOperating(false);
    }
  }, [pricingValue, pricingMode, selectedIds, selectedProducts, tenantId, t, invalidate, onComplete]);

  const openCategoryConfirm = useCallback(() => {
    if (selectedIds.length === 0) return;
    setCategoryConfirmOpen(true);
  }, [selectedIds.length]);

  const applyStock = useCallback(async () => {
    const val = parseInt(stockValue, 10);
    if (isNaN(val) || val < 0) return;
    setOperating(true);
    try {
      for (const p of selectedProducts) {
        let newQty: number;
        if (stockMode === "set") newQty = val;
        else if (stockMode === "add") newQty = (p.stock_quantity ?? 0) + val;
        else newQty = Math.max(0, (p.stock_quantity ?? 0) - val);

        await supabase.from("products").update({ stock_quantity: newQty }).eq("id", p.id).eq("tenant_id", tenantId!);
        await supabase.from("inventory_history").insert({
          product_id: p.id,
          tenant_id: tenantId,
          change_type: "adjusted",
          quantity_change: newQty - (p.stock_quantity ?? 0),
          new_quantity: newQty,
          note: `Bulk ${stockMode}: ${val}`,
        });
      }
      toast.success(t("products.bulk.stockSuccess") || `Updated stock for ${selectedIds.length} products`);
      invalidate();
      onComplete();
    } catch {
      toast.error(t("products.bulk.error") || "Operation failed");
    } finally {
      setOperating(false);
    }
  }, [stockValue, stockMode, selectedProducts, selectedIds, tenantId, t, invalidate, onComplete]);

  const applyTags = useCallback(async () => {
    setOperating(true);
    try {
      if (tagsToAdd.length > 0) {
        const rows = selectedIds.flatMap((pid) =>
          tagsToAdd.map((tid) => ({ product_id: pid, tag_id: tid }))
        );
        await supabase.from("product_tag_assignments").upsert(rows, { onConflict: "product_id,tag_id" });
      }
      if (tagsToRemove.length > 0) {
        await supabase
          .from("product_tag_assignments")
          .delete()
          .in("product_id", selectedIds)
          .in("tag_id", tagsToRemove);
      }
      toast.success(t("products.bulk.tagsSuccess") || `Updated tags for ${selectedIds.length} products`);
      invalidate();
      onComplete();
    } catch {
      toast.error(t("products.bulk.error") || "Operation failed");
    } finally {
      setOperating(false);
    }
  }, [tagsToAdd, tagsToRemove, selectedIds, t, invalidate, onComplete]);

  const applyVisibility = useCallback(
    async (visible: boolean) => {
      setOperating(true);
      try {
        await supabase
          .from("products")
          .update({ is_visible: visible })
          .in("id", selectedIds)
          .eq("tenant_id", tenantId!);
        toast.success(
          visible
            ? t("products.bulk.showSuccess") || `${selectedIds.length} products shown`
            : t("products.bulk.hideSuccess") || `${selectedIds.length} products hidden`
        );
        invalidate();
        onComplete();
      } catch {
        toast.error(t("products.bulk.error") || "Operation failed");
      } finally {
        setOperating(false);
      }
    },
    [selectedIds, tenantId, t, invalidate, onComplete]
  );

  // Filler is an operator-side flag: it never changes what the customer can
  // buy, only whether staff see the product up front in the order picker.
  const applyFiller = useCallback(
    async (filler: boolean) => {
      setOperating(true);
      try {
        await supabase
          .from("products")
          .update({ is_filler: filler })
          .in("id", selectedIds)
          .eq("tenant_id", tenantId!);
        toast.success(
          t(filler ? "products.filler.marked" : "products.filler.unmarked", {
            count: String(selectedIds.length),
          })
        );
        invalidate();
        onComplete();
      } catch {
        toast.error(t("products.bulk.error") || "Operation failed");
      } finally {
        setOperating(false);
      }
    },
    [selectedIds, tenantId, t, invalidate, onComplete]
  );

  const handleExport = useCallback(async () => {
    setOperating(true);
    try {
      const cols = Array.from(exportCols);
      const selectCols = cols
        .map((c) => (c === "category" ? "category_id, categories(name)" : c))
        .join(", ");

      const { data } = await supabase
        .from("products")
        .select(selectCols)
        .in("id", selectedIds)
        .eq("tenant_id", tenantId!);

      if (!data || data.length === 0) {
        toast.error(t("products.bulk.noData") || "No data to export");
        return;
      }

      const rows = data.map((row: any) => {
        const mapped: Record<string, any> = {};
        for (const col of cols) {
          if (col === "category") mapped[col] = row.categories?.name ?? "";
          else if (col === "price" || col === "cost") mapped[col] = row[col] ?? 0;
          else mapped[col] = row[col] ?? "";
        }
        return mapped;
      });

      if (exportFormat === "csv") {
        const header = cols.join(",");
        const csvRows = rows.map((r) =>
          cols.map((c) => `"${String(r[c]).replace(/"/g, '""')}"`).join(",")
        );
        const csv = [header, ...csvRows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `products_export_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const XLSX = await import("xlsx");
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Products");
        XLSX.writeFile(wb, `products_export_${Date.now()}.xlsx`);
      }

      toast.success(t("products.bulk.exportSuccess") || `Exported ${data.length} products`);
    } catch {
      toast.error(t("products.bulk.error") || "Export failed");
    } finally {
      setOperating(false);
    }
  }, [exportCols, exportFormat, selectedIds, tenantId, t]);

  const handleArchive = useCallback(async () => {
    setOperating(true);
    try {
      // Snapshot for undo
      const snapshot = selectedProducts.map((p) => ({
        id: p.id,
        status: "active" as const,
      }));

      await supabase
        .from("products")
        .update({ status: "archived", is_visible: false })
        .in("id", selectedIds)
        .eq("tenant_id", tenantId!);

      toast.success(
        t("products.bulk.archiveSuccess") || `${selectedIds.length} products archived`
      );
      invalidate();
      onComplete();

      startUndo(
        `${selectedIds.length} ${t("products.bulk.productsArchived") || "products archived"}`,
        async () => {
          for (const s of snapshot) {
            await supabase
              .from("products")
              .update({ status: s.status, is_visible: true })
              .eq("id", s.id)
              .eq("tenant_id", tenantId!);
          }
          invalidate();
        }
      );
    } catch {
      toast.error(t("products.bulk.error") || "Operation failed");
    } finally {
      setOperating(false);
      setArchiveConfirmed(false);
    }
  }, [selectedIds, selectedProducts, tenantId, t, invalidate, onComplete, startUndo]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const previewNames = selectedProducts.slice(0, 5).map((p) => p.name);
  const moreCount = Math.max(0, selectedIds.length - 5);

  const targetCategoryName = useMemo(() => {
    if (!selectedCategoryId) {
      return t("products.category.uncategorized") || "Uncategorized";
    }
    const cat = (categories as Array<{ id: string; name: string }>).find(
      (c) => c.id === selectedCategoryId
    );
    return cat?.name ?? (t("products.category.uncategorized") || "Uncategorized");
  }, [selectedCategoryId, categories, t]);

  const renderPricingTab = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["set_price", t("products.bulk.setPrice") || "Set price to", "IQD"],
            ["increase_pct", t("products.bulk.increaseBy") || "Increase by %", "%"],
            ["decrease_pct", t("products.bulk.decreaseBy") || "Decrease by %", "%"],
            ["set_cost", t("products.bulk.setCost") || "Set cost to", "IQD"],
          ] as [PricingMode, string, string][]
        ).map(([mode, label, unit]) => (
          <button
            key={mode}
            onClick={() => setPricingMode(mode)}
            disabled={operating}
            className={cn(
              "px-3 py-2 rounded-xl text-sm font-medium transition-colors text-left",
              pricingMode === mode
                ? "bg-[var(--pastel-yellow)] text-foreground font-semibold"
                : "bg-[var(--background)] border border-[var(--card-border)] text-muted hover:text-foreground"
            )}
          >
            {label} <span className="text-xs text-muted">({unit})</span>
          </button>
        ))}
      </div>
      <input
        type="number"
        value={pricingValue}
        onChange={(e) => setPricingValue(e.target.value)}
        placeholder={pricingMode.includes("pct") ? "e.g. 10" : "e.g. 25000"}
        disabled={operating}
        className={cn(INPUT_CLS, "w-full")}
      />
      {pricingPreview !== null && (
        <p className="text-sm text-muted">
          {selectedIds.length} {t("products.bulk.productsAffected") || "products affected"} &middot;{" "}
          {t("products.bulk.avgNewPrice") || "Avg new price"}: {formatIQD(pricingPreview)}
        </p>
      )}
      <button
        onClick={applyPricing}
        disabled={operating || !pricingValue}
        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[var(--pastel-yellow)] text-foreground font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {operating && <Loader2 className="w-4 h-4 animate-spin" />}
        {t("products.bulk.apply") || "Apply"}
      </button>
    </div>
  );

  const renderCategoryTab = () => (
    <div className="space-y-4">
      <CategoryCombobox
        value={selectedCategoryId}
        onChange={setSelectedCategoryId}
        allowUncategorized
      />
      <button
        onClick={openCategoryConfirm}
        disabled={operating || selectedIds.length === 0}
        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[var(--pastel-yellow)] text-foreground font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {operating && <Loader2 className="w-4 h-4 animate-spin" />}
        {t("products.bulk.apply") || "Apply"}
      </button>
    </div>
  );

  const renderStockTab = () => (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(
          [
            ["add", t("products.bulk.addUnits") || "Add units", Plus],
            ["subtract", t("products.bulk.subtractUnits") || "Subtract units", Minus],
            ["set", t("products.bulk.setStock") || "Set stock to", Package],
          ] as [StockMode, string, React.ElementType][]
        ).map(([mode, label, Icon]) => (
          <button
            key={mode}
            onClick={() => setStockMode(mode)}
            disabled={operating}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-colors",
              stockMode === mode
                ? "bg-[var(--pastel-yellow)] text-foreground font-semibold"
                : "bg-[var(--background)] border border-[var(--card-border)] text-muted hover:text-foreground"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>
      <input
        type="number"
        min={0}
        value={stockValue}
        onChange={(e) => setStockValue(e.target.value)}
        placeholder="e.g. 50"
        disabled={operating}
        className={cn(INPUT_CLS, "w-full")}
      />
      <button
        onClick={applyStock}
        disabled={operating || !stockValue}
        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[var(--pastel-yellow)] text-foreground font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {operating && <Loader2 className="w-4 h-4 animate-spin" />}
        {t("products.bulk.apply") || "Apply"}
      </button>
    </div>
  );

  const renderTagsTab = () => (
    <div className="space-y-4">
      {/* Add tags */}
      <div>
        <p className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">
          {t("products.bulk.addTags") || "Add Tags"}
        </p>
        <input
          type="text"
          value={tagSearch}
          onChange={(e) => setTagSearch(e.target.value)}
          placeholder={t("products.bulk.searchTags") || "Search tags..."}
          disabled={operating}
          className={cn(INPUT_CLS, "w-full mb-2")}
        />
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
          {filteredTags.map((tag: any) => {
            const selected = tagsToAdd.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() =>
                  setTagsToAdd((prev) =>
                    selected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                  )
                }
                disabled={operating}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                  selected
                    ? "bg-[var(--pastel-yellow)] text-foreground"
                    : "bg-[var(--background)] border border-[var(--card-border)] text-muted hover:text-foreground"
                )}
              >
                {selected && <Check className="w-3 h-3 inline mr-1" />}
                {tag.name}
              </button>
            );
          })}
        </div>
      </div>
      {/* Remove tags */}
      {sharedTags.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">
            {t("products.bulk.removeTags") || "Remove Shared Tags"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sharedTags.map((tag: any) => {
              const marked = tagsToRemove.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() =>
                    setTagsToRemove((prev) =>
                      marked ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                    )
                  }
                  disabled={operating}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                    marked
                      ? "bg-red-100 text-red-700 line-through"
                      : "bg-[var(--background)] border border-[var(--card-border)] text-muted hover:text-foreground"
                  )}
                >
                  {marked && <Trash2 className="w-3 h-3 inline mr-1" />}
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <button
        onClick={applyTags}
        disabled={operating || (tagsToAdd.length === 0 && tagsToRemove.length === 0)}
        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[var(--pastel-yellow)] text-foreground font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {operating && <Loader2 className="w-4 h-4 animate-spin" />}
        {t("products.bulk.apply") || "Apply"}
      </button>
    </div>
  );

  const renderVisibilityTab = () => (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {t("products.bulk.visibilityDesc") || "Control storefront visibility for selected products."}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => applyVisibility(true)}
          disabled={operating}
          className="flex items-center justify-center gap-2 px-4 py-4 bg-green-50 border border-green-200 text-green-700 rounded-xl font-semibold hover:bg-green-100 transition-colors disabled:opacity-50"
        >
          {operating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          {t("products.bulk.showOnStorefront") || "Show on Storefront"}
        </button>
        <button
          onClick={() => applyVisibility(false)}
          disabled={operating}
          className="flex items-center justify-center gap-2 px-4 py-4 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          {operating ? <Loader2 className="w-4 h-4 animate-spin" /> : <EyeOff className="w-4 h-4" />}
          {t("products.bulk.hideFromStorefront") || "Hide from Storefront"}
        </button>
      </div>

      <div className="pt-3 border-t border-[var(--card-border)] space-y-3">
        <p className="text-sm text-muted">{t("products.filler.hint")}</p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => applyFiller(true)}
            disabled={operating}
            className="flex items-center justify-center gap-2 px-4 py-4 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-semibold hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            {operating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
            {t("products.filler.mark")}
          </button>
          <button
            onClick={() => applyFiller(false)}
            disabled={operating}
            className="flex items-center justify-center gap-2 px-4 py-4 bg-[var(--background)] border border-[var(--card-border)] text-foreground rounded-xl font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {operating ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageCheck className="w-4 h-4" />}
            {t("products.filler.unmark")}
          </button>
        </div>
      </div>
    </div>
  );

  const renderExportTab = () => (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-muted mb-2 uppercase tracking-wide">
          {t("products.bulk.columns") || "Columns"}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {EXPORT_COLUMNS.map((col) => {
            const checked = exportCols.has(col.key);
            return (
              <label
                key={col.key}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-xl text-sm cursor-pointer transition-colors",
                  checked
                    ? "bg-[var(--pastel-yellow)] text-foreground font-medium"
                    : "bg-[var(--background)] border border-[var(--card-border)] text-muted"
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(exportCols);
                    if (checked) next.delete(col.key);
                    else next.add(col.key);
                    setExportCols(next);
                  }}
                  className="sr-only"
                />
                <CheckSquare className={cn("w-3.5 h-3.5", checked ? "opacity-100" : "opacity-30")} />
                {col.label}
              </label>
            );
          })}
        </div>
      </div>
      <div className="flex gap-2">
        {(["csv", "excel"] as ExportFormat[]).map((fmt) => (
          <button
            key={fmt}
            onClick={() => setExportFormat(fmt)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors",
              exportFormat === fmt
                ? "bg-[var(--pastel-yellow)] text-foreground font-semibold"
                : "bg-[var(--background)] border border-[var(--card-border)] text-muted hover:text-foreground"
            )}
          >
            {fmt === "csv" ? <FileText className="w-4 h-4" /> : <FileSpreadsheet className="w-4 h-4" />}
            {fmt.toUpperCase()}
          </button>
        ))}
      </div>
      <button
        onClick={handleExport}
        disabled={operating || exportCols.size === 0}
        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-[var(--pastel-yellow)] text-foreground font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {operating && <Loader2 className="w-4 h-4 animate-spin" />}
        <Download className="w-4 h-4" />
        {t("products.bulk.exportSelected") || "Export Selected"}
      </button>
    </div>
  );

  const renderArchiveTab = () => (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
        <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-700">
            {(t("products.bulk.archiveWarning") || "This will archive {count} products.").replace(
              "{count}",
              String(selectedIds.length)
            )}
          </p>
          <p className="text-xs text-red-500 mt-0.5">
            {t("products.bulk.archiveWarningDesc") || "They will be hidden from the storefront."}
          </p>
        </div>
      </div>
      {previewNames.length > 0 && (
        <div className="text-sm text-muted">
          {previewNames.map((name, i) => (
            <span key={i}>
              {name}
              {i < previewNames.length - 1 && ", "}
            </span>
          ))}
          {moreCount > 0 && (
            <span className="text-xs ml-1">
              +{moreCount} {t("products.bulk.more") || "more"}
            </span>
          )}
        </div>
      )}
      {!archiveConfirmed ? (
        <button
          onClick={() => setArchiveConfirmed(true)}
          disabled={operating}
          className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
        >
          <Archive className="w-4 h-4" />
          {t("products.bulk.archive") || "Archive"}
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={handleArchive}
            disabled={operating}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {operating && <Loader2 className="w-4 h-4 animate-spin" />}
            {t("products.bulk.confirmArchive") || "Yes, Archive"}
          </button>
          <button
            onClick={() => setArchiveConfirmed(false)}
            disabled={operating}
            className="px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] text-foreground rounded-xl font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {t("products.bulk.cancel") || "Cancel"}
          </button>
        </div>
      )}
    </div>
  );

  const tabContent: Record<TabKey, () => React.ReactNode> = {
    pricing: renderPricingTab,
    category: renderCategoryTab,
    stock: renderStockTab,
    tags: renderTagsTab,
    visibility: renderVisibilityTab,
    export: renderExportTab,
    archive: renderArchiveTab,
  };

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <>
      {/* Undo snackbar */}
      <AnimatePresence>
        {undoState && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-[340px] left-1/2 -translate-x-1/2 z-[60]"
          >
            <div className="flex items-center gap-3 px-5 py-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl">
              <span className="text-sm text-foreground font-medium">{undoState.label}</span>
              <button
                onClick={handleUndo}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--pastel-yellow)] text-amber-900 rounded-lg text-xs font-bold hover:opacity-90 transition-colors"
              >
                <Undo2 className="w-3.5 h-3.5" />
                {t("products.bulk.undo") || "Undo"}
              </button>
              <div className="w-16 h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-amber-400 rounded-full"
                  initial={{ width: "100%" }}
                  animate={{ width: `${(undoState.timeLeft / UNDO_TIMEOUT) * 100}%` }}
                  transition={{ duration: 0.1, ease: "linear" }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Panel */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed bottom-0 inset-x-0 z-50 bg-[var(--card-bg)] border-t border-[var(--card-border)] rounded-t-2xl shadow-2xl"
            style={{ height: 320 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--card-border)]">
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold text-foreground">
                  {selectedIds.length}{" "}
                  <span className="text-sm font-normal text-muted">
                    {t("products.bulk.productsSelected") || "products selected"}
                  </span>
                </span>
                {selectedIds.length < totalFilteredCount && (
                  <button
                    onClick={onSelectAll}
                    className="px-3 py-1 text-xs font-medium bg-[var(--background)] border border-[var(--card-border)] rounded-lg text-muted hover:text-foreground transition-colors"
                  >
                    {(t("products.bulk.selectAllFiltered") || "Select All Filtered ({n})").replace(
                      "{n}",
                      String(totalFilteredCount)
                    )}
                  </button>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-[var(--background)] transition-colors"
              >
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 px-5 py-2 border-b border-[var(--card-border)] overflow-x-auto scrollbar-hide">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors",
                      isActive
                        ? "bg-[var(--pastel-yellow)] text-foreground font-semibold"
                        : "text-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t(tab.labelKey) || tab.fallback}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div className="px-5 py-3 overflow-y-auto" style={{ maxHeight: 200 }}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                >
                  {tabContent[activeTab]()}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk category confirm dialog */}
      <BulkCategoryConfirmDialog
        open={categoryConfirmOpen}
        onOpenChange={setCategoryConfirmOpen}
        productIds={selectedIds}
        targetCategoryId={selectedCategoryId}
        targetCategoryName={targetCategoryName}
        previewNames={previewNames}
        onConfirmed={() => {
          onComplete();
        }}
      />
    </>
  );
}
