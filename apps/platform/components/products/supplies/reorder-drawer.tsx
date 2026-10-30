"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
    AlertTriangle,
    Box,
    ChevronDown,
    ChevronUp,
    Clock,
    Loader2,
    Package,
    ShoppingCart,
    Truck,
    X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Product } from "@/lib/supabase";
import { cn, formatIQD } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";
import { toast } from "@/hooks/use-toast";

interface SupplySupplierRaw {
    supplier_name?: string;
    supplier_contact?: string;
    supplier_email?: string;
    lead_time_days?: number | null;
    minimum_order_quantity?: number | null;
    unit_cost?: number | null;
    is_primary?: boolean;
}

interface ReorderItem {
    supply: Product;
    primarySupplier: SupplySupplierRaw | null;
    dailyRate: number;
    daysUntilStockout: number | null;
    suggestedQty: number;
    unitCost: number;
    leadTimeDays: number;
    urgency: "critical" | "warning" | "ok";
    moq: number;
}

interface SupplierGroup {
    supplierName: string;
    supplierEmail: string;
    supplierContact: string;
    items: ReorderItem[];
    totalCost: number;
}

const NO_SUPPLIER_KEY = "__no_supplier__";

function urgencyFor(days: number | null, leadTime: number): ReorderItem["urgency"] {
    if (days === null) return "ok";
    if (days <= leadTime) return "critical";
    if (days <= leadTime * 2) return "warning";
    return "ok";
}

function calcSuggestedQty({
    leadTimeDays,
    dailyRate,
    reorderPoint,
    stock,
    moq,
}: {
    leadTimeDays: number;
    dailyRate: number;
    reorderPoint: number;
    stock: number;
    moq: number;
}): number {
    // Cover lead time × 1.3 safety factor, land at reorder point after receipt.
    const raw = leadTimeDays * dailyRate * 1.3 + (reorderPoint - stock);
    const needed = Math.max(moq, Math.ceil(raw));
    if (moq <= 1) return needed;
    return Math.ceil(needed / moq) * moq;
}

interface ReorderDrawerProps {
    open: boolean;
    onClose: () => void;
    supplies: Product[];
    snoozedIds: Set<string>;
    onSnooze: (supplyId: string) => void;
    onUnsnooze: (supplyId: string) => void;
}

