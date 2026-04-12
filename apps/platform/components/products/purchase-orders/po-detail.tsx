"use client";

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Pencil,
  Send,
  CheckCircle2,
  PackageCheck,
  XCircle,
  Printer,
  Truck,
  FileText,
  User,
  Mail,
  Phone,
  Calendar,
  StickyNote,
  Check,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { useLanguage } from "@/hooks/use-language";
import { cn, formatIQD } from "@/lib/utils";
import { toast } from "sonner";

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

interface POItem {
  id: string;
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

interface PurchaseOrderFull {
  id: string;
  po_number: string;
  supplier_name: string;
  supplier_contact: string | null;
  supplier_email: string | null;
  status: POStatus;
  total_cost: number;
  notes: string | null;
  expected_date: string | null;
  sent_at: string | null;
  received_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  purchase_order_items: POItem[];
}

interface PODetailProps {
  poId: string;
  onBack: () => void;
  onEdit: () => void;
  onReceive: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMELINE_STEPS: { key: POStatus; label: string }[] = [
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Sent" },
  { key: "confirmed", label: "Confirmed" },
  { key: "partial", label: "Partial" },
  { key: "received", label: "Received" },
];

const STATUS_ORDER: Record<POStatus, number> = {
  draft: 0,
  sent: 1,
  confirmed: 2,
  partial: 3,
  received: 4,
  cancelled: -1,
};

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PODetail({ poId, onBack, onEdit, onReceive }: PODetailProps) {
  const { tenantId } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  // Fetch PO + items
  const {
    data: po,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["purchase-order", poId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, purchase_order_items(*)")
        .eq("id", poId)
        .eq("tenant_id", tenantId)
        .single();
      if (error) throw error;
      return data as PurchaseOrderFull;
    },
    enabled: !!poId && !!tenantId,
  });

  // Update status mutation
  const updateStatus = useMutation({
    mutationFn: async ({
      status,
      extra,
    }: {
      status: POStatus;
      extra?: Record<string, any>;
    }) => {
      const updates: Record<string, any> = {
        status,
        updated_at: new Date().toISOString(),
        ...extra,
      };
      const { error } = await supabase
        .from("purchase_orders")
        .update(updates)
        .eq("id", poId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-order", poId] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      toast.success(
        t("products.po.statusUpdated") ||
          `Status updated to ${vars.status}`
      );
    },
    onError: () => {
      toast.error(
        t("products.po.statusError") || "Failed to update status"
      );
    },
  });

  const handleSend = () => {
    updateStatus.mutate({
      status: "sent",
      extra: { sent_at: new Date().toISOString() },
    });
  };

  const handleConfirm = () => {
    updateStatus.mutate({ status: "confirmed" });
  };

  const handleCancel = () => {
    updateStatus.mutate({ status: "cancelled" });
  };

  const handlePrint = () => {
    window.print();
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatDateTime = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Derived
  const currentStepIndex = po ? STATUS_ORDER[po.status] : 0;
  const items = po?.purchase_order_items ?? [];
  const totalCost = items.reduce(
    (sum, item) => sum + item.quantity_ordered * item.unit_cost,
    0
  );

  // ---------------------------------------------------------------------------
  // Loading / Error
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="py-16 text-center text-muted">
        <div className="inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-sm">
          {t("products.po.loadingDetail") || "Loading purchase order..."}
        </p>
      </div>
    );
  }

