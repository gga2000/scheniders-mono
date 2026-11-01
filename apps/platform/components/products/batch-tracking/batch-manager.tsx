"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
    Package,
    Plus,
    Trash2,
    Calendar,
    Hash,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    X,
    Loader2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/use-permission";
import { BATCH_READ_COLUMNS, fetchBatchCosts } from "@/lib/repositories/purchase-costs";
import { PERMISSIONS } from "@/lib/permissions";

interface BatchManagerProps {
    productId: string;
    productName: string;
    disabled?: boolean;
}

interface ProductBatch {
    id: string;
    product_id: string;
    variant_id: string | null;
    batch_number: string;
    expiry_date: string | null;
    quantity: number;
    cost_per_unit: number | null;
    received_at: string;
    notes: string | null;
    status: "active" | "expired" | "written_off";
    tenant_id: string;
    created_at: string;
}

interface NewBatchForm {
    batch_number: string;
    quantity: string;
    expiry_date: string;
    cost_per_unit: string;
    notes: string;
}

const STATUS_STYLES: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700",
    expired: "bg-rose-100 text-rose-700",
    written_off: "bg-gray-100 text-gray-500",
};

const STATUS_LABEL_KEYS: Record<ProductBatch["status"], string> = {
    active: "products.batch.active",
    expired: "products.batch.expired",
    written_off: "products.batch.writtenOff",
};

function generateBatchNumber(existingBatches: ProductBatch[]): string {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const prefix = `BATCH-${yyyy}${mm}-`;

    const existingSeqs = existingBatches
        .map((b) => {
            if (b.batch_number.startsWith(prefix)) {
                const seq = parseInt(b.batch_number.slice(prefix.length), 10);
                return isNaN(seq) ? 0 : seq;
            }
            return 0;
        })
        .filter((n) => n > 0);

    const nextSeq = existingSeqs.length > 0 ? Math.max(...existingSeqs) + 1 : 1;
    return `${prefix}${String(nextSeq).padStart(3, "0")}`;
}

function isExpired(expiryDate: string | null): boolean {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date(new Date().toDateString());
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return "-";
    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(new Date(dateStr));
}

