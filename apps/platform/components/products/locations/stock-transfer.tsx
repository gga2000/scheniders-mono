"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightLeft,
  Search,
  X,
  Loader2,
  AlertTriangle,
  ArrowRight,
  Package,
  MapPin,
  Clock,
  FileText,
  Check,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn, formatIQD } from "@/lib/utils";
import { toast } from "sonner";

interface StockTransferProps {
  onClose: () => void;
  onComplete: () => void;
}

interface Product {
  id: string;
  tenant_id: string;
  name: string;
  sku: string;
  stock_quantity: number;
  cost: number | null;
  price: number | null;
  image_url: string | null;
}

interface StorageLocation {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  type: string;
  parent_id: string | null;
  description: string | null;
  capacity: number | null;
  created_at: string;
}

interface ProductStorageRow {
  id: string;
  product_id: string;
  variant_id: string | null;
  location_id: string;
  quantity: number;
  tenant_id: string;
  updated_at: string;
  storage_locations: StorageLocation;
}

interface InventoryHistoryRow {
  id: string;
  product_id: string;
  variant_id: string | null;
  change_type: string;
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  reference_id: string | null;
  notes: string | null;
  tenant_id: string;
  created_at: string;
}

export function StockTransfer({ onClose, onComplete }: StockTransferProps) {
  const { tenantId } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Product search query
  const { data: searchResults = [], isFetching: isSearching } = useQuery({
    queryKey: ["product-search-transfer", tenantId, productSearch],
    queryFn: async () => {
      if (!tenantId || productSearch.length < 2) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, tenant_id, name, sku, stock_quantity, cost, price, image_url")
        .eq("tenant_id", tenantId)
        .or(`name.ilike.%${productSearch}%,sku.ilike.%${productSearch}%`)
        .limit(10);
      if (error) throw error;
      return data as Product[];
    },
    enabled: !!tenantId && productSearch.length >= 2 && !selectedProduct,
  });

  // Fetch source locations (where product has stock)
  const { data: sourceLocations = [] } = useQuery({
    queryKey: ["product-storage-locations", tenantId, selectedProduct?.id],
    queryFn: async () => {
      if (!selectedProduct || !tenantId) return [];
      const { data, error } = await supabase
        .from("product_storage")
        .select("*, storage_locations(*)")
        .eq("product_id", selectedProduct.id)
        .eq("tenant_id", tenantId)
        .gt("quantity", 0);
      if (error) throw error;
      return data as ProductStorageRow[];
    },
    enabled: !!selectedProduct && !!tenantId,
  });

  // Fetch all locations
  const { data: allLocations = [] } = useQuery({
    queryKey: ["storage-locations", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("storage_locations")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("name");
      if (error) throw error;
      return data as StorageLocation[];
    },
    enabled: !!tenantId,
  });

  // Recent transfers
  const { data: recentTransfers = [] } = useQuery({
    queryKey: ["recent-transfers", tenantId],
    queryFn: async () => {
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("inventory_history")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("change_type", "transfer")
        .gt("quantity_change", 0)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as InventoryHistoryRow[];
    },
    enabled: !!tenantId,
  });

  // Derived values
  const selectedSource = useMemo(
    () => sourceLocations.find((s) => s.location_id === fromLocationId),
    [sourceLocations, fromLocationId]
  );

  const availableQty = selectedSource?.quantity ?? 0;

  const destinationLocations = useMemo(
    () => allLocations.filter((loc) => loc.id !== fromLocationId),
    [allLocations, fromLocationId]
  );

  const selectedDest = useMemo(
    () => allLocations.find((loc) => loc.id === toLocationId),
    [allLocations, toLocationId]
  );

  const parsedQty = parseInt(quantity) || 0;
  const isValid =
    !!selectedProduct &&
    !!fromLocationId &&
    !!toLocationId &&
    fromLocationId !== toLocationId &&
    parsedQty > 0 &&
    parsedQty <= availableQty;

  // Transfer mutation
  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProduct || !selectedSource || !selectedDest || !tenantId) {
        throw new Error("Missing transfer data");
      }

      const sourceCode = selectedSource.storage_locations.code;
      const destCode = selectedDest.code;
      const qty = parsedQty;
      const newSourceQty = availableQty - qty;

      // 1. Update source: decrement or delete
      if (newSourceQty === 0) {
        const { error } = await supabase
          .from("product_storage")
          .delete()
          .eq("id", selectedSource.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("product_storage")
          .update({ quantity: newSourceQty })
          .eq("id", selectedSource.id);
        if (error) throw error;
      }

      // 2. Fetch existing destination row before mutating
      const variantId = selectedSource.variant_id || null;
      const { data: existingDest, error: destFetchError } = await supabase
        .from("product_storage")
        .select("id, quantity")
        .eq("product_id", selectedProduct.id)
        .eq("location_id", toLocationId)
        .eq("tenant_id", tenantId)
        .is("variant_id", variantId)
        .maybeSingle();
      if (destFetchError) throw destFetchError;

      const destQuantityBefore = existingDest?.quantity ?? 0;

      // 3. Update or insert destination
      if (existingDest) {
        const { error: updateError } = await supabase
          .from("product_storage")
          .update({ quantity: existingDest.quantity + qty })
          .eq("id", existingDest.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("product_storage")
          .insert({
            product_id: selectedProduct.id,
            variant_id: variantId,
            location_id: toLocationId,
            quantity: qty,
            tenant_id: tenantId,
          });
        if (insertError) throw insertError;
      }

      // 4. Create inventory history entries
      const historyEntries = [
        {
          product_id: selectedProduct.id,
          variant_id: variantId,
          change_type: "transfer",
          quantity_change: -qty,
          quantity_before: availableQty,
          quantity_after: newSourceQty,
          reference_id: toLocationId,
          notes: `Transfer to ${destCode}${notes ? ` - ${notes}` : ""}`,
          tenant_id: tenantId,
        },
        {
          product_id: selectedProduct.id,
          variant_id: variantId,
          change_type: "transfer",
          quantity_change: qty,
          quantity_before: destQuantityBefore,
          quantity_after: destQuantityBefore + qty,
          reference_id: fromLocationId,
          notes: `Transfer from ${sourceCode}${notes ? ` - ${notes}` : ""}`,
          tenant_id: tenantId,
        },
      ];

      const { error: historyError } = await supabase
        .from("inventory_history")
        .insert(historyEntries);
      if (historyError) throw historyError;

      return { qty, productName: selectedProduct.name, sourceCode, destCode };
    },
    onSuccess: (result) => {
      toast.success(
        `Transferred ${result.qty} units of ${result.productName} from ${result.sourceCode} to ${result.destCode}`
      );
      queryClient.invalidateQueries({ queryKey: ["product-storage"] });
      queryClient.invalidateQueries({ queryKey: ["product-storage-locations"] });
      queryClient.invalidateQueries({ queryKey: ["product-storage-counts"] });
      queryClient.invalidateQueries({ queryKey: ["recent-transfers"] });
      queryClient.invalidateQueries({ queryKey: ["location-stock"] });
      onComplete();
    },
    onError: (err: Error) => {
      toast.error(`Transfer failed: ${err.message}`);
    },
  });

  const handleSelectProduct = useCallback((product: Product) => {
    setSelectedProduct(product);
    setProductSearch(product.name);
    setShowDropdown(false);
    setFromLocationId("");
    setToLocationId("");
    setQuantity("");
  }, []);

  const handleClearProduct = useCallback(() => {
    setSelectedProduct(null);
    setProductSearch("");
    setFromLocationId("");
    setToLocationId("");
    setQuantity("");
  }, []);

  const handleSubmit = useCallback(() => {
    if (!isValid) return;
    if (!showPreview) {
      setShowPreview(true);
      return;
    }
    transferMutation.mutate();
  }, [isValid, showPreview, transferMutation]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-[var(--card-border)]">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            {t("products.locations.transfer") || "Transfer Stock"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-[var(--background)] transition-colors"
          >
            <X className="w-5 h-5 text-muted" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Product Search */}
          <div ref={searchRef} className="relative">
            <label className="block text-sm font-medium text-foreground mb-2">
              {t("products.locations.product") || "Product"}{" "}
              <span className="text-rose-500">*</span>
            </label>
            {selectedProduct ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl">
                {selectedProduct.image_url ? (
                  <img
                    src={selectedProduct.image_url}
                    alt=""
                    className="w-8 h-8 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-[var(--card-border)] flex items-center justify-center">
                    <Package className="w-4 h-4 text-muted" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {selectedProduct.name}
                  </p>
                  <p className="text-xs text-muted">{selectedProduct.sku}</p>
                </div>
                <button
                  type="button"
                  onClick={handleClearProduct}
                  className="p-1.5 rounded-lg hover:bg-[var(--card-border)] transition-colors"
                >
                  <X className="w-4 h-4 text-muted" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    placeholder={
                      t("products.locations.searchProduct") ||
                      "Search by name or SKU..."
                    }
                    className="w-full pl-10 pr-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm"
                  />
                  {isSearching && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted animate-spin" />
                  )}
                </div>

                {/* Dropdown */}
                <AnimatePresence>
                  {showDropdown && searchResults.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute z-10 mt-1 w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-lg overflow-hidden"
                    >
                      {searchResults.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => handleSelectProduct(product)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--background)] transition-colors text-left"
                        >
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt=""
                              className="w-8 h-8 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-[var(--card-border)] flex items-center justify-center">
                              <Package className="w-4 h-4 text-muted" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {product.name}
                            </p>
                            <p className="text-xs text-muted">{product.sku}</p>
                          </div>
                          <span className="text-xs text-muted">
                            {product.stock_quantity} {t("products.locations.inStock") || "in stock"}
                          </span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>

          {/* From Location */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {t("products.locations.fromLocation") || "From Location"}{" "}
              <span className="text-rose-500">*</span>
            </label>
            <select
              value={fromLocationId}
              onChange={(e) => {
                setFromLocationId(e.target.value);
                if (e.target.value === toLocationId) setToLocationId("");
                setQuantity("");
                setShowPreview(false);
              }}
              disabled={!selectedProduct}
              className={cn(
                "w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm",
                !selectedProduct && "opacity-50 cursor-not-allowed"
              )}
            >
              <option value="">
                {t("products.locations.selectSource") || "Select source location..."}
              </option>
              {sourceLocations.map((ps) => {
                const loc = ps.storage_locations;
                return (
                  <option key={ps.id} value={ps.location_id}>
                    {loc.code} - {loc.name} ({ps.quantity} {t("products.locations.units") || "units"})
                  </option>
                );
              })}
            </select>
            {selectedProduct && sourceLocations.length === 0 && (
              <p className="mt-1.5 text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {t("products.locations.noStockLocations") ||
                  "This product has no stock in any location."}
              </p>
            )}
          </div>

          {/* To Location */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {t("products.locations.toLocation") || "To Location"}{" "}
              <span className="text-rose-500">*</span>
            </label>
            <select
              value={toLocationId}
              onChange={(e) => {
                setToLocationId(e.target.value);
                setShowPreview(false);
              }}
              disabled={!fromLocationId}
              className={cn(
                "w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm",
                !fromLocationId && "opacity-50 cursor-not-allowed"
              )}
            >
              <option value="">
                {t("products.locations.selectDestination") ||
                  "Select destination location..."}
              </option>
              {destinationLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} - {loc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {t("products.locations.quantity") || "Quantity"}{" "}
              <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setShowPreview(false);
              }}
              min={1}
              max={availableQty}
              disabled={!toLocationId}
              placeholder={
                availableQty > 0
                  ? `${t("products.locations.max") || "Max"}: ${availableQty}`
                  : "0"
              }
              className={cn(
                "w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm",
                !toLocationId && "opacity-50 cursor-not-allowed"
              )}
            />
            {parsedQty > availableQty && availableQty > 0 && (
              <p className="mt-1.5 text-xs text-rose-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {t("products.locations.exceedsAvailable") ||
                  `Exceeds available quantity (${availableQty})`}
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {t("products.locations.notes") || "Notes"}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={
                t("products.locations.notesPlaceholder") || "Optional transfer notes..."
              }
              className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm resize-none"
            />
          </div>

          {/* Transfer Preview */}
          <AnimatePresence>
            {showPreview && isValid && selectedSource && selectedDest && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-[var(--pastel-yellow)]/20 border border-[var(--pastel-yellow)] rounded-xl space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {t("products.locations.transferPreview") || "Transfer Preview"}
                  </h3>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex-1 p-2 bg-[var(--card-bg)] rounded-lg text-center">
                      <p className="text-xs text-muted">
                        {t("products.locations.from") || "From"}
                      </p>
                      <p className="font-medium text-foreground">
                        {selectedSource.storage_locations.code}
                      </p>
                      <p className="text-xs text-muted">
                        {availableQty} → {availableQty - parsedQty}{" "}
                        {t("products.locations.units") || "units"}
                      </p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-muted shrink-0" />
                    <div className="flex-1 p-2 bg-[var(--card-bg)] rounded-lg text-center">
                      <p className="text-xs text-muted">
                        {t("products.locations.to") || "To"}
                      </p>
                      <p className="font-medium text-foreground">{selectedDest.code}</p>
                      <p className="text-xs text-muted">
                        +{parsedQty} {t("products.locations.units") || "units"}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted text-center">
                    {parsedQty} {t("products.locations.unitsOf") || "units of"}{" "}
                    <span className="font-medium text-foreground">
                      {selectedProduct?.name}
                    </span>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-sm text-muted hover:text-foreground transition-colors"
            >
              {t("products.locations.cancel") || "Cancel"}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!isValid || transferMutation.isPending}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors",
                showPreview
                  ? "bg-[var(--pastel-mint)] text-teal-700 hover:bg-[var(--pastel-green)]"
                  : "bg-[var(--pastel-yellow)] text-amber-800 hover:opacity-90",
                (!isValid || transferMutation.isPending) &&
                  "opacity-50 cursor-not-allowed"
              )}
            >
              {transferMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : showPreview ? (
                <Check className="w-4 h-4" />
              ) : (
                <ArrowRightLeft className="w-4 h-4" />
              )}
              {showPreview
                ? t("products.locations.confirmTransfer") || "Confirm Transfer"
                : t("products.locations.reviewTransfer") || "Review Transfer"}
            </button>
          </div>

          {/* Recent Transfers */}
          {recentTransfers.length > 0 && (
            <div className="pt-4 border-t border-[var(--card-border)]">
              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                {t("products.locations.recentTransfers") || "Recent Transfers"}
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {recentTransfers.map((transfer) => (
                  <div
                    key={transfer.id}
                    className="flex items-center gap-3 px-3 py-2 bg-[var(--background)] rounded-lg text-xs"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5 text-muted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground truncate">
                        {transfer.notes || "Stock transfer"}
                      </p>
                      <p className="text-muted">
                        +{transfer.quantity_change}{" "}
                        {t("products.locations.units") || "units"}
                      </p>
                    </div>
                    <span className="text-muted shrink-0">
                      {formatTime(transfer.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