  if (error || !po) {
    return (
      <div className="py-16 text-center">
        <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p className="text-foreground font-medium">
          {t("products.po.notFound") || "Purchase order not found"}
        </p>
        <button
          onClick={onBack}
          className="mt-4 text-sm text-muted hover:text-foreground underline"
        >
          {t("products.po.goBack") || "Go back"}
        </button>
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
      className="space-y-6 print:space-y-4"
    >
      {/* Back + Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">
            {t("products.po.backToList") || "Back to Purchase Orders"}
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {/* PDF / Print */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm font-medium text-foreground hover:bg-[var(--background)] transition-colors"
          >
            <Printer className="w-4 h-4" />
            {t("products.po.print") || "Print / PDF"}
          </button>

          {/* Status-based actions */}
          {po.status === "draft" && (
            <>
              <button
                onClick={onEdit}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl text-sm font-medium text-foreground hover:bg-[var(--background)] transition-colors"
              >
                <Pencil className="w-4 h-4" />
                {t("products.po.edit") || "Edit"}
              </button>
              <button
                onClick={handleSend}
                disabled={updateStatus.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {t("products.po.send") || "Send"}
              </button>
              <button
                onClick={handleCancel}
                disabled={updateStatus.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
              >
                <XCircle className="w-4 h-4" />
                {t("products.po.cancel") || "Cancel"}
              </button>
            </>
          )}

          {po.status === "sent" && (
            <>
              <button
                onClick={handleConfirm}
                disabled={updateStatus.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {t("products.po.markConfirmed") || "Mark Confirmed"}
              </button>
              <button
                onClick={handleCancel}
                disabled={updateStatus.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
              >
                <XCircle className="w-4 h-4" />
                {t("products.po.cancel") || "Cancel"}
              </button>
            </>
          )}

          {po.status === "confirmed" && (
            <>
              <button
                onClick={onReceive}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
              >
                <PackageCheck className="w-4 h-4" />
                {t("products.po.receiveStock") || "Receive Stock"}
              </button>
              <button
                onClick={handleCancel}
                disabled={updateStatus.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors disabled:opacity-50 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
              >
                <XCircle className="w-4 h-4" />
                {t("products.po.cancel") || "Cancel"}
              </button>
            </>
          )}

          {po.status === "partial" && (
            <button
              onClick={onReceive}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 transition-colors"
            >
              <PackageCheck className="w-4 h-4" />
              {t("products.po.receiveMore") || "Receive More Stock"}
            </button>
          )}
        </div>
      </div>

      {/* Header card */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-bold text-foreground">
                {po.po_number}
              </h2>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold",
                  STATUS_COLORS[po.status]
                )}
              >
                {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
              </span>
            </div>
            <p className="text-sm text-muted">
              {t("products.po.createdOn") || "Created on"}{" "}
              {formatDateTime(po.created_at)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted">
              {t("products.po.totalCost") || "Total Cost"}
            </p>
            <p className="text-2xl font-bold text-foreground">
              {formatIQD(po.total_cost || totalCost)}
            </p>
          </div>
        </div>

        {/* Supplier info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--background)] flex items-center justify-center">
              <User className="w-4 h-4 text-muted" />
            </div>
            <div>
              <p className="text-xs text-muted">
                {t("products.po.supplier") || "Supplier"}
              </p>
              <p className="text-sm font-medium text-foreground">
                {po.supplier_name}
              </p>
            </div>
          </div>
          {po.supplier_contact && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--background)] flex items-center justify-center">
                <Phone className="w-4 h-4 text-muted" />
              </div>
              <div>
                <p className="text-xs text-muted">
                  {t("products.po.contact") || "Contact"}
                </p>
                <p className="text-sm font-medium text-foreground">
                  {po.supplier_contact}
                </p>
              </div>
            </div>
          )}
          {po.supplier_email && (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[var(--background)] flex items-center justify-center">
                <Mail className="w-4 h-4 text-muted" />
              </div>
              <div>
                <p className="text-xs text-muted">
                  {t("products.po.email") || "Email"}
                </p>
                <p className="text-sm font-medium text-foreground">
                  {po.supplier_email}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Dates row */}
        <div className="flex flex-wrap gap-6 text-sm">
          {po.expected_date && (
            <div className="flex items-center gap-2 text-muted">
              <Calendar className="w-4 h-4" />
              <span>
                {t("products.po.expectedDate") || "Expected"}:{" "}
                <span className="text-foreground font-medium">
                  {formatDate(po.expected_date)}
                </span>
              </span>
            </div>
          )}
          {po.sent_at && (
            <div className="flex items-center gap-2 text-muted">
              <Send className="w-4 h-4" />
              <span>
                {t("products.po.sentAt") || "Sent"}:{" "}
                <span className="text-foreground font-medium">
                  {formatDate(po.sent_at)}
                </span>
              </span>
            </div>
          )}
          {po.received_at && (
            <div className="flex items-center gap-2 text-muted">
              <PackageCheck className="w-4 h-4" />
              <span>
                {t("products.po.receivedAt") || "Received"}:{" "}
                <span className="text-foreground font-medium">
                  {formatDate(po.received_at)}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Status Timeline */}
      {po.status !== "cancelled" && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
            {t("products.po.timeline") || "Order Progress"}
          </h3>
          <div className="flex items-center justify-between relative">
            {/* Connecting line */}
            <div className="absolute top-4 left-4 right-4 h-0.5 bg-[var(--card-border)]" />
            <div
              className="absolute top-4 left-4 h-0.5 bg-green-500 transition-all duration-500"
              style={{
                width: `${Math.max(0, (currentStepIndex / (TIMELINE_STEPS.length - 1)) * 100)}%`,
                maxWidth: "calc(100% - 2rem)",
              }}
            />

            {TIMELINE_STEPS.map((step, idx) => {
              const isCompleted = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return (
                <div
                  key={step.key}
                  className="relative flex flex-col items-center z-10"
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors",
                      isCompleted
                        ? "bg-green-500 border-green-500 text-white"
                        : isCurrent
                          ? "bg-blue-500 border-blue-500 text-white"
                          : "bg-[var(--card-bg)] border-[var(--card-border)] text-muted"
                    )}
                  >
                    {isCompleted ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-xs mt-2 font-medium",
                      isCompleted || isCurrent
                        ? "text-foreground"
                        : "text-muted"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cancelled banner */}
      {po.status === "cancelled" && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300 font-medium">
            {t("products.po.cancelledBanner") ||
              "This purchase order has been cancelled."}
          </p>
        </div>
      )}

      {/* Items table */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--card-border)]">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted" />
            {t("products.po.items") || "Order Items"} ({items.length})
          </h3>
        </div>

        {/* Desktop header */}
        <div className="hidden md:grid grid-cols-[2fr_1fr_auto_auto_auto_1fr] gap-4 px-6 py-3 bg-[var(--background)] text-xs font-semibold text-muted uppercase tracking-wider">
          <span>{t("products.po.colProduct") || "Product"}</span>
          <span>{t("products.po.colSKU") || "SKU"}</span>
          <span className="text-center">
            {t("products.po.colOrdered") || "Ordered"}
          </span>
          <span className="text-center">
            {t("products.po.colReceived") || "Received"}
          </span>
          <span className="text-right">
            {t("products.po.colUnitCost") || "Unit Cost"}
          </span>
          <span className="text-right">
            {t("products.po.colLineTotal") || "Line Total"}
          </span>
        </div>

        {items.map((item, idx) => {
          const pct =
            item.quantity_ordered > 0
              ? Math.round(
                  (item.quantity_received / item.quantity_ordered) * 100
                )
              : 0;
          return (
            <div
              key={item.id}
              className={cn(
                "grid grid-cols-1 md:grid-cols-[2fr_1fr_auto_auto_auto_1fr] gap-2 md:gap-4 px-6 py-4 items-center",
                idx < items.length - 1 &&
                  "border-b border-[var(--card-border)]"
              )}
            >
              <div>
                <p className="font-medium text-foreground text-sm">
                  {item.product_name}
                </p>
                {item.variant_name && (
                  <p className="text-xs text-muted">{item.variant_name}</p>
                )}
              </div>
              <span className="text-sm text-muted font-mono">
                {item.sku || "—"}
              </span>
              <span className="text-sm text-foreground text-center font-medium">
                {item.quantity_ordered}
              </span>
              <div className="flex flex-col items-center gap-1 min-w-[80px]">
                <span className="text-sm text-foreground font-medium">
                  {item.quantity_received} / {item.quantity_ordered}
                </span>
                <div className="w-full h-1.5 bg-[var(--background)] rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      pct >= 100
                        ? "bg-green-500"
                        : pct > 0
                          ? "bg-amber-500"
                          : "bg-gray-300 dark:bg-gray-600"
                    )}
                    style={{ width: `${Math.min(100, pct)}%` }}
                  />
                </div>
              </div>
              <span className="text-sm text-foreground text-right">
                {formatIQD(item.unit_cost)}
              </span>
              <span className="text-sm font-medium text-foreground text-right">
                {formatIQD(item.quantity_ordered * item.unit_cost)}
              </span>
            </div>
          );
        })}

        {/* Total row */}
        <div className="px-6 py-4 border-t border-[var(--card-border)] bg-[var(--background)] flex justify-end items-center gap-4">
          <span className="text-sm font-semibold text-muted uppercase">
            {t("products.po.total") || "Total"}
          </span>
          <span className="text-lg font-bold text-foreground">
            {formatIQD(po.total_cost || totalCost)}
          </span>
        </div>
      </div>

      {/* Notes */}
      {po.notes && (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6">
          <h3 className="font-semibold text-foreground flex items-center gap-2 mb-3">
            <StickyNote className="w-4 h-4 text-muted" />
            {t("products.po.notes") || "Notes"}
          </h3>
          <p className="text-sm text-muted whitespace-pre-wrap">{po.notes}</p>
        </div>
      )}
    </motion.div>
  );
}