export function BatchManager({ productId, productName, disabled }: BatchManagerProps) {
    const { t } = useLanguage();
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    const { can } = usePermission();
    const showCost = can(PERMISSIONS.MANAGE_PRODUCTS) || can(PERMISSIONS.VIEW_FINANCIALS);

    const [showForm, setShowForm] = useState(false);
    const [writeOffConfirm, setWriteOffConfirm] = useState<string | null>(null);
    const [form, setForm] = useState<NewBatchForm>({
        batch_number: "",
        quantity: "",
        expiry_date: "",
        cost_per_unit: "",
        notes: "",
    });

    // Fetch batches
    const { data: batches = [], isLoading } = useQuery<ProductBatch[]>({
        queryKey: ["product-batches", productId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("product_batches")
                .select(BATCH_READ_COLUMNS)
                .eq("product_id", productId)
                .eq("tenant_id", tenantId)
                .order("created_at", { ascending: false });

            if (error) throw error;
            // Cost is not a readable column; members who may see it get it here.
            const costs = showCost ? await fetchBatchCosts(productId) : new Map<string, number | null>();
            return (data ?? []).map((row) => ({ ...row, cost_per_unit: costs.get(row.id) ?? null })) as ProductBatch[];
        },
        enabled: !!productId && !!tenantId,
    });

    // Insert mutation
    const insertMutation = useMutation({
        mutationFn: async (newBatch: Partial<ProductBatch>) => {
            const { data, error } = await supabase
                .from("product_batches")
                .insert(newBatch)
                .select("id")
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["product-batches", productId] });
            toast.success(t("products.batch.addSuccess"));
            setShowForm(false);
            setForm({
                batch_number: "",
                quantity: "",
                expiry_date: "",
                cost_per_unit: "",
                notes: "",
            });
        },
        onError: (err: Error) => {
            toast.error(t("products.batch.addFailed", { error: err.message }));
        },
    });

    // Write-off mutation
    const writeOffMutation = useMutation({
        mutationFn: async (batchId: string) => {
            const { error } = await supabase
                .from("product_batches")
                .update({ status: "written_off" })
                .eq("id", batchId)
                .eq("tenant_id", tenantId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["product-batches", productId] });
            toast.success(t("products.batch.writeOffSuccess"));
            setWriteOffConfirm(null);
        },
        onError: (err: Error) => {
            toast.error(t("products.batch.writeOffFailed", { error: err.message }));
        },
    });

    // Summary calculations
    const summary = useMemo(() => {
        const activeBatches = batches.filter((b) => b.status === "active");
        const totalActiveQty = activeBatches.reduce((sum, b) => sum + b.quantity, 0);
        const expiryDates = activeBatches
            .filter((b) => b.expiry_date)
            .map((b) => new Date(b.expiry_date!).getTime());
        const earliestExpiry = expiryDates.length > 0 ? new Date(Math.min(...expiryDates)) : null;

        return { totalActiveQty, earliestExpiry };
    }, [batches]);

    const handleOpenForm = () => {
        const suggested = generateBatchNumber(batches);
        setForm((prev) => ({ ...prev, batch_number: suggested }));
        setShowForm(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!tenantId) return;
        if (!form.batch_number || !form.quantity) {
            toast.error(t("products.batch.requiredFields"));
            return;
        }

        insertMutation.mutate({
            product_id: productId,
            batch_number: form.batch_number,
            quantity: parseInt(form.quantity, 10),
            expiry_date: form.expiry_date || null,
            cost_per_unit: showCost && form.cost_per_unit ? parseFloat(form.cost_per_unit) : null,
            notes: form.notes || null,
            status: "active",
            tenant_id: tenantId!,
            received_at: new Date().toISOString(),
        });
    };

    return (
        <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider flex items-center gap-2">
                    <Package className="w-4 h-4" />
                    {t("products.batch.title")}
                </h2>
                <button
                    type="button"
                    onClick={handleOpenForm}
                    disabled={disabled}
                    className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium transition-colors hover:opacity-90",
                        disabled && "opacity-50 cursor-not-allowed"
                    )}
                >
                    <Plus className="w-3.5 h-3.5" />
                    {t("products.batch.addBatch")}
                </button>
            </div>

            {/* Summary row */}
            {batches.length > 0 && (
                <div className="flex flex-wrap gap-4 p-3 bg-[var(--background)] rounded-xl border border-[var(--card-border)]">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted">{t("products.batch.activeQty")}</span>
                        <span className="font-semibold text-foreground">{summary.totalActiveQty}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-muted">{t("products.batch.earliestExpiryLabel")}</span>
                        <span
                            className={cn(
                                "font-semibold",
                                summary.earliestExpiry && isExpired(summary.earliestExpiry.toISOString())
                                    ? "text-rose-600"
                                    : "text-foreground"
                            )}
                        >
                            {summary.earliestExpiry ? formatDate(summary.earliestExpiry.toISOString()) : t("products.batch.notAvailable")}
                        </span>
                    </div>
                </div>
            )}

            {/* Add Batch Form */}
            <AnimatePresence>
                {showForm && (
                    <motion.form
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        onSubmit={handleSubmit}
                        className="overflow-hidden"
                    >
                        <div className="p-4 bg-[var(--background)] rounded-xl border border-[var(--card-border)] space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-foreground">{t("products.batch.newBatch")}</h3>
                                <button
                                    type="button"
                                    onClick={() => setShowForm(false)}
                                    className="p-1 rounded-lg hover:bg-[var(--card-border)] transition-colors"
                                >
                                    <X className="w-4 h-4 text-muted" />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Batch Number */}
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1">
                                        {t("products.batch.batchNumber")}
                                    </label>
                                    <div className="relative">
                                        <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                        <input
                                            type="text"
                                            value={form.batch_number}
                                            onChange={(e) =>
                                                setForm((prev) => ({ ...prev, batch_number: e.target.value }))
                                            }
                                            placeholder="BATCH-202604-001"
                                            className="w-full pl-9 pr-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm"
                                        />
                                    </div>
                                </div>

                                {/* Quantity */}
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1">
                                        {t("products.batch.quantity")}
                                    </label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={form.quantity}
                                        onChange={(e) =>
                                            setForm((prev) => ({ ...prev, quantity: e.target.value }))
                                        }
                                        placeholder="0"
                                        required
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm"
                                    />
                                </div>

                                {/* Expiry Date */}
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1">
                                        {t("products.batch.expiryDate")}
                                    </label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                                        <input
                                            type="date"
                                            value={form.expiry_date}
                                            onChange={(e) =>
                                                setForm((prev) => ({ ...prev, expiry_date: e.target.value }))
                                            }
                                            className="w-full pl-9 pr-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm"
                                        />
                                    </div>
                                </div>

                                {/* Cost per unit: admins only */}
                                {showCost && (
                                <div>
                                    <label className="block text-xs font-medium text-muted mb-1">
                                        {t("products.batch.costPerUnit")}
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={form.cost_per_unit}
                                        onChange={(e) =>
                                            setForm((prev) => ({ ...prev, cost_per_unit: e.target.value }))
                                        }
                                        placeholder="0.00"
                                        className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm"
                                    />
                                </div>
                                )}
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="block text-xs font-medium text-muted mb-1">
                                    {t("products.batch.notes")}
                                </label>
                                <textarea
                                    value={form.notes}
                                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                                    placeholder={t("products.batch.notesPlaceholder")}
                                    rows={2}
                                    className="w-full px-4 py-3 bg-[var(--background)] border border-[var(--card-border)] rounded-xl text-foreground placeholder:text-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)] transition-all text-sm resize-none"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowForm(false)}
                                    className="px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
                                >
                                    {t("common.cancel")}
                                </button>
                                <button
                                    type="submit"
                                    disabled={insertMutation.isPending}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-[var(--pastel-mint)] text-teal-700 rounded-lg text-sm font-medium transition-colors hover:opacity-90 disabled:opacity-50"
                                >
                                    {insertMutation.isPending && (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    )}
                                    {t("products.batch.addBatch")}
                                </button>
                            </div>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {/* Batches List */}
            {isLoading ? (
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-muted" />
                </div>
            ) : batches.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted">
                    {t("products.batch.empty")}
                </div>
            ) : (
                <div className="space-y-2">
                    {batches.map((batch) => {
                        const expired = batch.status === "active" && isExpired(batch.expiry_date);
                        const isConfirmingWriteOff = writeOffConfirm === batch.id;

                        return (
                            <motion.div
                                key={batch.id}
                                layout
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={cn(
                                    "p-4 rounded-xl border transition-colors",
                                    expired
                                        ? "bg-rose-50/50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800/40"
                                        : "bg-[var(--background)] border-[var(--card-border)]"
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        {/* Top row: batch number + status */}
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-semibold text-foreground font-mono">
                                                {batch.batch_number}
                                            </span>
                                            <span
                                                className={cn(
                                                    "px-2 py-0.5 rounded-full text-xs font-medium",
                                                    expired
                                                        ? STATUS_STYLES.expired
                                                        : STATUS_STYLES[batch.status]
                                                )}
                                            >
                                                {t(expired ? STATUS_LABEL_KEYS.expired : STATUS_LABEL_KEYS[batch.status])}
                                            </span>
                                            {expired && (
                                                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                            )}
                                        </div>

                                        {/* Detail row */}
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                                            <span>
                                                {t("products.batch.qtyPrefix")}{" "}<span className="text-foreground font-medium">{batch.quantity}</span>
                                            </span>
                                            {batch.expiry_date && (
                                                <span>
                                                    {t("products.batch.expiryPrefix")}{" "}
                                                    <span
                                                        className={cn(
                                                            "font-medium",
                                                            expired ? "text-rose-600" : "text-foreground"
                                                        )}
                                                    >
                                                        {formatDate(batch.expiry_date)}
                                                    </span>
                                                </span>
                                            )}
                                            {showCost && batch.cost_per_unit !== null && (
                                                <span>
                                                    {t("products.batch.costPrefix")}{" "}
                                                    <span className="text-foreground font-medium">
                                                        {formatIQD(batch.cost_per_unit)}
                                                    </span>
                                                </span>
                                            )}
                                            <span>
                                                {t("products.batch.receivedPrefix")}{" "}<span className="text-foreground font-medium">{formatDate(batch.received_at)}</span>
                                            </span>
                                        </div>

                                        {/* Notes */}
                                        {batch.notes && (
                                            <p className="text-xs text-muted italic mt-1">{batch.notes}</p>
                                        )}
                                    </div>

                                    {/* Write Off Action */}
                                    {batch.status !== "written_off" && (
                                        <div className="flex-shrink-0">
                                            {isConfirmingWriteOff ? (
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => writeOffMutation.mutate(batch.id)}
                                                        disabled={writeOffMutation.isPending}
                                                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                                                    >
                                                        {writeOffMutation.isPending ? (
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="w-3 h-3" />
                                                        )}
                                                        {t("common.confirm")}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setWriteOffConfirm(null)}
                                                        className="px-2 py-1.5 text-xs text-muted hover:text-foreground transition-colors"
                                                    >
                                                        {t("common.cancel")}
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => setWriteOffConfirm(batch.id)}
                                                    disabled={disabled}
                                                    className="text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors disabled:opacity-50"
                                                    title={t("products.batch.writeOffTitle")}
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
