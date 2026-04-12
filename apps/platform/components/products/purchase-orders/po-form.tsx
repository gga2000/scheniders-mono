"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Search,
  Package,
  Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn, formatIQD } from "@/lib/utils";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LineItem {
  id: string; // temp client id
  product_id: string;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  sku: string;
  quantity: number;
  unit_cost: number;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string | null;
  cost: number | null;
  price: number | null;
}

interface POFormProps {
  poId?: string;
  onSave: (poId: string) => void;
  onCancel: () => void;
  initialSupplier?: string;
  initialItems?: {
    product_id: string;
    product_name: string;
    sku: string;
    quantity: number;
    unit_cost: number;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _lineCounter = 0;
function nextLineId() {
  return `line_${++_lineCounter}_${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function POForm({
  poId,
  onSave,
  onCancel,
  initialSupplier,
  initialItems,
}: POFormProps) {
  const { tenantId } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const isEdit = !!poId;

  // Form state
  const [supplierName, setSupplierName] = useState(initialSupplier ?? "");
  const [supplierContact, setSupplierContact] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineItem[]>(() => {
    if (initialItems?.length) {
      return initialItems.map((item) => ({
        id: nextLineId(),
        product_id: item.product_id,
        variant_id: null,
        product_name: item.product_name,
        variant_name: null,
        sku: item.sku,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
      }));
    }
    return [];
  });

  // Product search
  const [productSearch, setProductSearch] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Fetch existing PO (edit mode)
  // ---------------------------------------------------------------------------

  const { data: existingPO, isLoading: loadingPO } = useQuery({
    queryKey: ["purchase-order-edit", poId],
    queryFn: async () => {
      if (!poId) return null;
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, purchase_order_items(*)")
        .eq("id", poId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!poId,
  });

  // Populate form from existing PO
  useEffect(() => {
    if (existingPO) {
      setSupplierName(existingPO.supplier_name ?? "");
      setSupplierContact(existingPO.supplier_contact ?? "");
      setSupplierEmail(existingPO.supplier_email ?? "");
      setExpectedDate(existingPO.expected_date ?? "");
      setNotes(existingPO.notes ?? "");
      if (existingPO.purchase_order_items?.length) {
        setLines(
          existingPO.purchase_order_items.map((item: any) => ({
            id: nextLineId(),
            product_id: item.product_id,
            variant_id: item.variant_id,
            product_name: item.product_name,
            variant_name: item.variant_name,
            sku: item.sku ?? "",
            quantity: item.quantity_ordered,
            unit_cost: item.unit_cost,
          }))
        );
      }
    }
  }, [existingPO]);

  // ---------------------------------------------------------------------------
  // Product search query
  // ---------------------------------------------------------------------------

  const { data: productOptions = [] } = useQuery({
    queryKey: ["products-search", tenantId, productSearch],
    queryFn: async () => {
      if (!tenantId || !productSearch.trim()) return [];
      const q = productSearch.trim();
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, cost, price")
        .eq("tenant_id", tenantId)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
        .limit(10);
      if (error) throw error;
      return data as ProductOption[];
    },
    enabled: !!tenantId && productSearch.trim().length >= 2,
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowProductDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ---------------------------------------------------------------------------
  // Line item helpers
  // ---------------------------------------------------------------------------

  const addProduct = (product: ProductOption) => {
    // Don't add duplicate
    const exists = lines.find((l) => l.product_id === product.id);
    if (exists) {
      toast.info(
        t("products.po.alreadyAdded") || "Product already added to this order"
      );
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        id: nextLineId(),
        product_id: product.id,
        variant_id: null,
        product_name: product.name,
        variant_name: null,
        sku: product.sku ?? "",
        quantity: 1,
        unit_cost: product.cost ?? 0,
      },
    ]);
    setProductSearch("");
    setShowProductDropdown(false);
  };

  const updateLine = (
    lineId: string,
    field: "quantity" | "unit_cost",
    value: number
  ) => {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, [field]: value } : l))
    );
  };

  const removeLine = (lineId: string) => {
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  const total = lines.reduce(
    (sum, l) => sum + l.quantity * l.unit_cost,
    0
  );

  // ---------------------------------------------------------------------------
  // Save mutation
  // ---------------------------------------------------------------------------

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      if (!supplierName.trim()) throw new Error("Supplier name is required");
      if (lines.length === 0) throw new Error("Add at least one item");

      let poIdToUse = poId;

      if (isEdit && poIdToUse) {
        // Update existing PO
        const { error: poErr } = await supabase
          .from("purchase_orders")
          .update({
            supplier_name: supplierName.trim(),
            supplier_contact: supplierContact.trim() || null,
            supplier_email: supplierEmail.trim() || null,
            expected_date: expectedDate || null,
            notes: notes.trim() || null,
            total_cost: total,
            updated_at: new Date().toISOString(),
          })
          .eq("id", poIdToUse)
          .eq("tenant_id", tenantId);
        if (poErr) throw poErr;

        // Delete old items and re-insert
        const { error: delErr } = await supabase
          .from("purchase_order_items")
          .delete()
          .eq("po_id", poIdToUse);
        if (delErr) throw delErr;
      } else {
        // Generate PO number
        const { data: maxRow } = await supabase
          .from("purchase_orders")
          .select("po_number")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(1);

        let nextNum = 1;
        if (maxRow && maxRow.length > 0) {
          const match = maxRow[0].po_number.match(/(\d+)$/);
          if (match) nextNum = parseInt(match[1], 10) + 1;
        }
        const poNumber = `PO-${String(nextNum).padStart(5, "0")}`;

        const { data: newPO, error: poErr } = await supabase
          .from("purchase_orders")
          .insert({
            tenant_id: tenantId,
            po_number: poNumber,
            supplier_name: supplierName.trim(),
            supplier_contact: supplierContact.trim() || null,
            supplier_email: supplierEmail.trim() || null,
            status: "draft",
            total_cost: total,
            notes: notes.trim() || null,
            expected_date: expectedDate || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (poErr) throw poErr;
        poIdToUse = newPO.id;
      }

      // Insert items
      const itemRows = lines.map((l) => ({
        po_id: poIdToUse!,
        product_id: l.product_id,
        variant_id: l.variant_id,
        product_name: l.product_name,
        variant_name: l.variant_name,
        sku: l.sku,
        quantity_ordered: l.quantity,
        quantity_received: 0,
        unit_cost: l.unit_cost,
        notes: null,
      }));
      const { error: itemErr } = await supabase
        .from("purchase_order_items")
        .insert(itemRows);
      if (itemErr) throw itemErr;

      return poIdToUse!;
    },
    onSuccess: (savedId) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({
        queryKey: ["purchase-order", savedId],
      });
      toast.success(
        isEdit
          ? t("products.po.updated") || "Purchase order updated"
          : t("products.po.created") || "Purchase order created"
      );
      onSave(savedId);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save purchase order");
    },
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isEdit && loadingPO) {
    return (
      <div className="py-16 text-center text-muted">
        <div className="inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm">
          {t("products.po.loadingForm") || "Loading purchase order..."}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="flex items-center gap-2 text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-xl font-bold text-foreground">
            {isEdit
              ? t("products.po.editTitle") || "Edit Purchase Order"
              : t("products.po.newTitle") || "New Purchase Order"}
          </h2>
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {t("products.po.save") || "Save"}
        </button>
      </div>

      {/* Supplier Info */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground text-sm uppercase tracking-wider">
          {t("products.po.supplierInfo") || "Supplier Information"}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              {t("products.po.supplierName") || "Supplier Name"}{" "}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder={
                t("products.po.supplierNamePlaceholder") ||
                "e.g. Acme Supplies"
              }
              className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              {t("products.po.supplierContact") || "Contact Person"}
            </label>
            <input
              type="text"
              value={supplierContact}
              onChange={(e) => setSupplierContact(e.target.value)}
              placeholder={
                t("products.po.supplierContactPlaceholder") ||
                "e.g. John Doe"
              }
              className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              {t("products.po.supplierEmail") || "Email"}
            </label>
            <input
              type="email"
              value={supplierEmail}
              onChange={(e) => setSupplierEmail(e.target.value)}
              placeholder={
                t("products.po.supplierEmailPlaceholder") ||
                "supplier@example.com"
              }
              className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              {t("products.po.expectedDate") || "Expected Delivery Date"}
            </label>
            <input
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              {t("products.po.notes") || "Notes"}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                t("products.po.notesPlaceholder") || "Optional notes..."
              }
              className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] text-sm"
            />
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-foreground text-sm uppercase tracking-wider">
            {t("products.po.lineItems") || "Order Items"}
          </h3>
          <span className="text-xs text-muted">
            {lines.length}{" "}
            {lines.length === 1
              ? t("products.po.item") || "item"
              : t("products.po.items") || "items"}
          </span>
        </div>

        {/* Product search */}
        <div ref={searchRef} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            value={productSearch}
            onChange={(e) => {
              setProductSearch(e.target.value);
              setShowProductDropdown(true);
            }}
            onFocus={() => setShowProductDropdown(true)}
            placeholder={
              t("products.po.searchProduct") ||
              "Search products by name or SKU..."
            }
            className="w-full pl-9 pr-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
          />

          {/* Dropdown */}
          <AnimatePresence>
            {showProductDropdown && productOptions.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute z-20 top-full mt-1 w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg max-h-60 overflow-y-auto"
              >
                {productOptions.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--background)] transition-colors text-left"
                  >
                    <Package className="w-4 h-4 text-muted flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {p.name}
                      </p>
                      <p className="text-xs text-muted">
                        {p.sku || "No SKU"} &middot;{" "}
                        {t("products.po.costLabel") || "Cost"}:{" "}
                        {formatIQD(p.cost ?? 0)}
                      </p>
                    </div>
                    <Plus className="w-4 h-4 text-muted" />
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Line items list */}
        {lines.length === 0 ? (
          <div className="py-8 text-center text-muted">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              {t("products.po.noItems") ||
                "Search and add products to this order"}
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {/* Desktop header */}
            <div className="hidden md:grid grid-cols-[2fr_1fr_100px_120px_auto_40px] gap-3 px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wider">
              <span>{t("products.po.colProduct") || "Product"}</span>
              <span>{t("products.po.colSKU") || "SKU"}</span>
              <span className="text-center">
                {t("products.po.colQty") || "Qty"}
              </span>
              <span className="text-right">
                {t("products.po.colUnitCost") || "Unit Cost"}
              </span>
              <span className="text-right">
                {t("products.po.colLineTotal") || "Total"}
              </span>
              <span />
            </div>

            <AnimatePresence mode="popLayout">
              {lines.map((line) => (
                <motion.div
                  key={line.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="grid grid-cols-1 md:grid-cols-[2fr_1fr_100px_120px_auto_40px] gap-2 md:gap-3 px-3 py-3 border-b border-[var(--card-border)] last:border-0 items-center"
                >
                  <p className="text-sm font-medium text-foreground truncate">
                    {line.product_name}
                  </p>
                  <span className="text-sm text-muted font-mono truncate">
                    {line.sku || "—"}
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(
                        line.id,
                        "quantity",
                        Math.max(1, parseInt(e.target.value) || 1)
                      )
                    }
                    className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] w-full"
                  />
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={line.unit_cost}
                    onChange={(e) =>
                      updateLine(
                        line.id,
                        "unit_cost",
                        Math.max(0, parseFloat(e.target.value) || 0)
                      )
                    }
                    className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground text-sm text-right focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] w-full"
                  />
                  <span className="text-sm font-medium text-foreground text-right whitespace-nowrap">
                    {formatIQD(line.quantity * line.unit_cost)}
                  </span>
                  <button
                    onClick={() => removeLine(line.id)}
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-muted hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Total */}
            <div className="flex justify-end items-center gap-4 px-3 py-4 border-t border-[var(--card-border)]">
              <span className="text-sm font-semibold text-muted uppercase">
                {t("products.po.total") || "Total"}
              </span>
              <span className="text-lg font-bold text-foreground">
                {formatIQD(total)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-5 py-2.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm font-medium text-foreground hover:bg-[var(--background)] transition-colors"
        >
          {t("products.po.cancelBtn") || "Cancel"}
        </button>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="flex items-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saveMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {isEdit
            ? t("products.po.update") || "Update Order"
            : t("products.po.create") || "Create Order"}
        </button>
      </div>
    </motion.div>
  );
}
