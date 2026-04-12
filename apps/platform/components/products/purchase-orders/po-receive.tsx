"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  PackageCheck,
  CheckCheck,
  Loader2,
  AlertTriangle,
  Package,
  StickyNote,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn, formatIQD } from "@/lib/utils";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface POItem {
  id: string;
  po_id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  sku: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: number;
  notes: string | null;
}

interface PurchaseOrderForReceive {
  id: string;
  po_number: string;
  supplier_name: string;
  status: string;
  tenant_id: string;
  purchase_order_items: POItem[];
}

interface ReceiveLine {
  itemId: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity_ordered: number;
  previously_received: number;
  remaining: number;
  receiving_now: number;
  notes: string;
}

interface POReceiveProps {
  poId: string;
  onComplete: () => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function POReceive({ poId, onComplete, onCancel }: POReceiveProps) {
  const { tenantId } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const [receiveLines, setReceiveLines] = useState<ReceiveLine[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch PO
  // ---------------------------------------------------------------------------

  const { data: po, isLoading } = useQuery({
    queryKey: ["purchase-order-receive", poId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("id, po_number, supplier_name, status, tenant_id, purchase_order_items(*)")
        .eq("id", poId)
        .eq("tenant_id", tenantId)
        .single();
      if (error) throw error;

      const poData = data as PurchaseOrderForReceive;

      // Initialize receive lines
      const lines: ReceiveLine[] = poData.purchase_order_items.map((item) => {
        const remaining = item.quantity_ordered - item.quantity_received;
        return {
          itemId: item.id,
          product_id: item.product_id,
          product_name: item.product_name,
          sku: item.sku,
          quantity_ordered: item.quantity_ordered,
          previously_received: item.quantity_received,
          remaining: Math.max(0, remaining),
          receiving_now: Math.max(0, remaining),
          notes: "",
        };
      });
      setReceiveLines(lines);

      return poData;
    },
    enabled: !!poId && !!tenantId,
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const updateReceiving = (itemId: string, value: number) => {
    setReceiveLines((prev) =>
      prev.map((l) =>
        l.itemId === itemId
          ? { ...l, receiving_now: Math.max(0, Math.min(value, l.remaining)) }
          : l
      )
    );
  };

  const updateItemNotes = (itemId: string, value: string) => {
    setReceiveLines((prev) =>
      prev.map((l) =>
        l.itemId === itemId ? { ...l, notes: value } : l
      )
    );
  };

  const receiveAll = () => {
    setReceiveLines((prev) =>
      prev.map((l) => ({ ...l, receiving_now: l.remaining }))
    );
  };

  // Summary
  const summary = useMemo(() => {
    const itemsToReceive = receiveLines.filter((l) => l.receiving_now > 0);
    const totalUnits = itemsToReceive.reduce(
      (sum, l) => sum + l.receiving_now,
      0
    );
    return { itemCount: itemsToReceive.length, totalUnits };
  }, [receiveLines]);

  const allFullyReceived = useMemo(() => {
    return receiveLines.every(
      (l) => l.previously_received + l.receiving_now >= l.quantity_ordered
    );
  }, [receiveLines]);

  // ---------------------------------------------------------------------------
  // Receive mutation
  // ---------------------------------------------------------------------------

  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId || !po) throw new Error("Missing context");

      const linesToProcess = receiveLines.filter((l) => l.receiving_now > 0);
      if (linesToProcess.length === 0) {
        throw new Error("No items to receive");
      }

      const errors: string[] = [];

      // Process each line (best-effort: collect errors but continue)
      for (const line of linesToProcess) {
        try {
          // 1. Update purchase_order_items quantity_received
          const newReceived = line.previously_received + line.receiving_now;
          const { error: itemErr } = await supabase
            .from("purchase_order_items")
            .update({ quantity_received: newReceived })
            .eq("id", line.itemId);
          if (itemErr) {
            errors.push(`${line.product_name}: failed to update PO item — ${itemErr.message}`);
            continue;
          }

          // 2. Read current stock immediately before update to minimise TOCTOU window.
          // NOTE: A true atomic increment would require a Supabase RPC / database function.
          // This read-then-write is still susceptible to concurrent receives overwriting
          // each other. For production-critical stock, consider an `increment_stock` RPC.
          const { data: product, error: prodErr } = await supabase
            .from("products")
            .select("stock_quantity")
            .eq("id", line.product_id)
            .single();
          if (prodErr) {
            errors.push(`${line.product_name}: failed to read stock — ${prodErr.message}`);
            continue;
          }

          const stockBefore = product?.stock_quantity ?? 0;
          const stockAfter = stockBefore + line.receiving_now;

          // 3. Update product stock
          const { error: stockErr } = await supabase
            .from("products")
            .update({
              stock_quantity: stockAfter,
              updated_at: new Date().toISOString(),
            })
            .eq("id", line.product_id);
          if (stockErr) {
            errors.push(`${line.product_name}: failed to update stock — ${stockErr.message}`);
            continue;
          }

          // 4. Create inventory history entry (uses stockBefore read just above)
          const { error: histErr } = await supabase
            .from("inventory_history")
            .insert({
              product_id: line.product_id,
              change_type: "received",
              quantity_change: line.receiving_now,
              quantity_before: stockBefore,
              quantity_after: stockAfter,
              reference_id: po.id,
              notes: line.notes.trim()
                ? `PO ${po.po_number}: ${line.notes.trim()}`
                : `Received from PO ${po.po_number}`,
              tenant_id: tenantId,
              created_at: new Date().toISOString(),
            });
          if (histErr) {
            errors.push(`${line.product_name}: failed to create history — ${histErr.message}`);
          }
        } catch (err: any) {
          errors.push(`${line.product_name}: ${err?.message ?? "unknown error"}`);
        }
      }

      // 5. Determine new PO status
      const willBeFullyReceived = receiveLines.every(
        (l) =>
          l.previously_received + l.receiving_now >= l.quantity_ordered
      );

      const newStatus = willBeFullyReceived ? "received" : "partial";
      const poUpdates: Record<string, any> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === "received") {
        poUpdates.received_at = new Date().toISOString();
      }

      const { error: poErr } = await supabase
        .from("purchase_orders")
        .update(poUpdates)
        .eq("id", po.id)
        .eq("tenant_id", tenantId);
      if (poErr) {
        errors.push(`PO status update failed: ${poErr.message}`);
      }

      if (errors.length > 0) {
        throw new Error(
          `${errors.length} error(s) during receiving:\n${errors.join("\n")}`
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-order", poId] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(
        allFullyReceived
          ? t("products.po.fullyReceived") ||
              "All items received. Stock updated!"
          : t("products.po.partiallyReceived") ||
              "Items partially received. Stock updated!"
      );
      onComplete();
    },
    onError: (err: Error) => {
      const msg = err.message || "Failed to receive stock";
      // Show a shorter toast but log full details
      const lines = msg.split("\n");
      toast.error(lines[0]);
      if (lines.length > 1) {
        console.error("[POReceive] Errors:", msg);
      }
      setShowConfirm(false);
    },
  });

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="py-16 text-center text-muted">
        <div className="inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm">
          {t("products.po.loadingReceive") || "Loading order for receiving..."}
        </p>
      </div>
    );
  }

  if (!po) {
    return (
      <div className="py-16 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
        <p className="text-foreground font-medium">
          {t("products.po.notFound") || "Purchase order not found"}
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-green-500" />
              {t("products.po.receiveTitle") || "Receive Stock"}
            </h2>
            <p className="text-sm text-muted">
              {po.po_number} &middot; {po.supplier_name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={receiveAll}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm font-medium text-foreground hover:bg-[var(--background)] transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            {t("products.po.receiveAll") || "Receive All"}
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        {/* Desktop header */}
        <div className="hidden md:grid grid-cols-[2fr_1fr_auto_auto_120px_1fr] gap-4 px-6 py-3 bg-[var(--background)] text-xs font-semibold text-muted uppercase tracking-wider">
          <span>{t("products.po.colProduct") || "Product"}</span>
          <span>{t("products.po.colSKU") || "SKU"}</span>
          <span className="text-center">
            {t("products.po.colOrdered") || "Ordered"}
          </span>
          <span className="text-center">
            {t("products.po.colPrevReceived") || "Prev. Received"}
          </span>
          <span className="text-center">
            {t("products.po.colReceivingNow") || "Receiving Now"}
          </span>
          <span>{t("products.po.colItemNotes") || "Notes"}</span>
        </div>

        {receiveLines.map((line, idx) => {
          const willBeComplete =
            line.previously_received + line.receiving_now >=
            line.quantity_ordered;
          return (
            <div
              key={line.itemId}
              className={cn(
                "grid grid-cols-1 md:grid-cols-[2fr_1fr_auto_auto_120px_1fr] gap-2 md:gap-4 px-6 py-4 items-center",
                idx < receiveLines.length - 1 &&
                  "border-b border-[var(--card-border)]",
                willBeComplete && line.receiving_now > 0 && "bg-green-50/50 dark:bg-green-900/10"
              )}
            >
              {/* Product */}
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-muted flex-shrink-0 md:hidden" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {line.product_name}
                  </p>
                  <p className="text-xs text-muted md:hidden">
                    {line.sku || "No SKU"}
                  </p>
                </div>
              </div>

              {/* SKU */}
              <span className="text-sm text-muted font-mono hidden md:block">
                {line.sku || "—"}
              </span>

              {/* Ordered */}
              <span className="text-sm text-foreground text-center font-medium">
                {line.quantity_ordered}
              </span>

              {/* Previously received */}
              <span className="text-sm text-muted text-center">
                {line.previously_received}
              </span>

              {/* Receiving now */}
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={line.remaining}
                  value={line.receiving_now}
                  onChange={(e) =>
                    updateReceiving(
                      line.itemId,
                      parseInt(e.target.value) || 0
                    )
                  }
                  className={cn(
                    "w-full px-3 py-2 bg-[var(--background)] border rounded-xl text-foreground text-sm text-center focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]",
                    line.receiving_now > 0 && line.receiving_now === line.remaining
                      ? "border-green-400 dark:border-green-600"
                      : "border-[var(--card-border)]"
                  )}
                />
                {line.remaining > 0 && (
                  <span className="absolute -bottom-4 left-0 right-0 text-center text-[10px] text-muted">
                    {t("products.po.maxRemaining") || "max"}: {line.remaining}
                  </span>
                )}
              </div>

              {/* Notes */}
              <input
                type="text"
                value={line.notes}
                onChange={(e) =>
                  updateItemNotes(line.itemId, e.target.value)
                }
                placeholder={
                  t("products.po.itemNotesPlaceholder") || "Notes..."
                }
                className="px-3 py-2 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] w-full"
              />
            </div>
          );
        })}
      </div>

      {/* Summary + Confirm */}
      {!showConfirm ? (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl px-5 py-3">
            <p className="text-sm text-muted">
              {t("products.po.receiveSummaryLabel") || "Summary"}:{" "}
              <span className="text-foreground font-semibold">
                {summary.itemCount}{" "}
                {summary.itemCount === 1
                  ? t("products.po.item") || "item"
                  : t("products.po.items") || "items"}
              </span>{" "}
              {t("products.po.totaling") || "totaling"}{" "}
              <span className="text-foreground font-semibold">
                {summary.totalUnits}{" "}
                {t("products.po.units") || "units"}
              </span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="px-5 py-2.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm font-medium text-foreground hover:bg-[var(--background)] transition-colors"
            >
              {t("products.po.cancelBtn") || "Cancel"}
            </button>
            <button
              onClick={() => {
                if (summary.totalUnits === 0) {
                  toast.error(
                    t("products.po.noUnits") ||
                      "Enter at least 1 unit to receive"
                  );
                  return;
                }
                setShowConfirm(true);
              }}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors"
            >
              <PackageCheck className="w-4 h-4" />
              {t("products.po.confirmReceive") || "Confirm Receiving"}
            </button>
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6"
        >
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-foreground">
                {t("products.po.confirmTitle") || "Confirm Stock Receiving"}
              </h3>
              <p className="text-sm text-muted mt-1">
                {t("products.po.confirmMessage") ||
                  `You are about to receive ${summary.itemCount} item(s) totaling ${summary.totalUnits} unit(s). This will update your inventory. This action cannot be undone.`}
              </p>
              {allFullyReceived && (
                <p className="text-sm text-green-600 dark:text-green-400 font-medium mt-2">
                  {t("products.po.allItemsComplete") ||
                    "All items will be fully received. PO will be marked as completed."}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-5 py-2.5 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm font-medium text-foreground hover:bg-[var(--background)] transition-colors"
            >
              {t("products.po.goBack") || "Go Back"}
            </button>
            <button
              onClick={() => receiveMutation.mutate()}
              disabled={receiveMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {receiveMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PackageCheck className="w-4 h-4" />
              )}
              {receiveMutation.isPending
                ? t("products.po.receiving") || "Receiving..."
                : t("products.po.yesReceive") || "Yes, Receive Stock"}
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
