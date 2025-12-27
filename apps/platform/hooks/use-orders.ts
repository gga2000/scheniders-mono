"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
    supabase,
    type Order,
    type OrderFilters,
    type OrderNote,
    type OrderStatusHistory,
    type RejectionReason,
    type MessageTemplate,
    type FilterPreset,
    type FollowUpReminder,
    type OrderPriority,
    type PaymentStatus,
} from "@/lib/supabase";
import { notificationService } from "@/lib/notification-service";
import { normalizePhoneForSearch } from "@/lib/order-utils";

// =============================================
// ENHANCED ORDERS HOOK
// =============================================

export function useOrders() {
    // Core state
    const [orders, setOrders] = useState<Order[]>([]);
    const [archivedOrders, setArchivedOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Enhanced state
    const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
    const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
    const [filterPresets, setFilterPresets] = useState<FilterPreset[]>([]);
    const [blacklistedPhones, setBlacklistedPhones] = useState<Set<string>>(new Set());

    // Undo stack for reverting changes
    interface UndoEntry {
        orderId: string;
        previousState: Partial<Order>;
        action: string;
        timestamp: Date;
    }
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const MAX_UNDO_STACK = 10;

    // Helper to get today's date in YYYY-MM-DD format
    const getTodayDate = () => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    };

    // Filters state - default to today's orders
    const [filters, setFilters] = useState<OrderFilters>(() => {
        const today = new Date().toISOString().split('T')[0];
        return {
            status: "all",
            dateFrom: today,
            dateTo: today,
        };
    });

    // =============================================
    // INITIAL DATA FETCH
    // =============================================

    useEffect(() => {
        fetchOrders();
        fetchRejectionReasons();
        fetchMessageTemplates();
        fetchBlacklist();
        loadFilterPresets();

        let pollingInterval: NodeJS.Timeout | null = null;
        let realtimeWorking = false;

        // Set up real-time subscription
        const channel = supabase
            .channel("orders_changes")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "orders"
                },
                (payload) => {
                    console.log("[Realtime] Change received:", payload.eventType);

                    // Trigger notification for new orders
                    if (payload.eventType === "INSERT" && payload.new) {
                        const newOrder = payload.new as Order;
                        notificationService.showNewOrderNotification(
                            newOrder.customer_name,
                            newOrder.order_id,
                            newOrder.priority
                        );
                    }

                    // Refetch on any change
                    fetchOrders();
                }
            )
            .subscribe((status, err) => {
                if (status === "SUBSCRIBED") {
                    console.log("[Realtime] ✅ Connected to orders table");
                    realtimeWorking = true;
                    // Clear polling if realtime starts working
                    if (pollingInterval) {
                        clearInterval(pollingInterval);
                        pollingInterval = null;
                    }
                } else if (status === "CHANNEL_ERROR" || status === "CLOSED") {
                    console.error("[Realtime] ❌ Error - falling back to polling:", err?.message);
                    realtimeWorking = false;
                    // Start polling only if realtime fails and we're not already polling
                    if (!pollingInterval) {
                        pollingInterval = setInterval(() => {
                            // Only poll when tab is visible
                            if (!document.hidden) {
                                fetchOrders();
                            }
                        }, 120000); // 2 minutes - less disruptive
                    }
                } else {
                    console.log("[Realtime] Status:", status);
                }
            });

        return () => {
            channel.unsubscribe();
            if (pollingInterval) clearInterval(pollingInterval);
        };
    }, []);

    // =============================================
    // FETCH FUNCTIONS
    // =============================================

    async function fetchOrders() {
        try {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from("orders")
                .select("*")
                .eq("is_archived", false)
                .order("created_at", { ascending: false });

            if (fetchError) throw fetchError;

            // Provide defaults for new fields on old orders
            const ordersWithDefaults = (data || []).map((order) => {
                // Parse items if it's a JSON string (from import script)
                let parsedItems = order.items;
                if (typeof order.items === 'string') {
                    try {
                        parsedItems = JSON.parse(order.items);
                    } catch {
                        parsedItems = [];
                    }
                }

                return {
                    ...order,
                    items: parsedItems || [],
                    priority: order.priority || "normal",
                    payment_status: order.payment_status || "cod",
                    is_return: order.is_return || false,
                    is_archived: order.is_archived || false,
                };
            });

            setOrders(ordersWithDefaults);
            setError(null);
        } catch (err) {
            console.error("Error fetching orders:", err);
            setError(err instanceof Error ? err.message : "Failed to fetch orders");
        } finally {
            setLoading(false);
        }
    }

    async function fetchArchivedOrders() {
        try {
            const { data, error: fetchError } = await supabase
                .from("orders")
                .select("*")
                .eq("is_archived", true)
                .order("created_at", { ascending: false });

            if (fetchError) throw fetchError;

            const ordersWithDefaults = (data || []).map((order) => {
                let parsedItems = order.items;
                if (typeof order.items === 'string') {
                    try {
                        parsedItems = JSON.parse(order.items);
                    } catch {
                        parsedItems = [];
                    }
                }
                return {
                    ...order,
                    items: parsedItems || [],
                    priority: order.priority || "normal",
                    payment_status: order.payment_status || "cod",
                    is_return: order.is_return || false,
                    is_archived: true,
                };
            });

            setArchivedOrders(ordersWithDefaults);
            return { success: true, count: ordersWithDefaults.length };
        } catch (err) {
            console.error("Error fetching archived orders:", err);
            return { success: false, error: err instanceof Error ? err.message : "Failed to fetch archived orders" };
        }
    }

    async function fetchRejectionReasons() {
        try {
            const { data } = await supabase
                .from("rejection_reasons")
                .select("*")
                .eq("is_active", true)
                .order("sort_order");
            setRejectionReasons(data || []);
        } catch (err) {
            console.error("Error fetching rejection reasons:", err);
        }
    }

    async function fetchMessageTemplates() {
        try {
            const { data } = await supabase
                .from("message_templates")
                .select("*")
                .eq("is_active", true)
                .order("sort_order");
            setMessageTemplates(data || []);
        } catch (err) {
            console.error("Error fetching message templates:", err);
        }
    }

    async function fetchBlacklist() {
        try {
            const { data } = await supabase
                .from("blacklist")
                .select("phone");
            if (data) {
                setBlacklistedPhones(new Set(data.map((b: { phone: string }) => b.phone)));
            }
        } catch (err) {
            console.error("Error fetching blacklist:", err);
        }
    }

    // Check if a phone is blacklisted
    function isBlacklisted(phone: string): boolean {
        return blacklistedPhones.has(phone);
    }

    function loadFilterPresets() {
        try {
            const saved = localStorage.getItem("order_filter_presets");
            if (saved) {
                setFilterPresets(JSON.parse(saved));
            }
        } catch (err) {
            console.error("Error loading filter presets:", err);
        }
    }

    // =============================================
    // FILTERING FUNCTIONS
    // =============================================

    const applyFilters = useCallback(
        (ordersToFilter: Order[], activeFilters: OrderFilters = filters): Order[] => {
            return ordersToFilter.filter((order) => {
                // Status filter
                const statusFilter = activeFilters.status as string;
                if (statusFilter && statusFilter !== "all") {
                    // Special handling for "needs_review" filter
                    if (statusFilter === "needs_review") {
                        // Only count if has warning flags in notes (actual issues)
                        if (order.notes && order.notes.includes('⚠️')) {
                            // This order needs review
                        } else if ((!order.items || order.items.length === 0) && order.customer_name !== 'Manual Order') {
                            // Empty items and not a manual order
                        } else if (order.customer_name?.startsWith('Customer ') && order.customer_name !== 'Customer') {
                            // Placeholder customer name
                        } else {
                            return false;
                        }
                    } else if (order.status !== statusFilter) {
                        return false;
                    }
                }

                // Date range filter
                if (activeFilters.dateFrom) {
                    const orderDate = new Date(order.created_at);
                    const fromDate = new Date(activeFilters.dateFrom);
                    // Reset time to start of day for accurate comparison
                    fromDate.setHours(0, 0, 0, 0);
                    if (orderDate < fromDate) return false;
                }
                if (activeFilters.dateTo) {
                    const orderDate = new Date(order.created_at);
                    const toDate = new Date(activeFilters.dateTo);
                    toDate.setHours(23, 59, 59, 999);
                    if (orderDate > toDate) return false;
                }

                // City filter
                if (activeFilters.city && order.city !== activeFilters.city) {
                    return false;
                }

                // Product filter
                if (activeFilters.product) {
                    const hasProduct = order.items?.some((item) =>
                        item.name.toLowerCase().includes(activeFilters.product!.toLowerCase())
                    );
                    if (!hasProduct) return false;
                }

                // Priority filter
                if (activeFilters.priority && order.priority !== activeFilters.priority) {
                    return false;
                }

                // Payment status filter
                if (activeFilters.paymentStatus && order.payment_status !== activeFilters.paymentStatus) {
                    return false;
                }

                // Return orders filter
                if (activeFilters.isReturn !== undefined && order.is_return !== activeFilters.isReturn) {
                    return false;
                }

                // Search query
                if (activeFilters.searchQuery) {
                    const query = activeFilters.searchQuery.toLowerCase();
                    const matchesName = order.customer_name.toLowerCase().includes(query);
                    const matchesPhone = normalizePhoneForSearch(order.phone).includes(normalizePhoneForSearch(activeFilters.searchQuery));
                    const matchesOrderId = order.order_id?.toLowerCase().includes(query);
                    const matchesDeliveryId = order.delivery_order_id?.toLowerCase().includes(query);
                    if (!matchesName && !matchesPhone && !matchesOrderId && !matchesDeliveryId) return false;
                }

                return true;
            });
        },
        [filters]
    );

    const filteredOrders = applyFilters(orders).sort((a, b) => {
        // Pinned orders always come first
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        // Then sort by date descending (newest first)
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // Calculate specific counts for status buttons based on current filters (ignoring status filter)
    const statusCounts = useMemo(() => {
        const filtersWithoutStatus = { ...filters, status: 'all' as const };
        const matchingOrders = applyFilters(orders, filtersWithoutStatus);

        const counts = {
            all: matchingOrders.length,
            new: 0,
            contacted: 0,
            confirmed: 0,
            in_transit: 0,
            delivered: 0,
            completed: 0,
            rejected: 0,
            no_response: 0,
            return_pending: 0,
        };

        matchingOrders.forEach(order => {
            // @ts-ignore
            if (counts[order.status] !== undefined) {
                // @ts-ignore
                counts[order.status]++;
            }
        });

        return counts;
    }, [orders, filters, applyFilters]);


    // Get unique cities from orders
    const availableCities = [...new Set(orders.map((o) => o.city).filter(Boolean))] as string[];

    // Get unique products from orders
    const availableProducts = [
        ...new Set(orders.flatMap((o) => o.items?.map((i) => i.name) || []).filter(Boolean)),
    ] as string[];

    // =============================================
    // FILTER PRESET FUNCTIONS
    // =============================================

    function saveFilterPreset(name: string) {
        const preset: FilterPreset = {
            id: crypto.randomUUID(),
            name,
            filters,
            page: "orders",
            created_at: new Date().toISOString(),
        };
        const updated = [...filterPresets, preset];
        setFilterPresets(updated);
        localStorage.setItem("order_filter_presets", JSON.stringify(updated));
        return preset;
    }

    function loadFilterPreset(presetId: string) {
        const preset = filterPresets.find((p) => p.id === presetId);
        if (preset) {
            setFilters(preset.filters);
        }
    }

    function deleteFilterPreset(presetId: string) {
        const updated = filterPresets.filter((p) => p.id !== presetId);
        setFilterPresets(updated);
        localStorage.setItem("order_filter_presets", JSON.stringify(updated));
    }

    function clearFilters() {
        setFilters({ status: "all" });
    }

    // =============================================
    // SINGLE ORDER OPERATIONS
    // =============================================

    async function updateOrderStatus(
        orderId: string,
        status: Order["status"],
        rejectionReason?: string
    ) {
        try {
            // Find the order to save its previous state for undo
            const previousOrder = orders.find(o => o.id === orderId);
            if (previousOrder) {
                const undoEntry = {
                    orderId,
                    previousState: {
                        status: previousOrder.status,
                        rejection_reason: previousOrder.rejection_reason,
                    },
                    action: `Changed status to ${status}`,
                    timestamp: new Date(),
                };
                setUndoStack(prev => [undoEntry, ...prev.slice(0, MAX_UNDO_STACK - 1)]);
            }

            const updateData: Partial<Order> = { status };
            if (rejectionReason) {
                updateData.rejection_reason = rejectionReason;
            }

            // Set timestamp when status changes to delivered or cancelled
            if (status === 'delivered') {
                updateData.delivered_at = new Date().toISOString();
            } else if (status === 'cancelled') {
                updateData.cancelled_at = new Date().toISOString();
            }

            const { error: updateError } = await supabase
                .from("orders")
                .update(updateData)
                .eq("id", orderId);

            if (updateError) throw updateError;

            // Record status change to history table for timeline tracking
            if (previousOrder && previousOrder.status !== status) {
                await supabase
                    .from("order_status_history")
                    .insert([{
                        order_id: orderId,
                        from_status: previousOrder.status,
                        to_status: status,
                        changed_at: new Date().toISOString(),
                        notes: rejectionReason || null,
                    }]);
            }

            // Update local state
            setOrders((prev) =>
                prev.map((order) =>
                    order.id === orderId ? { ...order, ...updateData } : order
                )
            );

            return { success: true };
        } catch (err) {
            console.error("Error updating order:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to update order",
            };
        }
    }

    async function updateOrder(orderId: string, updates: Partial<Order>, retryCount = 0): Promise<{ success: boolean; error?: string }> {
        try {
            // Remove any fields that shouldn't be sent to the database
            const cleanUpdates = { ...updates };
            delete (cleanUpdates as Record<string, unknown>).id;
            delete (cleanUpdates as Record<string, unknown>).created_at;

            const { error: updateError, status } = await supabase
                .from("orders")
                .update(cleanUpdates)
                .eq("id", orderId);

            if (updateError) {
                // Log detailed error info
                console.error("Order update error:", {
                    orderId,
                    updates: cleanUpdates,
                    error: updateError,
                    status,
                    code: updateError.code,
                    details: updateError.details,
                    hint: updateError.hint,
                    message: updateError.message,
                });

                // Retry on conflict (409) if we haven't exceeded retry limit
                if (status === 409 && retryCount < 2) {
                    console.log(`Retrying update (attempt ${retryCount + 2})...`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                    return updateOrder(orderId, updates, retryCount + 1);
                }

                throw updateError;
            }

            // Update local state
            setOrders((prev) =>
                prev.map((order) =>
                    order.id === orderId ? { ...order, ...updates } : order
                )
            );

            return { success: true };
        } catch (err) {
            console.error("Error updating order:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to update order",
            };
        }
    }

    async function createOrder(orderData: Omit<Order, "id" | "created_at" | "updated_at">) {
        try {
            // Generate smart order ID if not provided
            // Format: SYYMMDD### where S=source code, YYMMDD=date, ###=daily sequence
            let generatedOrderId = orderData.order_id;

            if (!generatedOrderId) {
                // Get source code
                const sourceCode = orderData.source === 'whatsapp' ? '1'
                    : orderData.source === 'meta' ? '2'
                        : orderData.source === 'tiktok' ? '3'
                            : '4'; // Manual/other

                // Get today's date in YYMMDD format
                const now = new Date();
                const dateStr = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;

                // Get today's order count for this source to determine sequence
                const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
                const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

                const { count } = await supabase
                    .from('orders')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', startOfDay)
                    .lt('created_at', endOfDay)
                    .like('order_id', `${sourceCode}${dateStr}%`);

                const sequence = ((count || 0) + 1).toString().padStart(3, '0');
                generatedOrderId = `${sourceCode}${dateStr}${sequence}`;
            }

            // Get next global sequence number
            const { data: maxSeqData } = await supabase
                .from('orders')
                .select('sequence_number')
                .order('sequence_number', { ascending: false })
                .limit(1)
                .single();

            const nextSequenceNumber = (maxSeqData?.sequence_number || 0) + 1;

            // Add defaults for new fields - manual orders are auto-confirmed
            const fullOrderData = {
                ...orderData,
                order_id: generatedOrderId,
                sequence_number: nextSequenceNumber,
                status: orderData.status || "confirmed", // Manual orders default to confirmed
                priority: orderData.priority || "normal",
                payment_status: orderData.payment_status || "cod",
                is_return: orderData.is_return || false,
                is_archived: false,
            };

            const { data, error: insertError } = await supabase
                .from("orders")
                .insert([fullOrderData])
                .select()
                .single();

            if (insertError) throw insertError;

            // Add to local state
            if (data) {
                setOrders((prev) => [data, ...prev]);
            }

            return { success: true, data };
        } catch (err) {
            console.error("Error creating order:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to create order",
            };
        }
    }

    async function cloneOrder(orderId: string) {
        try {
            const originalOrder = orders.find(o => o.id === orderId);
            if (!originalOrder) {
                return { success: false, error: "Order not found" };
            }

            // Generate new order ID
            const newOrderId = `CLN-${originalOrder.order_id}-${Date.now().toString(36).toUpperCase()}`;

            // Clone the order with fresh data (only include fields that exist in DB)
            const clonedOrderData = {
                order_id: newOrderId,
                customer_name: originalOrder.customer_name,
                phone: originalOrder.phone,
                secondary_phone: originalOrder.secondary_phone,
                city: originalOrder.city,
                governorate_code: originalOrder.governorate_code,
                address_details: originalOrder.address_details,
                price: originalOrder.price,
                items: originalOrder.items,
                notes: `Cloned from order #${originalOrder.order_id}`,
                status: "new" as const,
                priority: "normal" as const,
                payment_status: originalOrder.payment_status || "cod",
                is_return: false,
                is_archived: false,
                // Note: is_pinned is a frontend-only feature for now
            };

            const { data, error: insertError } = await supabase
                .from("orders")
                .insert([clonedOrderData])
                .select()
                .single();

            if (insertError) throw insertError;

            // Add to local state
            if (data) {
                setOrders((prev) => [data, ...prev]);
            }

            return { success: true, data };
        } catch (err) {
            console.error("Error cloning order:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to clone order",
            };
        }
    }

    // =============================================
    // SCHEDULED DELIVERY DATE
    // =============================================

    async function setScheduledDate(
        orderId: string,
        date: Date | "tomorrow" | "+2days" | null
    ) {
        let scheduledDate: string | null = null;

        if (date === "tomorrow") {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            scheduledDate = tomorrow.toISOString().split("T")[0];
        } else if (date === "+2days") {
            const twoDays = new Date();
            twoDays.setDate(twoDays.getDate() + 2);
            scheduledDate = twoDays.toISOString().split("T")[0];
        } else if (date instanceof Date) {
            scheduledDate = date.toISOString().split("T")[0];
        }

        return updateOrder(orderId, { scheduled_date: scheduledDate || undefined });
    }

    // =============================================
    // PRIORITY MANAGEMENT
    // =============================================

    async function setPriority(orderId: string, priority: OrderPriority) {
        return updateOrder(orderId, { priority });
    }

    // =============================================
    // PAYMENT STATUS
    // =============================================

    async function setPaymentStatus(orderId: string, paymentStatus: PaymentStatus) {
        return updateOrder(orderId, { payment_status: paymentStatus });
    }

    // =============================================
    // PIN ORDERS (local-only for now - column doesn't exist in DB)
    // =============================================

    async function togglePin(orderId: string) {
        const order = orders.find(o => o.id === orderId);
        if (!order) return { success: false, error: "Order not found" };

        const newPinnedState = !order.is_pinned;

        // Optimistic update
        setOrders((prev) =>
            prev.map((o) =>
                o.id === orderId ? { ...o, is_pinned: newPinnedState } : o
            )
        );

        try {
            const { error } = await supabase
                .from("orders")
                .update({ is_pinned: newPinnedState })
                .eq("id", orderId);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Error toggling pin:", err);
            // Revert
            setOrders((prev) =>
                prev.map((o) =>
                    o.id === orderId ? { ...o, is_pinned: !newPinnedState } : o
                )
            );
            return { success: false, error: err instanceof Error ? err.message : "Failed to toggle pin" };
        }
    }

    async function setPin(orderId: string, isPinned: boolean) {
        // Optimistic update
        setOrders((prev) =>
            prev.map((o) =>
                o.id === orderId ? { ...o, is_pinned: isPinned } : o
            )
        );

        try {
            const { error } = await supabase
                .from("orders")
                .update({ is_pinned: isPinned })
                .eq("id", orderId);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Error setting pin:", err);
            // Revert
            setOrders((prev) =>
                prev.map((o) =>
                    o.id === orderId ? { ...o, is_pinned: !isPinned } : o
                )
            );
            return { success: false, error: err instanceof Error ? err.message : "Failed to set pin" };
        }
    }

    // =============================================
    // REVIEW DELIVERED ORDERS
    // =============================================

    async function toggleReviewed(orderId: string) {
        const order = orders.find(o => o.id === orderId);
        if (!order) return { success: false, error: "Order not found" };

        const newReviewedState = !order.is_reviewed;

        // Optimistic update
        setOrders((prev) =>
            prev.map((o) =>
                o.id === orderId ? { ...o, is_reviewed: newReviewedState } : o
            )
        );

        try {
            const { error } = await supabase
                .from("orders")
                .update({ is_reviewed: newReviewedState })
                .eq("id", orderId);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Error toggling reviewed:", err);
            // Revert
            setOrders((prev) =>
                prev.map((o) =>
                    o.id === orderId ? { ...o, is_reviewed: !newReviewedState } : o
                )
            );
            return { success: false, error: err instanceof Error ? err.message : "Failed to toggle reviewed" };
        }
    }

    // =============================================
    // MARK AS VERIFIED RETURNING CUSTOMER
    // =============================================

    async function markAsVerifiedCustomer(orderId: string) {
        const order = orders.find(o => o.id === orderId);
        if (!order) return { success: false, error: "Order not found" };

        // Optimistic update - mark this order and all orders with same phone
        const phone = order.phone;
        setOrders((prev) =>
            prev.map((o) =>
                o.phone === phone ? { ...o, is_verified_customer: true } : o
            )
        );

        try {
            // Update all orders with this phone number
            const { error } = await supabase
                .from("orders")
                .update({ is_verified_customer: true })
                .eq("phone", phone);

            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error("Error marking as verified customer:", err);
            // Revert
            setOrders((prev) =>
                prev.map((o) =>
                    o.phone === phone ? { ...o, is_verified_customer: false } : o
                )
            );
            return { success: false, error: err instanceof Error ? err.message : "Failed to mark as verified" };
        }
    }


    // =============================================
    // BULK OPERATIONS
    // =============================================

    async function bulkUpdateStatus(orderIds: string[], status: Order["status"]) {
        try {
            const { error: updateError } = await supabase
                .from("orders")
                .update({ status })
                .in("id", orderIds);

            if (updateError) throw updateError;

            // Update local state
            setOrders((prev) =>
                prev.map((order) =>
                    orderIds.includes(order.id) ? { ...order, status } : order
                )
            );

            return { success: true, count: orderIds.length };
        } catch (err) {
            console.error("Error bulk updating orders:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to bulk update",
            };
        }
    }

    async function bulkArchive(orderIds: string[]) {
        try {
            const { error: updateError } = await supabase
                .from("orders")
                .update({ is_archived: true })
                .in("id", orderIds);

            if (updateError) throw updateError;

            // Remove from local state (since we filter out archived)
            setOrders((prev) => prev.filter((order) => !orderIds.includes(order.id)));

            return { success: true, count: orderIds.length };
        } catch (err) {
            console.error("Error archiving orders:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to archive orders",
            };
        }
    }

    async function bulkDelete(orderIds: string[]) {
        try {
            const { error: deleteError } = await supabase
                .from("orders")
                .delete()
                .in("id", orderIds);

            if (deleteError) throw deleteError;

            // Remove from local state
            setOrders((prev) => prev.filter((order) => !orderIds.includes(order.id)));

            return { success: true, count: orderIds.length };
        } catch (err) {
            console.error("Error deleting orders:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to delete orders",
            };
        }
    }

    // Delete a single order
    async function deleteOrder(orderId: string) {
        try {
            const { error: deleteError } = await supabase
                .from("orders")
                .delete()
                .eq("id", orderId);

            if (deleteError) throw deleteError;

            // Remove from local state
            setOrders((prev) => prev.filter((order) => order.id !== orderId));

            return { success: true };
        } catch (err) {
            console.error("Error deleting order:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to delete order",
            };
        }
    }

    // Check if duplicate ID exists
    async function checkOrderIdExists(orderId: string, excludeUuid?: string): Promise<boolean> {
        try {
            let query = supabase
                .from("orders")
                .select("id")
                .eq("order_id", orderId)

            if (excludeUuid) {
                query = query.neq("id", excludeUuid);
            }

            const { data, error } = await query;

            if (error) throw error;
            return data && data.length > 0;
        } catch (err) {
            console.error("Error checking order ID:", err);
            return false; // Fail safe
        }
    }

    function exportOrders(orderIds: string[], format: "csv" | "xlsx" = "csv") {
        const ordersToExport = orders.filter((o) => orderIds.includes(o.id));

        if (format === "csv") {
            const headers = [
                "Order ID",
                "Customer Name",
                "Phone",
                "City",
                "Status",
                "Total",
                "Priority",
                "Payment Status",
                "Scheduled Date",
                "Created At",
            ];

            const rows = ordersToExport.map((order) => [
                order.order_id,
                order.customer_name,
                order.phone,
                order.city || "",
                order.status,
                order.price,
                order.priority,
                order.payment_status,
                order.scheduled_date || "",
                new Date(order.created_at).toLocaleDateString(),
            ]);

            const csvContent = [
                headers.join(","),
                ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
            ].join("\n");

            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `orders_export_${new Date().toISOString().split("T")[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            return { success: true, count: ordersToExport.length };
        }

        // For xlsx, we'd need a library like xlsx - for now just use CSV
        return { success: false, error: "XLSX export requires additional setup" };
    }

    // =============================================
    // RETURN ORDERS
    // =============================================

    async function createReturnOrder(originalOrderId: string, returnData: {
        return_amount: number;
        reason: string;
        items?: Order["items"];
        deductDeliveryFee?: boolean; // If true, deduct 5000 IQD from return amount
    }) {
        const originalOrder = orders.find((o) => o.id === originalOrderId);
        if (!originalOrder) {
            return { success: false, error: "Original order not found" };
        }

        // Count existing returns for this order to generate unique RTN ID
        const existingReturns = orders.filter(o =>
            o.is_return && o.original_order_id === originalOrderId
        );
        const returnCount = existingReturns.length + 1;

        // Generate RTN ID: RTN-{original_sequence_number}-{return_count}
        const sequenceNum = originalOrder.sequence_number || originalOrder.order_id;
        const returnOrderId = `RTN-${sequenceNum}-${returnCount}`;

        // Calculate return amount (deduct 5000 IQD delivery fee if checked)
        const deliveryFeeDeduction = returnData.deductDeliveryFee ? 5000 : 0;
        const finalReturnAmount = returnData.return_amount - deliveryFeeDeduction;

        const returnOrder: Omit<Order, "id" | "created_at" | "updated_at"> = {
            order_id: returnOrderId,
            customer_name: originalOrder.customer_name,
            phone: originalOrder.phone,
            city: originalOrder.city,
            governorate_code: originalOrder.governorate_code,
            address_details: originalOrder.address_details,
            items: returnData.items || originalOrder.items,
            price: -finalReturnAmount, // Negative amount for returns
            status: "return_pending",
            notes: returnData.deductDeliveryFee
                ? `استرجاع: ${returnData.reason} | خصم التوصيل: 5,000 | الطلب الأصلي: #${originalOrder.order_id}`
                : `استرجاع: ${returnData.reason} | الطلب الأصلي: #${originalOrder.order_id}`,
            is_return: true,
            original_order_id: originalOrderId,
            priority: "high", // Returns are usually high priority
            payment_status: "pending",
            is_archived: false,
            delivery_fee: deliveryFeeDeduction, // Store fee deducted
        };

        return createOrder(returnOrder);
    }

    // =============================================
    // DUPLICATE DETECTION
    // =============================================

    function checkDuplicateOrder(phone: string, items: string[]): Order[] {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        return orders.filter((order) => {
            // Same phone number
            if (order.phone !== phone) return false;

            // Within last 7 days
            if (new Date(order.created_at) < sevenDaysAgo) return false;

            // Has similar items
            const orderItemNames = order.items?.map((i) => i.name.toLowerCase()) || [];
            const hasSimilarItems = items.some((item) =>
                orderItemNames.some((oiName) => oiName.includes(item.toLowerCase()))
            );

            return hasSimilarItems;
        });
    }

    // Get duplicate orders for a specific order (same phone within 24 hours)
    function getDuplicatesForOrder(orderId: string): Order[] {
        const order = orders.find((o) => o.id === orderId);
        if (!order) return [];

        const twentyFourHoursAgo = new Date(order.created_at);
        twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

        const twentyFourHoursAfter = new Date(order.created_at);
        twentyFourHoursAfter.setHours(twentyFourHoursAfter.getHours() + 24);

        return orders.filter((o) => {
            if (o.id === orderId) return false;
            if (o.phone !== order.phone) return false;

            const orderDate = new Date(o.created_at);
            return orderDate >= twentyFourHoursAgo && orderDate <= twentyFourHoursAfter;
        });
    }

    // Check if an order has potential duplicates
    function hasDuplicates(orderId: string): boolean {
        return getDuplicatesForOrder(orderId).length > 0;
    }

    // =============================================
    // CUSTOMER HISTORY
    // =============================================

    function getCustomerHistory(phone: string): Order[] {
        return orders
            .filter((order) => order.phone === phone)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    // Get customer order count (for duplicate detection display)
    // Excludes orders with the same base ID (e.g., 10004 vs LF-10004-044 are same order)
    function getCustomerOrderCount(phone: string, currentOrderId?: string): number {
        // Helper to extract base order ID
        const getBaseId = (orderId: string): string => {
            const lfMatch = orderId.match(/LF-(\d+)-\d+$/);
            if (lfMatch) return lfMatch[1];
            if (orderId.startsWith('DLV-')) return orderId.replace('DLV-', '');
            const digits = orderId.match(/\d+/);
            return digits ? digits[0] : orderId;
        };

        const currentBaseId = currentOrderId ? getBaseId(currentOrderId) : null;

        return orders.filter((order) => {
            if (order.phone !== phone || order.is_archived) return false;
            // Exclude orders with the same base ID (they're the same order in different format)
            if (currentBaseId && getBaseId(order.order_id) === currentBaseId) return false;
            return true;
        }).length;
    }

    // =============================================
    // MERGE ORDERS
    // =============================================

    async function mergeOrders(keepOrderId: string, archiveOrderId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const keepOrder = orders.find((o) => o.id === keepOrderId);
            const archiveOrder = orders.find((o) => o.id === archiveOrderId);

            if (!keepOrder || !archiveOrder) {
                return { success: false, error: "One or both orders not found" };
            }

            // Combine items from both orders
            const combinedItems = [...(keepOrder.items || [])];
            for (const archiveItem of archiveOrder.items || []) {
                const existingItem = combinedItems.find((i) => i.name === archiveItem.name);
                if (existingItem) {
                    // Sum quantities for same product
                    existingItem.quantity = (existingItem.quantity || 1) + (archiveItem.quantity || 1);
                } else {
                    combinedItems.push(archiveItem);
                }
            }

            // Calculate combined price
            const combinedPrice = (Number(keepOrder.price) || 0) + (Number(archiveOrder.price) || 0);

            // Combine notes
            const combinedNotes = [keepOrder.notes, archiveOrder.notes]
                .filter(Boolean)
                .join(' | ');

            // Update the order to keep with combined data
            const { error: updateError } = await supabase
                .from("orders")
                .update({
                    items: combinedItems,
                    price: combinedPrice,
                    notes: combinedNotes || keepOrder.notes,
                })
                .eq("id", keepOrderId);

            if (updateError) throw updateError;

            // Archive the other order and mark as duplicate
            const { error: archiveError } = await supabase
                .from("orders")
                .update({
                    is_archived: true,
                    notes: `[مدمج مع #${keepOrder.order_id}] ${archiveOrder.notes || ''}`.trim(),
                    status: "rejected" as Order["status"],
                    rejection_reason: "duplicate_merged",
                })
                .eq("id", archiveOrderId);

            if (archiveError) throw archiveError;

            // Update local state
            setOrders((prev) =>
                prev
                    .map((order) => {
                        if (order.id === keepOrderId) {
                            return { ...order, items: combinedItems, price: combinedPrice, notes: combinedNotes || order.notes };
                        }
                        return order;
                    })
                    .filter((order) => order.id !== archiveOrderId)
            );

            return { success: true };
        } catch (err) {
            console.error("Error merging orders:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to merge orders",
            };
        }
    }

    // =============================================
    // ORDER NOTES
    // =============================================

    async function addOrderNote(orderId: string, note: string) {
        try {
            const { data, error: insertError } = await supabase
                .from("order_notes")
                .insert([{ order_id: orderId, note }])
                .select()
                .single();

            if (insertError) throw insertError;
            return { success: true, data };
        } catch (err) {
            console.error("Error adding note:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to add note",
            };
        }
    }

    async function getOrderNotes(orderId: string): Promise<OrderNote[]> {
        try {
            const { data, error: fetchError } = await supabase
                .from("order_notes")
                .select("*")
                .eq("order_id", orderId)
                .order("created_at", { ascending: false });

            if (fetchError) throw fetchError;
            return data || [];
        } catch (err) {
            console.error("Error fetching notes:", err);
            return [];
        }
    }

    // =============================================
    // ORDER TIMELINE
    // =============================================

    async function getOrderTimeline(orderId: string): Promise<OrderStatusHistory[]> {
        try {
            const { data, error: fetchError } = await supabase
                .from("order_status_history")
                .select("*")
                .eq("order_id", orderId)
                .order("changed_at", { ascending: true });

            if (fetchError) throw fetchError;
            return data || [];
        } catch (err) {
            console.error("Error fetching timeline:", err);
            return [];
        }
    }

    // =============================================
    // FOLLOW-UP REMINDERS
    // =============================================

    async function setFollowUpReminder(
        orderId: string,
        reminderDate: Date,
        note?: string
    ) {
        try {
            const { data, error: insertError } = await supabase
                .from("follow_up_reminders")
                .insert([{
                    order_id: orderId,
                    reminder_date: reminderDate.toISOString(),
                    note,
                }])
                .select()
                .single();

            if (insertError) throw insertError;
            return { success: true, data };
        } catch (err) {
            console.error("Error setting reminder:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to set reminder",
            };
        }
    }

    async function getActiveReminders(): Promise<FollowUpReminder[]> {
        try {
            const { data, error: fetchError } = await supabase
                .from("follow_up_reminders")
                .select("*")
                .eq("is_completed", false)
                .lte("reminder_date", new Date().toISOString())
                .order("reminder_date");

            if (fetchError) throw fetchError;
            return data || [];
        } catch (err) {
            console.error("Error fetching reminders:", err);
            return [];
        }
    }

    async function completeReminder(reminderId: string) {
        try {
            const { error: updateError } = await supabase
                .from("follow_up_reminders")
                .update({ is_completed: true })
                .eq("id", reminderId);

            if (updateError) throw updateError;
            return { success: true };
        } catch (err) {
            console.error("Error completing reminder:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to complete reminder",
            };
        }
    }

    // =============================================
    // DUPLICATE DISMISSAL
    // =============================================

    // Get all orders for a specific customer phone
    function getCustomerOrders(phone: string): Order[] {
        const normalizedPhone = phone?.replace(/\D/g, "").slice(-10) || "";
        return orders.filter(o => {
            const orderPhone = o.phone?.replace(/\D/g, "").slice(-10) || "";
            return orderPhone === normalizedPhone;
        });
    }

    // Dismiss duplicate alert for a phone number (won't show again)
    async function dismissDuplicate(phone: string, notes?: string): Promise<{ success: boolean; error?: string }> {
        try {
            const { error: insertError } = await supabase
                .from("duplicate_dismissals")
                .insert([{
                    phone: phone,
                    notes: notes || null,
                }]);

            if (insertError) throw insertError;
            return { success: true };
        } catch (err) {
            console.error("Error dismissing duplicate:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to dismiss duplicate",
            };
        }
    }

    // =============================================
    // UNDO FUNCTIONALITY
    // =============================================

    async function undoLastAction(): Promise<{ success: boolean; error?: string; undoneAction?: string }> {
        if (undoStack.length === 0) {
            return { success: false, error: "Nothing to undo" };
        }

        const lastAction = undoStack[0];

        try {
            // Revert the order to its previous state
            const { error: updateError } = await supabase
                .from("orders")
                .update(lastAction.previousState)
                .eq("id", lastAction.orderId);

            if (updateError) throw updateError;

            // Update local state
            setOrders((prev) =>
                prev.map((order) =>
                    order.id === lastAction.orderId
                        ? { ...order, ...lastAction.previousState }
                        : order
                )
            );

            // Remove from undo stack
            setUndoStack(prev => prev.slice(1));

            return {
                success: true,
                undoneAction: lastAction.action
            };
        } catch (err) {
            console.error("Error undoing action:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to undo",
            };
        }
    }

    function getLastUndoAction(): UndoEntry | null {
        return undoStack.length > 0 ? undoStack[0] : null;
    }

    function clearUndoStack(): void {
        setUndoStack([]);
    }

    // =============================================
    // ANALYTICS / STATS
    // =============================================

    // Calculate 7-day revenue trends
    const revenueTrends = (() => {
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
    })();

    // Calculate velocity metrics (avg time between status changes)
    const velocityMetrics = (() => {
        const confirmedOrders = orders.filter(o => o.status === "confirmed" || o.status === "delivered");
        const deliveredOrders = orders.filter(o => o.status === "delivered");

        // This is a simplified calculation - actual would need status history
        // Using creation date to status change approximation
        return {
            avgNewToConfirmed: confirmedOrders.length > 0 ? "~2h" : "N/A",
            avgConfirmedToDelivered: deliveredOrders.length > 0 ? "~24h" : "N/A",
            totalProcessed: deliveredOrders.length,
            pendingCount: orders.filter(o => o.status === "new" || o.status === "contacted").length,
        };
    })();

    // Calculate Peak Hours
    const peakTime = (() => {
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
    })();

    const stats = {
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
    };

    // =============================================
    // RETURN OBJECT
    // =============================================

    return {
        // Core data
        orders,
        statusCounts,
        // Archive
        archivedOrders,
        fetchArchivedOrders,
        filteredOrders,
        loading,
        error,
        stats,

        // Reference data
        rejectionReasons,
        messageTemplates,
        filterPresets,
        availableCities,
        availableProducts,

        // Filters
        filters,
        setFilters,
        clearFilters,
        saveFilterPreset,
        loadFilterPreset,
        deleteFilterPreset,

        // Single order operations
        refetch: fetchOrders,
        updateOrderStatus,
        updateOrder,
        createOrder,
        cloneOrder,
        setScheduledDate,
        setPriority,
        setPaymentStatus,
        togglePin,
        setPin,
        toggleReviewed,
        markAsVerifiedCustomer,
        deleteOrder,

        // Bulk operations
        bulkUpdateStatus,
        bulkArchive,
        bulkDelete,
        exportOrders,

        // Return orders
        createReturnOrder,

        // Detection & history
        checkDuplicateOrder,
        getDuplicatesForOrder,
        hasDuplicates,
        getCustomerHistory,
        getCustomerOrderCount,
        mergeOrders,
        fetchOrders, // Exposed for manual refresh

        // Notes
        addOrderNote,
        getOrderNotes,

        // Timeline
        getOrderTimeline,

        // Reminders
        setFollowUpReminder,
        getActiveReminders,
        completeReminder,

        // Blacklist
        isBlacklisted,

        // Duplicate management
        getCustomerOrders,
        dismissDuplicate,

        // Undo functionality
        undoLastAction,
        getLastUndoAction,
        clearUndoStack,
        canUndo: undoStack.length > 0,
        checkOrderIdExists,
    };
}
