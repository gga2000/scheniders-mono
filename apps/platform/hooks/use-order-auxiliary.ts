"use client";

import { useState, useCallback, useMemo, useEffect, useRef, useLayoutEffect } from "react";
import { supabase, type Order, type RejectionReason, type MessageTemplate } from "@/lib/supabase";
import { normalizePhoneForSearch } from "@/lib/order-utils";

// =============================================
// ORDER AUXILIARY HOOK
// Manages reference data (rejection reasons,
// message templates, blacklist), customer
// history helpers, and analytics/stats.
// =============================================

interface UseOrderAuxiliaryOptions {
    orders: Order[];
    archivedOrders: Order[];
}

export function useOrderAuxiliary({ orders, archivedOrders }: UseOrderAuxiliaryOptions) {
    // =============================================
    // REFERENCE DATA STATE
    // =============================================

    const [auxData, setAuxData] = useState<{
        rejectionReasons: RejectionReason[];
        messageTemplates: MessageTemplate[];
        blacklistedPhones: Set<string>;
    }>({
        rejectionReasons: [],
        messageTemplates: [],
        blacklistedPhones: new Set(),
    });

    // Fetch on mount (only if not already loaded)
    useEffect(() => {
        let mounted = true;
        async function fetchAll() {
            try {
                const [reasonsRes, templatesRes, blacklistRes] = await Promise.all([
                    supabase.from("rejection_reasons").select("*").eq("is_active", true).order("sort_order"),
                    supabase.from("message_templates").select("*").eq("is_active", true).order("sort_order"),
                    supabase.from("blacklist").select("phone")
                ]);

                if (mounted) {
                    setAuxData({
                        rejectionReasons: reasonsRes.data || [],
                        messageTemplates: templatesRes.data || [],
                        blacklistedPhones: new Set((blacklistRes.data || []).map((b: any) => b.phone))
                    });
                }
            } catch (err) {
                console.error("Error fetching auxiliary data:", err);
            }
        }

        if (auxData.rejectionReasons.length === 0) {
            fetchAll();
        }

        return () => { mounted = false; };
    }, []);

    function isBlacklisted(phone: string): boolean {
        return auxData.blacklistedPhones.has(phone);
    }

    // =============================================
    // CUSTOMER HELPERS
    // =============================================

    const getCustomerArchivedCount = useCallback((phone: string) => {
        if (!phone) return 0;
        const normalized = phone.replace(/\s/g, '');
        return archivedOrders.filter(o =>
            o.is_archived && o.phone.replace(/\s/g, '') === normalized
        ).length;
    }, [archivedOrders]);

    function getCustomerHistory(phone: string): Order[] {
        const normalizedPhone = normalizePhoneForSearch(phone);
        return orders
            .filter((order) => normalizePhoneForSearch(order.phone) === normalizedPhone && !order.is_return)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    // Precomputed map for O(1) lookups
    const customerOrderCountsMap = useMemo(() => {
        const counts = new Map<string, number>();
        const processedBaseIds = new Set<string>();

        const getBaseId = (orderId: string | undefined | null): string => {
            if (!orderId) return '';
            const lfMatch = orderId.match(/LF-(\d+)-\d+$/);
            if (lfMatch) return lfMatch[1];
            if (orderId.startsWith('DLV-')) return orderId.replace('DLV-', '');
            const digits = orderId.match(/\d+/);
            return digits ? digits[0] : orderId;
        };

        orders.forEach((order) => {
            if (order.is_archived || order.is_return) return;

            const normalizedPhone = normalizePhoneForSearch(order.phone);
            const baseId = getBaseId(order.order_id);
            const orderDedupKey = `${normalizedPhone}-${baseId}`;

            if (!processedBaseIds.has(orderDedupKey)) {
                processedBaseIds.add(orderDedupKey);
                counts.set(normalizedPhone, (counts.get(normalizedPhone) || 0) + 1);
            }
        });

        return counts;
    }, [orders]);

    const getCustomerOrderCount = useCallback((phone: string, _currentOrderId?: string): number => {
        const normalizedPhone = normalizePhoneForSearch(phone);
        return customerOrderCountsMap.get(normalizedPhone) || 0;
    }, [customerOrderCountsMap]);

    function checkDuplicateOrder(phone: string, items: string[]): Order[] {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const normalizedPhone = normalizePhoneForSearch(phone);

        return orders.filter((order) => {
            if (normalizePhoneForSearch(order.phone) !== normalizedPhone) return false;
            if (order.is_return) return false;
            if (new Date(order.created_at) < sevenDaysAgo) return false;

            const orderItemNames = order.items?.map((i) => i.name.toLowerCase()) || [];
            const hasSimilarItems = items.some((item) =>
                orderItemNames.some((oiName) => oiName.includes(item.toLowerCase()))
            );

            return hasSimilarItems;
        });
    }

    function getDuplicatesForOrder(orderId: string): Order[] {
        const order = orders.find((o) => o.id === orderId);
        if (!order) return [];

        const PHONE_WINDOW_HOURS = 72;
        const PRODUCT_WINDOW_DAYS = 7;

        const phoneWindowStart = new Date(order.created_at);
        phoneWindowStart.setHours(phoneWindowStart.getHours() - PHONE_WINDOW_HOURS);

        const phoneWindowEnd = new Date(order.created_at);
        phoneWindowEnd.setHours(phoneWindowEnd.getHours() + PHONE_WINDOW_HOURS);

        const productWindowStart = new Date(order.created_at);
        productWindowStart.setDate(productWindowStart.getDate() - PRODUCT_WINDOW_DAYS);

        const productWindowEnd = new Date(order.created_at);
        productWindowEnd.setDate(productWindowEnd.getDate() + PRODUCT_WINDOW_DAYS);

        const normalizedOrderPhone = normalizePhoneForSearch(order.phone);
        const orderItemNames = order.items?.map((i) => i.name.toLowerCase()) || [];

        return orders.filter((o) => {
            if (o.id === orderId || o.is_return) return false;
            if (normalizePhoneForSearch(o.phone) !== normalizedOrderPhone) return false;

            const orderDate = new Date(o.created_at);

            if (orderDate >= phoneWindowStart && orderDate <= phoneWindowEnd) {
                return true;
            }

            if (orderDate >= productWindowStart && orderDate <= productWindowEnd && orderItemNames.length > 0) {
                const otherItemNames = o.items?.map((i) => i.name.toLowerCase()) || [];
                const hasOverlap = orderItemNames.some((item) =>
                    otherItemNames.some((other) => other.includes(item) || item.includes(other))
                );
                if (hasOverlap) return true;
            }

            return false;
        });
    }

    function hasDuplicates(orderId: string): boolean {
        return getDuplicatesForOrder(orderId).length > 0;
    }

    function getCustomerOrders(phone: string): Order[] {
        const normalizedPhone = normalizePhoneForSearch(phone);
        if (!normalizedPhone) return [];
        return orders.filter(o => normalizePhoneForSearch(o.phone) === normalizedPhone);
    }

    // =============================================
    // ANALYTICS / STATS
    // =============================================

    const revenueTrends = useMemo(() => {
        const trends: { date: string; revenue: number; orders: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = date.toDateString();
            const dayOrders = orders.filter(o => new Date(o.created_at).toDateString() === dateStr);
            const dayRevenue = dayOrders
                .filter(o => (o.status === "delivered" || o.status === "confirmed") && !o.is_return)
                .reduce((sum, o) => sum + (Number(o.price) || 0), 0);
            trends.push({
                date: date.toLocaleDateString("en-US", { weekday: "short" }),
                revenue: dayRevenue,
                orders: dayOrders.length,
            });
        }
        return trends;
    }, [orders]);

    const velocityMetrics = useMemo(() => {
        const confirmedOrders = orders.filter(o => o.status === "confirmed" || o.status === "delivered");
        const deliveredOrders = orders.filter(o => o.status === "delivered");

        return {
            avgNewToConfirmed: confirmedOrders.length > 0 ? "~2h" : "N/A",
            avgConfirmedToDelivered: deliveredOrders.length > 0 ? "~24h" : "N/A",
            totalProcessed: deliveredOrders.length,
            pendingCount: orders.filter(o => o.status === "new" || o.status === "contacted").length,
        };
    }, [orders]);

    const peakTime = useMemo(() => {
        if (orders.length === 0) return "N/A";
        const hourCounts: Record<number, number> = {};
        orders.forEach(o => {
            const hour = new Date(o.created_at).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });

        let maxHour = 0;
        let maxCount = 0;
        Object.entries(hourCounts).forEach(([h, count]) => {
            if (count > maxCount) {
                maxCount = count;
                maxHour = parseInt(h);
            }
        });

        const ampm = maxHour >= 12 ? 'PM' : 'AM';
        const displayHour = maxHour % 12 || 12;
        return `${displayHour} ${ampm}`;
    }, [orders]);

    const stats = useMemo(() => ({
        totalOrders: orders.length,
        todayOrders: orders.filter((o) => {
            const today = new Date().toDateString();
            return new Date(o.created_at).toDateString() === today;
        }).length,
        totalRevenue: orders
            .filter((o) => o.status === "delivered" && !o.is_return)
            .reduce((sum, o) => sum + (Number(o.price) || 0), 0),
        todayRevenue: orders
            .filter((o) => {
                const today = new Date().toDateString();
                return (
                    new Date(o.created_at).toDateString() === today &&
                    o.status === "delivered" &&
                    !o.is_return
                );
            })
            .reduce((sum, o) => sum + (Number(o.price) || 0), 0),
        averageOrderValue:
            orders.length > 0
                ? orders.reduce((sum, o) => sum + (Number(o.price) || 0), 0) / orders.length
                : 0,
        conversionRate: orders.length > 0
            ? (orders.filter((o) => o.status === "confirmed" || o.status === "delivered").length /
                orders.length) *
            100
            : 0,
        pendingOrders: orders.filter((o) => o.status === "new").length,
        contactedOrders: orders.filter((o) => o.status === "contacted").length,
        confirmedOrders: orders.filter((o) => o.status === "confirmed").length,
        deliveredOrders: orders.filter((o) => o.status === "delivered").length,
        inTransitOrders: orders.filter((o) => o.status === "in_transit").length,
        rejectedOrders: orders.filter((o) => o.status === "rejected").length,
        completedOrders: orders.filter((o) => o.status === "completed").length,
        noResponseOrders: orders.filter((o) => o.status === "no_response").length,
        returnPendingOrders: orders.filter((o) => o.status === "return_pending").length,
        returnOrders: orders.filter((o) => o.is_return).length,
        urgentOrders: orders.filter((o) => o.priority === "urgent").length,
        revenueTrends,
        velocityMetrics,
        peakTime,
    }), [orders, revenueTrends, velocityMetrics, peakTime]);

    const latestFn = {
        isBlacklisted,
        getCustomerHistory,
        getCustomerOrderCount,
        getCustomerArchivedCount,
        checkDuplicateOrder,
        getDuplicatesForOrder,
        hasDuplicates,
        getCustomerOrders,
    };

    const apiRef = useRef(latestFn);

    useLayoutEffect(() => {
        apiRef.current = latestFn;
    });

    const stableAPI = useMemo(() => {
        const proxy: any = {};
        for (const key in latestFn) {
            proxy[key as keyof typeof latestFn] = (...args: any[]) => {
                // @ts-expect-error dynamic wrapper
                return apiRef.current[key as keyof typeof latestFn](...args);
            };
        }
        return proxy as typeof latestFn;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        // Reference data
        rejectionReasons: auxData.rejectionReasons,
        messageTemplates: auxData.messageTemplates,

        // Stats
        stats,

        // Stable Functions
        ...stableAPI,
    };
}
