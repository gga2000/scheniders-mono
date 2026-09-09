"use client";

import { useEffect, useMemo, useState } from "react";
import { useOrderRisk } from "@/hooks/use-order-risk-query";
import Image from "next/image";
import QRCode from "qrcode";
import { ExternalLink, Ban, ShieldAlert } from "lucide-react";
import type { Order, OrderItem } from "@/types/order";
import type { ReturnDestination, ReturnItemDestination } from "@/lib/returns/process-return";
import { useOrderReasons } from "@/hooks/use-order-reasons";
import { RiskBadge } from "@/components/orders/risk-badge";
import type { RiskLevel } from "@/lib/fraud-detector";
import { getStatusLabel, cn } from "@/lib/utils";
import { getStatusBadgeStyle } from "@/lib/order-format-utils";
import { useAuth } from "@/components/auth/auth-provider";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";

const DESTS: { key: ReturnDestination; label: string }[] = [
    { key: "restock", label: "Restock" },
    { key: "open_box", label: "Open-box" },
    { key: "write_off", label: "Write-off" },
];

const DEST_STYLE: Record<ReturnDestination, { on: string; off: string }> = {
    restock:   { on: "bg-emerald-500 text-white border-emerald-500", off: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" },
    open_box:  { on: "bg-sky-500 text-white border-sky-500",         off: "bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100" },
    write_off: { on: "bg-rose-500 text-white border-rose-500",       off: "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100" },
};

export function ReturnDetailPanel({
    order, isAnomaly, onConfirm, onSkip, isProcessing, defaultReasonLabel, onOpenOrder,
}: {
    order: Order;
    isAnomaly: boolean;
    onConfirm: (reasonLabel: string, destinations: ReturnItemDestination[]) => void;
    onSkip: () => void;
    isProcessing: boolean;
    defaultReasonLabel?: string;
    onOpenOrder?: (order: Order) => void;
}) {
    const { reasons } = useOrderReasons("reject", { enabledOnly: true });
    const { profile, user, tenantId } = useAuth();
    const [reasonLabel, setReasonLabel] = useState<string>(defaultReasonLabel || "");
    const [orderDest, setOrderDest] = useState<ReturnDestination>("restock");
    const items = useMemo<OrderItem[]>(() => order.items || [], [order]);
    const [perItem, setPerItem] = useState<Record<number, ReturnDestination>>({});
    const [qrMode, setQrMode] = useState<"order" | "phone">("order");
    const [orderQr, setOrderQr] = useState<string>("");
    const [blacklisted, setBlacklisted] = useState<boolean>(false);
    const [blacklisting, setBlacklisting] = useState<boolean>(false);

    // PERF-D1: one order, one risk row — not the whole map.
    const rawRisk = useOrderRisk(order.id)?.level;
    const riskLevel = (rawRisk === "medium" || rawRisk === "high" || rawRisk === "blocked"
        ? rawRisk : rawRisk === "flagged" ? "high" : "low") as RiskLevel;
    const statusLabel = getStatusLabel(order.status, order.is_return);
    const priorReason = order.status === "rejected" && order.rejection_reason ? order.rejection_reason : null;

    useEffect(() => {
        const payload = (qrMode === "phone" ? order.phone : order.order_id) || order.order_id;
        QRCode.toDataURL(payload, { width: 160, margin: 1 }).then(setOrderQr).catch(() => setOrderQr(""));
    }, [qrMode, order.order_id, order.phone]);

    const destFor = (idx: number): ReturnDestination => perItem[idx] ?? orderDest;

    const handleConfirm = () => {
        if (!reasonLabel) return;
        const destinations: ReturnItemDestination[] = items
            .map((it, idx) => ({ it, idx }))
            .filter(({ it }) => !!it.product_id)
            .map(({ it, idx }) => ({ product_id: it.product_id as string, quantity: it.quantity, dest: destFor(idx) }));
        onConfirm(reasonLabel, destinations);
    };

    const handleBlacklist = async () => {
        if (!order.phone) return;
        setBlacklisting(true);
        const { error } = await supabase.from("blacklist").upsert({
            phone: order.phone,
            reason: reasonLabel || "Flagged from returns cockpit",
            added_by: profile?.display_name || user?.email || null,
            tenant_id: tenantId,
        });
        setBlacklisting(false);
        if (error) { toast.error("Failed to blacklist"); return; }
        setBlacklisted(true);
        toast.success(`Blacklisted ${order.phone}`);
    };

    return (
        <div className="flex flex-col gap-2.5">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="font-bold truncate">Order #{order.order_id} — {order.customer_name}</div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide", getStatusBadgeStyle(order.status))}>
                            {statusLabel}
                        </span>
                        <RiskBadge level={riskLevel} customerPhone={order.phone} />
                        {priorReason && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-rose-50 text-rose-600 border border-rose-200" title="Previous rejection reason">
                                ↩︎ {priorReason}
                            </span>
                        )}
                        {order.city && <span className="text-xs text-muted">{order.city}</span>}
                    </div>
                    <div className="text-xs text-muted mt-0.5 truncate">
                        {order.phone}{order.address_details ? ` · ${order.address_details}` : ""}
                    </div>
                    {isAnomaly && (
                        <div className="text-xs text-rose-600 mt-1">⚠ {statusLabel} — not expected in a return pile</div>
                    )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {onOpenOrder && (
                        <button type="button" onClick={() => onOpenOrder(order)}
                            className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
                            <ExternalLink className="w-3.5 h-3.5" /> Open order
                        </button>
                    )}
                    <button type="button" onClick={handleBlacklist} disabled={blacklisting || blacklisted || !order.phone}
                        className={cn("inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border",
                            blacklisted ? "bg-gray-900 text-white border-gray-900" : "border-rose-200 text-rose-600 hover:bg-rose-50")}>
                        {blacklisted ? <><Ban className="w-3.5 h-3.5" /> Blacklisted</> : <><ShieldAlert className="w-3.5 h-3.5" /> Blacklist</>}
                    </button>
                </div>
            </div>

            <div className="flex gap-4">
                <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                    {/* Order-level destination */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm text-muted">All items:</span>
                        {DESTS.map((d) => (
                            <button key={d.key} type="button" onClick={() => { setOrderDest(d.key); setPerItem({}); }}
                                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
                                    orderDest === d.key ? DEST_STYLE[d.key].on : DEST_STYLE[d.key].off)}>
                                {d.label}
                            </button>
                        ))}
                    </div>

                    {/* Per-item override */}
                    <div className="flex flex-col gap-1.5">
                        {items.map((it, idx) => (
                            <div key={idx} className="flex items-center justify-between border border-[var(--card-border)] rounded-xl px-3 py-1.5">
                                <span className="text-sm truncate">{it.name} ×{it.quantity}{!it.product_id && <span className="text-rose-500 text-xs"> (not tracked)</span>}</span>
                                <select value={destFor(idx)} disabled={!it.product_id}
                                    onChange={(e) => setPerItem((p) => ({ ...p, [idx]: e.target.value as ReturnDestination }))}
                                    className="text-xs border border-[var(--card-border)] rounded-lg px-2 py-1 bg-white disabled:opacity-50 shrink-0 ml-2">
                                    {DESTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>

                    {/* Reason chips (required) */}
                    <div>
                        <div className="text-sm text-muted mb-1.5">
                            Reason {reasonLabel ? "" : <span className="text-rose-500">*</span>}
                        </div>
                        <div role="radiogroup" className="flex flex-wrap gap-1.5">
                            {reasons.map((r) => {
                                const isSel = reasonLabel === r.label_ar;
                                return (
                                    <button key={r.id} type="button" role="radio" aria-checked={isSel}
                                        onClick={() => setReasonLabel(r.label_ar)}
                                        className={cn("px-3 py-1 rounded-full text-sm font-medium border transition-colors",
                                            isSel ? "bg-rose-500 text-white border-rose-500 shadow-sm" : "bg-rose-50/60 text-rose-700 border-rose-200 hover:bg-rose-100")}>
                                        {r.label_ar}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                        {isAnomaly && <button onClick={onSkip} className="px-3 py-2 rounded-lg text-sm border border-[var(--card-border)]">Skip</button>}
                        <button onClick={handleConfirm} disabled={isProcessing || !reasonLabel}
                            className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 shadow-sm hover:from-emerald-600 hover:to-teal-600 hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:from-gray-400 disabled:to-gray-400">
                            {isProcessing ? "Saving…" : "Confirm & next →"}
                        </button>
                    </div>
                </div>

                {/* Delivery-app QR — beside the controls so it's always visible */}
                {orderQr && (
                    <div className="shrink-0 w-[156px] flex flex-col items-center gap-1.5 border-l border-[var(--card-border)] pl-4">
                        <span className="text-[10px] text-muted uppercase tracking-wide text-center leading-tight">Scan in<br />delivery app</span>
                        <div className="inline-flex rounded-lg border border-[var(--card-border)] overflow-hidden text-[10px] font-semibold">
                            <button type="button" onClick={() => setQrMode("order")}
                                className={qrMode === "order" ? "px-2.5 py-1 bg-[var(--ink)] text-white" : "px-2.5 py-1 bg-white text-foreground"}>Order ID</button>
                            <button type="button" onClick={() => setQrMode("phone")}
                                className={qrMode === "phone" ? "px-2.5 py-1 bg-[var(--ink)] text-white" : "px-2.5 py-1 bg-white text-foreground"}>Phone</button>
                        </div>
                        <Image src={orderQr} alt={`QR ${qrMode === "phone" ? order.phone : order.order_id}`} width={140} height={140} unoptimized className="rounded-lg" />
                        <span className="text-xs font-semibold text-foreground truncate max-w-full">{qrMode === "phone" ? order.phone : `#${order.order_id}`}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
