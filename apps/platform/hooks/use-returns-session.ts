"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { orderRepository } from "@/lib/repositories/order-repository";
import { classifyScannedOrder, type ScanResult } from "@/lib/returns/classify-scan";
import type { Order } from "@/types/order";

export type { ScanResult };

export interface ScannedReturn {
    key: string;            // unique row key
    orderId: string;        // scanned reference (order_id / sequence number / QR ref)
    order: Order | null;    // resolved order (null if not found)
    result: ScanResult;
    ts: number;
}

const LIST_TTL_MS = 12 * 60 * 60 * 1000; // expire a working list after 12h

function makeToken(): string {
    const raw = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    return raw.replace(/-/g, "").slice(0, 16);
}

export function useReturnsSession(open: boolean) {
    const [token] = useState<string>(() => {
        if (typeof window === "undefined") return makeToken();
        const existing = window.localStorage.getItem("returns:lastToken");
        const t = existing || makeToken();
        window.localStorage.setItem("returns:lastToken", t);
        return t;
    });

    const storageKey = `returns:list:${token}`;
    const [items, setItems] = useState<ScannedReturn[]>(() => {
        if (typeof window === "undefined") return [];
        try {
            const raw = window.localStorage.getItem(`returns:list:${token}`);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.items) && typeof parsed.savedAt === "number") {
                if (Date.now() - parsed.savedAt > LIST_TTL_MS) return [];
                return parsed.items;
            }
            if (Array.isArray(parsed)) return parsed; // legacy bare-array format
            return [];
        } catch { return []; }
    });
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [phoneConnected, setPhoneConnected] = useState(false);
    const itemsRef = useRef(items);
    useEffect(() => { itemsRef.current = items; }, [items]);

    const pairingUrl = useMemo(() => {
        if (typeof window === "undefined") return "";
        return `${window.location.origin}/returns/scan?s=${token}`;
    }, [token]);

    useEffect(() => {
        try {
            window.localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), items }));
        } catch { /* ignore quota */ }
    }, [items, storageKey]);

    useEffect(() => {
        if (!open) return;
        const channel = supabase.channel(`returns:${token}`, { config: { presence: { key: "cockpit" } } });
        channel
            .on("presence", { event: "sync" }, () => {
                const state = channel.presenceState() as Record<string, Array<{ role?: string }>>;
                const roles = Object.values(state).flat().map((p) => p.role);
                setPhoneConnected(roles.includes("scanner"));
            })
            .on("broadcast", { event: "scan" }, async ({ payload }) => {
                const orderId = String(payload?.order_id ?? "").trim();
                if (!orderId) return;
                const dup = itemsRef.current.find((i) => i.orderId === orderId);
                if (dup) {
                    channel.send({ type: "broadcast", event: "ack", payload: { order_id: orderId, result: "duplicate", customer: dup.order?.customer_name } });
                    return;
                }
                // findByScanRef is tenant-scoped via RLS on v_orders_with_risk and
                // resolves order_id, the short sequence_number, or the carrier QR id.
                let order: Order | null = null;
                try { order = await orderRepository.findByScanRef(orderId); } catch { order = null; }
                const result = classifyScannedOrder(order);
                const row: ScannedReturn = { key: `${orderId}-${Date.now()}`, orderId, order, result, ts: Date.now() };
                setItems((prev) => [row, ...prev]);
                setSelectedKey((cur) => cur ?? row.key);
                channel.send({
                    type: "broadcast", event: "ack",
                    payload: { order_id: orderId, result: order ? result : "not_found", customer: order?.customer_name },
                });
            })
            .subscribe(async (status) => {
                if (status === "SUBSCRIBED") await channel.track({ role: "cockpit", online_at: new Date().toISOString() });
            });
        return () => { channel.unsubscribe(); };
    }, [open, token]);

    const markProcessed = useCallback((orderId: string) => {
        setItems((prev) => prev.map((i) => (i.orderId === orderId ? { ...i, result: "done" as ScanResult } : i)));
    }, []);

    const markUnprocessed = useCallback((orderId: string) => {
        setItems((prev) => prev.map((i) => (i.orderId === orderId ? { ...i, result: classifyScannedOrder(i.order) } : i)));
    }, []);

    const removeItem = useCallback((key: string) => {
        setItems((prev) => prev.filter((i) => i.key !== key));
    }, []);

    // Re-fetch an item's order so the panel reflects the current status (it may
    // have changed on another device since it was scanned).
    const refreshItem = useCallback(async (key: string) => {
        const item = itemsRef.current.find((i) => i.key === key);
        if (!item) return;
        let order: Order | null = null;
        try { order = await orderRepository.findByScanRef(item.orderId); } catch { return; }
        setItems((prev) => prev.map((i) => i.key === key
            ? { ...i, order, result: i.result === "done" ? "done" : classifyScannedOrder(order) }
            : i));
    }, []);

    const clearSession = useCallback(() => {
        setItems([]);
        setSelectedKey(null);
        try { window.localStorage.removeItem(storageKey); } catch { /* ignore */ }
    }, [storageKey]);

    const addByOrderId = useCallback(async (orderIdRaw: string) => {
        const orderId = (orderIdRaw || "").trim();
        if (!orderId) return;
        const existing = itemsRef.current.find((i) => i.orderId === orderId);
        if (existing) { setSelectedKey(existing.key); return; }
        let order: Order | null = null;
        try { order = await orderRepository.findByScanRef(orderId); } catch { order = null; }
        const row: ScannedReturn = { key: `${orderId}-${Date.now()}`, orderId, order, result: classifyScannedOrder(order), ts: Date.now() };
        setItems((prev) => [row, ...prev]);
        setSelectedKey(row.key);
    }, []);

    const counts = useMemo(() => ({
        scanned: items.length,
        processed: items.filter((i) => i.result === "done").length,
        anomalies: items.filter((i) => i.result === "anomaly" || i.result === "not_found" || i.result === "never_shipped").length,
    }), [items]);

    return {
        token, pairingUrl, phoneConnected, items, counts, selectedKey, setSelectedKey,
        markProcessed, markUnprocessed, removeItem, clearSession, addByOrderId, refreshItem,
    };
}
