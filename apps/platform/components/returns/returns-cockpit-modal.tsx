"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, RotateCcw, Trash2, Layers, ChevronDown, ChevronRight } from "lucide-react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { useReturnsSession, type ScannedReturn } from "@/hooks/use-returns-session";
import { primeOnFirstGesture } from "@/lib/returns/sounds";
import { useProcessReturn, useUndoReturn } from "@/hooks/use-process-return";
import { ReturnDetailPanel } from "./return-detail-panel";
import { toast } from "@/hooks/use-toast";
import type { ReturnItemDestination, ReturnDestination } from "@/lib/returns/process-return";
import { extractScannedOrderId } from "@/lib/scan-utils";
import { useOrderReasons } from "@/hooks/use-order-reasons";
import { formatIQD, cn } from "@/lib/utils";
import { getStatusBadgeStyle } from "@/lib/order-format-utils";
import type { Order } from "@/types/order";
import { useStatusLabel } from "@/hooks/use-status-label";

const DOT: Record<string, string> = {
    needs_action: "#f0b400",
    done: "#3fae6a",
    anomaly: "#b5394a",
    not_found: "#b5394a",
    never_shipped: "#e8870c",
};

export function ReturnsCockpitModal({
    open, onClose, onOpenOrder,
}: {
    open: boolean;
    onClose: () => void;
    onOpenOrder?: (order: Order) => void;
}) {
    const { profile, user, tenantId } = useAuth();
    const orderStatusLabel = useStatusLabel();
    const session = useReturnsSession(open);
    const processReturn = useProcessReturn();
    const undoReturn = useUndoReturn();
    const { reasons } = useOrderReasons("reject", { enabledOnly: true });

    const [qr, setQr] = useState<string>("");
    const [showPair, setShowPair] = useState(false);
    const [manualId, setManualId] = useState("");
    const [defaultReason, setDefaultReason] = useState("");
    const [summary, setSummary] = useState({ restock: 0, open_box: 0, write_off: 0 });
    const [lastConfirm, setLastConfirm] = useState<{ orderId: string; deltas: { restock: number; open_box: number; write_off: number } } | null>(null);
    const [handledOpen, setHandledOpen] = useState(false);

    const changedByName = profile?.display_name || user?.email || "System";
    const changedByAvatar = (profile as { avatar_url?: string | null } | null)?.avatar_url ?? null;

    const tally = (destinations: ReturnItemDestination[]) => {
        const d = { restock: 0, open_box: 0, write_off: 0 };
        destinations.forEach((x) => { d[x.dest] += 1; });
        return d;
    };

    useEffect(() => { if (open) primeOnFirstGesture(); }, [open]);

    useEffect(() => {
        if (open && session.pairingUrl) {
            QRCode.toDataURL(session.pairingUrl, { width: 220, margin: 1 }).then(setQr).catch(() => setQr(""));
        }
    }, [open, session.pairingUrl]);

    useEffect(() => {
        if (open && session.selectedKey) session.refreshItem(session.selectedKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, session.selectedKey]);

    const selected = session.items.find((i) => i.key === session.selectedKey) || null;
    const pending = session.items.filter((i) => i.result !== "done");
    const handled = session.items.filter((i) => i.result === "done");

    const renderRow = (i: ScannedReturn) => {
        const isSel = i.key === session.selectedKey;
        const itemCount = i.order?.items?.length || 0;
        return (
            <div key={i.key} onClick={() => session.setSelectedKey(i.key)}
                className={cn("group w-full flex items-center gap-2 px-3 py-2 rounded-xl mb-1.5 border cursor-pointer",
                    isSel ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "bg-white border-[var(--card-border)]",
                    i.result === "done" ? "opacity-60" : "")}>
                <span style={{ width: 8, height: 8, borderRadius: 9999, background: DOT[i.result], flexShrink: 0 }} />
                <div className="min-w-0 flex-1">
                    <div className="text-sm truncate font-medium">
                        #{i.orderId}{i.order ? ` · ${i.order.customer_name}` : " · not found"}
                    </div>
                    {i.order && (
                        <div className={cn("flex items-center gap-1.5 mt-0.5 text-[10px] flex-wrap", isSel ? "text-white/70" : "text-muted")}>
                            <span className={cn("px-1.5 py-0.5 rounded-full font-semibold", getStatusBadgeStyle(i.order.status))}>{orderStatusLabel(i.order.status, i.order.is_return)}</span>
                            <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
                            {i.order.city && <span>· {i.order.city}</span>}
                            <span>· {formatIQD(i.order.price || 0)}</span>
                        </div>
                    )}
                </div>
                <button type="button" title="Remove from list"
                    onClick={(e) => { e.stopPropagation(); session.removeItem(i.key); if (session.selectedKey === i.key) session.setSelectedKey(null); }}
                    className={cn("p-1 rounded-md shrink-0 opacity-0 group-hover:opacity-100 transition-opacity", isSel ? "hover:bg-white/20" : "hover:bg-black/10")}>
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    };

    const confirm = (reasonLabel: string, destinations: ReturnItemDestination[]) => {
        if (!selected?.order) return;
        const current = selected;
        processReturn.mutate(
            { orderId: current.order!.id, tenantId, reasonLabel, changedByName, changedByAvatar, destinations },
            {
                onSuccess: () => {
                    toast.success(`#${current.order!.order_id} — return processed`);
                    session.markProcessed(current.orderId);
                    // Re-fetch so the row's status badge reflects the new 'rejected'
                    // state right away (stays greyed/handled), instead of showing the
                    // stale pre-return status until the order is reselected.
                    void session.refreshItem(current.key);
                    const d = tally(destinations);
                    setSummary((s) => ({ restock: s.restock + d.restock, open_box: s.open_box + d.open_box, write_off: s.write_off + d.write_off }));
                    setLastConfirm({ orderId: current.orderId, deltas: d });
                    const next = session.items.find((i) => (i.result === "needs_action" || i.result === "never_shipped") && i.key !== current.key);
                    session.setSelectedKey(next?.key ?? null);
                },
                onError: () => toast.error("Failed to process return — try again"),
            }
        );
    };

    const handleUndo = () => {
        if (!lastConfirm) return;
        const lc = lastConfirm;
        undoReturn.mutate(lc.orderId, {
            onSuccess: () => {
                toast.success("Last return undone");
                session.markUnprocessed(lc.orderId);
                setSummary((s) => ({ restock: s.restock - lc.deltas.restock, open_box: s.open_box - lc.deltas.open_box, write_off: s.write_off - lc.deltas.write_off }));
                setLastConfirm(null);
                const it = session.items.find((i) => i.orderId === lc.orderId);
                if (it) session.setSelectedKey(it.key);
            },
            onError: () => toast.error("Undo failed"),
        });
    };

    const bulkRestock = () => {
        if (!defaultReason) { toast.error("Pick a default reason first"); return; }
        const targets = session.items.filter((i) => i.result === "needs_action" && i.order);
        if (targets.length === 0) return;
        targets.forEach((t) => {
            const destinations = (t.order!.items || [])
                .filter((it) => it.product_id)
                .map((it) => ({ product_id: it.product_id as string, quantity: it.quantity, dest: "restock" as ReturnDestination }));
            processReturn.mutate(
                { orderId: t.order!.id, tenantId, reasonLabel: defaultReason, changedByName, changedByAvatar, destinations },
                {
                    onSuccess: () => {
                        session.markProcessed(t.orderId);
                        void session.refreshItem(t.key); // keep the status badge in sync after bulk restock
                        const d = tally(destinations);
                        setSummary((s) => ({ restock: s.restock + d.restock, open_box: s.open_box + d.open_box, write_off: s.write_off + d.write_off }));
                    }
                }
            );
        });
        toast.success(`Processing ${targets.length} order(s) as restock…`);
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="md:max-w-7xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <span className="bg-gradient-to-r from-orange-500 to-rose-500 bg-clip-text text-transparent font-extrabold">↩︎ Returns</span>
                        <button
                            type="button"
                            onClick={() => setShowPair((s) => !s)}
                            title="Show the pairing QR to connect or reconnect your phone"
                            className={`text-xs px-2 py-0.5 rounded-full cursor-pointer ${session.phoneConnected ? "bg-[var(--pastel-green)] text-green-700" : "bg-[var(--pastel-yellow)] text-amber-700"}`}>
                            {session.phoneConnected ? "📱 connected · QR" : "📱 tap to pair"}
                        </button>
                        <span className="text-xs text-muted ml-auto">
                            Scanned {session.counts.scanned} · Processed {session.counts.processed} · ⚠ {session.counts.anomalies}
                        </span>
                        {lastConfirm && (
                            <button type="button" onClick={handleUndo} disabled={undoReturn.isPending}
                                title="Undo the last processed return"
                                className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-[var(--card-border)] hover:bg-black/5 disabled:opacity-50">
                                <RotateCcw className="w-3 h-3" /> Undo
                            </button>
                        )}
                        {session.items.length > 0 && (
                            <button type="button"
                                onClick={() => { session.clearSession(); setSummary({ restock: 0, open_box: 0, write_off: 0 }); setLastConfirm(null); }}
                                title="Clear the scanned list and start fresh"
                                className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-[var(--card-border)] hover:bg-black/5">
                                <Trash2 className="w-3 h-3" /> Clear
                            </button>
                        )}
                    </DialogTitle>
                </DialogHeader>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        const v = extractScannedOrderId(manualId);
                        if (v) { session.addByOrderId(v); setManualId(""); setShowPair(false); }
                    }}
                    className="flex items-center gap-2 mb-3"
                >
                    <input
                        value={manualId}
                        onChange={(e) => setManualId(e.target.value)}
                        placeholder="No phone? Type or paste an order ID (or scanned QR) to add…"
                        className="flex-1 text-sm border border-[var(--card-border)] rounded-lg px-3 py-2 bg-white"
                    />
                    <button type="submit" className="px-3 py-2 rounded-lg text-sm font-semibold bg-[var(--ink)] text-white">Add</button>
                </form>

                {session.items.length > 0 && !showPair && (
                    <div className="flex flex-col gap-2 mb-3 text-sm">
                        <div className="flex items-center gap-2">
                            <span className="text-muted whitespace-nowrap">Default reason:</span>
                            <select value={defaultReason} onChange={(e) => setDefaultReason(e.target.value)}
                                className="flex-1 border border-[var(--card-border)] rounded-lg px-2 py-1.5 bg-white text-sm">
                                <option value="">— none (pick per order) —</option>
                                {reasons.map((r) => <option key={r.id} value={r.label_ar}>{r.label_ar}{r.label_en ? ` · ${r.label_en}` : ""}</option>)}
                            </select>
                            <button type="button" onClick={bulkRestock} disabled={!defaultReason}
                                title={defaultReason ? "Process all needs-action orders as restock with the default reason" : "Pick a default reason first"}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--card-border)] disabled:opacity-50 hover:bg-black/5 whitespace-nowrap">
                                <Layers className="w-3.5 h-3.5" /> Restock all
                            </button>
                        </div>
                        {(summary.restock + summary.open_box + summary.write_off) > 0 && (
                            <div className="text-xs text-muted">
                                This session: {summary.restock} restock · {summary.open_box} open-box · {summary.write_off} write-off
                            </div>
                        )}
                    </div>
                )}

                {(session.items.length === 0 || showPair) ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-3">
                        <p className="text-muted">
                            {session.phoneConnected ? "Phone connected — scan this again to re-pair if needed" : "Scan this with your phone to start"}
                        </p>
                        {qr ? (
                            <Image src={qr} alt="Pairing QR" width={220} height={220} unoptimized />
                        ) : (
                            <div className="w-[220px] h-[220px] bg-[var(--background)] rounded-xl" />
                        )}
                        <p className="text-xs text-muted break-all max-w-sm text-center">{session.pairingUrl}</p>
                        {session.items.length > 0 && (
                            <button onClick={() => setShowPair(false)} className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold bg-[var(--ink)] text-white">
                                ← Back to scanned list ({session.counts.scanned})
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex gap-4 min-h-[360px]">
                        <div className="w-1/3 border-r border-[var(--card-border)] pr-3 overflow-y-auto max-h-[60vh]">
                            <div className="flex items-center justify-between px-1 mb-1.5">
                                <span className="text-xs font-bold uppercase tracking-wide text-muted">To handle ({pending.length})</span>
                                <span className="text-[11px] font-semibold text-muted">{session.counts.scanned} scanned</span>
                            </div>
                            {pending.length === 0 && (
                                <div className="text-xs text-muted px-1 py-4 text-center">
                                    {handled.length > 0 ? "All scanned returns handled 🎉" : "Nothing scanned yet."}
                                </div>
                            )}
                            {pending.map(renderRow)}

                            {handled.length > 0 && (
                                <div className="mt-2 border-t border-[var(--card-border)] pt-2">
                                    <button type="button" onClick={() => setHandledOpen((o) => !o)}
                                        className="w-full flex items-center gap-1.5 px-1 py-1 text-xs font-bold uppercase tracking-wide text-muted hover:text-foreground transition-colors">
                                        {handledOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                        Already handled ({handled.length})
                                    </button>
                                    {handledOpen && <div className="mt-1">{handled.map(renderRow)}</div>}
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            {selected?.order ? (
                                <ReturnDetailPanel
                                    key={selected.order.id}
                                    order={selected.order}
                                    isAnomaly={selected.result === "anomaly" || selected.result === "never_shipped"}
                                    isProcessing={processReturn.isPending}
                                    defaultReasonLabel={defaultReason}
                                    onOpenOrder={onOpenOrder}
                                    onConfirm={confirm}
                                    onSkip={() => { session.removeItem(selected.key); session.setSelectedKey(null); }}
                                />
                            ) : selected ? (
                                <div className="text-sm text-rose-600">#{selected.orderId} not found. Check the label or search manually.</div>
                            ) : (
                                <div className="text-sm text-muted">Select a scanned return on the left.</div>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