export function ReorderDrawer({
    open,
    onClose,
    supplies,
    snoozedIds,
    onSnooze,
    onUnsnooze,
}: ReorderDrawerProps) {
    const { tenantId } = useAuth();
    const queryClient = useQueryClient();
    const [editedQty, setEditedQty] = useState<Record<string, number>>({});
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["__all__"]));
    const [generating, setGenerating] = useState<Set<string>>(new Set());
    const [showSnoozed, setShowSnoozed] = useState(false);

    // 30-day sales data for velocity.
    const { data: salesMap = new Map<string, number>() } = useQuery({
        queryKey: ["supplies-reorder-sales", tenantId],
        enabled: !!tenantId && open,
        staleTime: 60_000,
        queryFn: async () => {
            if (!tenantId) return new Map<string, number>();
            const since = new Date();
            since.setDate(since.getDate() - 30);
            const { data, error } = await supabase
                .from("inventory_history")
                .select("product_id, quantity_change, change_type")
                .eq("tenant_id", tenantId)
                .in("change_type", ["sale", "sold"])
                .gte("created_at", since.toISOString());
            if (error) throw error;
            const m = new Map<string, number>();
            for (const row of data ?? []) {
                const qty = Math.abs(row.quantity_change ?? 0);
                m.set(row.product_id, (m.get(row.product_id) ?? 0) + qty);
            }
            return m;
        },
    });

    // Derive reorder items grouped by supplier.
    const { supplierGroups, totalItems, snoozedCount } = useMemo(() => {
        const items: ReorderItem[] = [];
        let snoozed = 0;

        for (const s of supplies) {
            const stock = s.stock_quantity ?? 0;
            const reorderPoint = s.reorder_point ?? s.low_stock_threshold ?? 5;
            const reserved = s.reserved_quantity ?? 0;
            const available = Math.max(0, stock - reserved);

            // Skip if well-stocked and sales velocity is low/zero.
            const sold30 = salesMap.get(s.id) ?? s.times_sold_30d ?? 0;
            const dailyRate = sold30 / 30;
            const daysUntilStockout =
                dailyRate > 0 ? Math.round(available / dailyRate) : null;

            const suppliersRaw = (s as unknown as { suppliers?: SupplySupplierRaw[] })
                .suppliers;
            const suppliers: SupplySupplierRaw[] = Array.isArray(suppliersRaw)
                ? suppliersRaw
                : [];
            const primary = suppliers.find((x) => x.is_primary) ?? suppliers[0] ?? null;
            const leadTimeDays = primary?.lead_time_days ?? 7;
            const moq = primary?.minimum_order_quantity ?? 1;
            const unitCost = primary?.unit_cost ?? s.cost ?? 0;

            const belowReorder = stock <= reorderPoint;
            const atRisk =
                daysUntilStockout !== null && daysUntilStockout <= leadTimeDays * 2;

            if (!belowReorder && !atRisk) continue;

            if (snoozedIds.has(s.id)) {
                snoozed += 1;
                if (!showSnoozed) continue;
            }

            items.push({
                supply: s,
                primarySupplier: primary,
                dailyRate,
                daysUntilStockout,
                suggestedQty: calcSuggestedQty({
                    leadTimeDays,
                    dailyRate,
                    reorderPoint,
                    stock,
                    moq,
                }),
                unitCost,
                leadTimeDays,
                urgency: urgencyFor(daysUntilStockout, leadTimeDays),
                moq,
            });
        }

        const map = new Map<string, SupplierGroup>();
        for (const item of items) {
            const key = item.primarySupplier?.supplier_name || NO_SUPPLIER_KEY;
            if (!map.has(key)) {
                map.set(key, {
                    supplierName:
                        key === NO_SUPPLIER_KEY
                            ? "No supplier assigned"
                            : key,
                    supplierEmail: item.primarySupplier?.supplier_email ?? "",
                    supplierContact: item.primarySupplier?.supplier_contact ?? "",
                    items: [],
                    totalCost: 0,
                });
            }
            const g = map.get(key)!;
            const qty = editedQty[item.supply.id] ?? item.suggestedQty;
            g.items.push(item);
            g.totalCost += qty * item.unitCost;
        }

        const groups = Array.from(map.values()).sort((a, b) => {
            const aCrit = a.items.some((i) => i.urgency === "critical");
            const bCrit = b.items.some((i) => i.urgency === "critical");
            if (aCrit && !bCrit) return -1;
            if (!aCrit && bCrit) return 1;
            return b.items.length - a.items.length;
        });

        const order = { critical: 0, warning: 1, ok: 2 } as const;
        for (const g of groups) {
            g.items.sort((a, b) => order[a.urgency] - order[b.urgency]);
        }

        return {
            supplierGroups: groups,
            totalItems: items.length,
            snoozedCount: snoozed,
        };
    }, [supplies, salesMap, snoozedIds, editedQty, showSnoozed]);

    const toggleGroup = useCallback((name: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });
    }, []);

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
            const last = data[0].po_number as string;
            const parts = last.split("-");
            seq = (parseInt(parts[2] ?? "0", 10) || 0) + 1;
        }
        return `PO-${year}-${String(seq).padStart(3, "0")}`;
    }, [tenantId]);

    const generatePO = useMutation({
        mutationFn: async (group: SupplierGroup) => {
            if (!tenantId) throw new Error("No tenant");
            const poNumber = await generatePONumber();
            const items = group.items.map((item) => ({
                product_id: item.supply.id,
                product_name: item.supply.name,
                sku: item.supply.sku ?? null,
                quantity_ordered: editedQty[item.supply.id] ?? item.suggestedQty,
                unit_cost: item.unitCost,
            }));
            const totalCost = items.reduce(
                (sum, i) => sum + i.quantity_ordered * i.unit_cost,
                0
            );
            const maxLeadTime = Math.max(...group.items.map((i) => i.leadTimeDays));

            const { data: po, error: poError } = await supabase
                .from("purchase_orders")
                .insert({
                    tenant_id: tenantId,
                    po_number: poNumber,
                    supplier_name: group.supplierName,
                    status: "draft",
                    total_cost: totalCost,
                    notes: `Auto-generated supplies reorder (${items.length} item${items.length === 1 ? "" : "s"})`,
                    expected_date: new Date(
                        Date.now() + maxLeadTime * 86_400_000
                    )
                        .toISOString()
                        .split("T")[0],
                })
                .select("id")
                .single();
            if (poError) throw poError;

            const { error: itemsError } = await supabase
                .from("purchase_order_items")
                .insert(items.map((i) => ({ po_id: po.id, ...i })));
            if (itemsError) throw itemsError;
            return { poNumber, itemCount: items.length };
        },
        onSuccess: (result) => {
            toast.success(
                `PO ${result.poNumber} created (${result.itemCount} supply item${
                    result.itemCount === 1 ? "" : "s"
                })`
            );
            queryClient.invalidateQueries({ queryKey: ["supplies-reorder-sales"] });
            queryClient.invalidateQueries({ queryKey: ["supplies-open-pos"] });
        },
        onError: (err: Error) => {
            toast.error(`Could not create PO: ${err.message}`);
        },
    });

    const handleGenerate = useCallback(
        async (group: SupplierGroup) => {
            setGenerating((prev) => new Set(prev).add(group.supplierName));
            try {
                await generatePO.mutateAsync(group);
            } finally {
                setGenerating((prev) => {
                    const next = new Set(prev);
                    next.delete(group.supplierName);
                    return next;
                });
            }
        },
        [generatePO]
    );

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={onClose}
                        className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm"
                    />

                    {/* Drawer */}
                    <motion.aside
                        key="drawer"
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", stiffness: 320, damping: 36 }}
                        className="fixed inset-y-0 right-0 z-50 w-full max-w-xl bg-[var(--card-bg)] border-l border-[var(--card-border)] shadow-2xl flex flex-col"
                        role="dialog"
                        aria-label="Reorder recommendations"
                    >
                        {/* Header */}
                        <div className="px-5 py-4 border-b border-[var(--card-border)] flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-semibold flex items-center gap-2">
                                    <ShoppingCart className="w-5 h-5 text-teal-600" />
                                    Reorder recommendations
                                </h3>
                                <p className="text-xs text-muted mt-0.5">
                                    {totalItems > 0
                                        ? `${totalItems} suppl${
                                              totalItems === 1 ? "y" : "ies"
                                          } below reorder point or at risk · ${
                                              supplierGroups.length
                                          } supplier group${
                                              supplierGroups.length === 1 ? "" : "s"
                                          }`
                                        : "Every supply is stocked above its reorder point."}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-1.5 rounded-lg hover:bg-[var(--background)] text-muted"
                                aria-label="Close"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Snooze toggle */}
                        {snoozedCount > 0 && (
                            <div className="px-5 py-2 border-b border-[var(--card-border)] flex items-center justify-between text-xs">
                                <span className="text-muted">
                                    {snoozedCount} snoozed
                                </span>
                                <button
                                    onClick={() => setShowSnoozed((v) => !v)}
                                    className="font-medium text-teal-600 hover:text-teal-700"
                                >
                                    {showSnoozed ? "Hide snoozed" : "Show snoozed"}
                                </button>
                            </div>
                        )}

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto">
                            {supplierGroups.length === 0 ? (
                                <EmptyState snoozedCount={snoozedCount} />
                            ) : (
                                <div className="divide-y divide-[var(--card-border)]">
                                    {supplierGroups.map((group) => {
                                        const isExpanded =
                                            expandedGroups.has("__all__") ||
                                            expandedGroups.has(group.supplierName);
                                        const isGenerating = generating.has(
                                            group.supplierName
                                        );
                                        const hasCritical = group.items.some(
                                            (i) => i.urgency === "critical"
                                        );
                                        const noSupplier =
                                            group.supplierName === "No supplier assigned";

                                        return (
                                            <div key={group.supplierName}>
                                                {/* Group header */}
                                                <button
                                                    onClick={() =>
                                                        toggleGroup(group.supplierName)
                                                    }
                                                    className={cn(
                                                        "w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-[var(--background)]/50 transition-colors text-left",
                                                        hasCritical &&
                                                            "bg-rose-50/40"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div
                                                            className={cn(
                                                                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                                                                hasCritical
                                                                    ? "bg-rose-100 text-rose-600"
                                                                    : "bg-teal-50 text-teal-600"
                                                            )}
                                                        >
                                                            <Truck className="w-4 h-4" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="font-semibold text-sm truncate">
                                                                {group.supplierName}
                                                            </div>
                                                            <div className="text-[11px] text-muted flex items-center gap-2 mt-0.5">
                                                                <span>
                                                                    {group.items.length} item
                                                                    {group.items.length === 1
                                                                        ? ""
                                                                        : "s"}
                                                                </span>
                                                                <span>·</span>
                                                                <span className="font-medium tabular-nums">
                                                                    {formatIQD(
                                                                        group.totalCost
                                                                    )}
                                                                </span>
                                                                {hasCritical && (
                                                                    <>
                                                                        <span>·</span>
                                                                        <span className="inline-flex items-center gap-1 text-rose-600 font-medium">
                                                                            <AlertTriangle className="w-3 h-3" />
                                                                            critical
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {!noSupplier && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    void handleGenerate(
                                                                        group
                                                                    );
                                                                }}
                                                                disabled={isGenerating}
                                                                className={cn(
                                                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                                                    "bg-teal-500 text-white hover:bg-teal-600 disabled:opacity-60 disabled:cursor-not-allowed"
                                                                )}
                                                            >
                                                                {isGenerating ? (
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                ) : (
                                                                    <ShoppingCart className="w-3.5 h-3.5" />
                                                                )}
                                                                {isGenerating
                                                                    ? "Creating…"
                                                                    : "Create PO"}
                                                            </button>
                                                        )}
                                                        {isExpanded ? (
                                                            <ChevronUp className="w-4 h-4 text-muted" />
                                                        ) : (
                                                            <ChevronDown className="w-4 h-4 text-muted" />
                                                        )}
                                                    </div>
                                                </button>

                                                {/* Group items */}
                                                {isExpanded && (
                                                    <div className="px-5 pb-4 space-y-2">
                                                        {group.items.map((item) => (
                                                            <ReorderItemRow
                                                                key={item.supply.id}
                                                                item={item}
                                                                editedQty={editedQty}
                                                                snoozed={snoozedIds.has(
                                                                    item.supply.id
                                                                )}
                                                                onQtyChange={(qty) =>
                                                                    setEditedQty((prev) => ({
                                                                        ...prev,
                                                                        [item.supply.id]:
                                                                            qty,
                                                                    }))
                                                                }
                                                                onSnooze={() =>
                                                                    onSnooze(item.supply.id)
                                                                }
                                                                onUnsnooze={() =>
                                                                    onUnsnooze(
                                                                        item.supply.id
                                                                    )
                                                                }
                                                            />
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}

function EmptyState({ snoozedCount }: { snoozedCount: number }) {
    return (
        <div className="flex flex-col items-center justify-center text-center px-6 py-16">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <Package className="w-6 h-6" />
            </div>
            <p className="font-semibold">All supplies healthy</p>
            <p className="text-sm text-muted mt-1 max-w-xs">
                Nothing is below its reorder point right now.
                {snoozedCount > 0 && ` ${snoozedCount} snoozed item${snoozedCount === 1 ? "" : "s"} hidden.`}
            </p>
        </div>
    );
}

interface ReorderItemRowProps {
    item: ReorderItem;
    editedQty: Record<string, number>;
    snoozed: boolean;
    onQtyChange: (qty: number) => void;
    onSnooze: () => void;
    onUnsnooze: () => void;
}

function ReorderItemRow({
    item,
    editedQty,
    snoozed,
    onQtyChange,
    onSnooze,
    onUnsnooze,
}: ReorderItemRowProps) {
    const qty = editedQty[item.supply.id] ?? item.suggestedQty;
    const lineCost = qty * item.unitCost;

    return (
        <div
            className={cn(
                "rounded-xl ring-1 ring-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5",
                snoozed && "opacity-60"
            )}
        >
            <div className="flex items-start gap-3">
                {/* Image/icon */}
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--background)] flex items-center justify-center ring-1 ring-[var(--card-border)] shrink-0">
                    {item.supply.image_url ? (
                        <img
                            src={item.supply.image_url}
                            alt={item.supply.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                        />
                    ) : (
                        <Box className="w-5 h-5 text-teal-600" />
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <div className="font-medium text-sm truncate">
                                {item.supply.name}
                            </div>
                            <div className="text-[11px] text-muted font-mono mt-0.5">
                                {item.supply.sku || "No SKU"}
                            </div>
                        </div>
                        <UrgencyChip urgency={item.urgency} days={item.daysUntilStockout} />
                    </div>

                    {/* Stats row */}
                    <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                        <Stat
                            label="On hand"
                            value={`${item.supply.stock_quantity ?? 0}`}
                            tone="muted"
                        />
                        <Stat
                            label="Velocity"
                            value={
                                item.dailyRate > 0
                                    ? `${item.dailyRate.toFixed(1)}/d`
                                    : "—"
                            }
                            tone="muted"
                        />
                        <Stat
                            label="Lead time"
                            value={`${item.leadTimeDays}d`}
                            tone="muted"
                        />
                    </div>

                    {/* Qty editor + actions */}
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <label className="text-[11px] text-muted uppercase tracking-wide">
                                Qty
                            </label>
                            <input
                                type="number"
                                min={1}
                                step={Math.max(1, item.moq)}
                                value={qty}
                                onChange={(e) =>
                                    onQtyChange(
                                        Math.max(1, parseInt(e.target.value, 10) || 1)
                                    )
                                }
                                className="w-20 px-2 py-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-teal-200"
                            />
                            <span className="text-[11px] text-muted tabular-nums">
                                × {formatIQD(item.unitCost)}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums">
                                {formatIQD(lineCost)}
                            </span>
                            {snoozed ? (
                                <button
                                    onClick={onUnsnooze}
                                    className="text-[11px] px-2 py-1 rounded-lg hover:bg-[var(--background)] text-muted"
                                    title="Unsnooze"
                                >
                                    Unsnooze
                                </button>
                            ) : (
                                <button
                                    onClick={onSnooze}
                                    className="text-[11px] px-2 py-1 rounded-lg hover:bg-[var(--background)] text-muted"
                                    title="Snooze for this session"
                                >
                                    Snooze
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Stat({
    label,
    value,
    tone,
}: {
    label: string;
    value: string;
    tone: "muted" | "critical";
}) {
    return (
        <div className="rounded-lg bg-[var(--background)] px-2 py-1 ring-1 ring-[var(--card-border)]/60">
            <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
            <div
                className={cn(
                    "text-sm font-semibold tabular-nums",
                    tone === "critical" ? "text-rose-600" : "text-foreground"
                )}
            >
                {value}
            </div>
        </div>
    );
}

function UrgencyChip({
    urgency,
    days,
}: {
    urgency: ReorderItem["urgency"];
    days: number | null;
}) {
    if (urgency === "critical") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-700 ring-1 ring-rose-100 px-2 py-0.5 text-[10px] font-medium">
                <AlertTriangle className="w-3 h-3" />
                {days !== null
                    ? days <= 0
                        ? "Out now"
                        : `${days}d left`
                    : "Critical"}
            </span>
        );
    }
    if (urgency === "warning") {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-100 px-2 py-0.5 text-[10px] font-medium">
                <Clock className="w-3 h-3" />
                {days !== null ? `${days}d left` : "At risk"}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100 px-2 py-0.5 text-[10px] font-medium">
            Below reorder
        </span>
    );
}
