"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";

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
import { cleanPhoneForExport } from "@/lib/export-utils";
import { activityLogger } from "@/lib/activity-logger";
// Extracted utility modules
import {
    applyOrderFilters,
    sortOrders,
    calculateStatusCounts,
    getLocalDateString,
    getDefaultFilters,
    getAvailableCities,
    getAvailableProducts,
    loadFilterPresetsFromStorage,
    saveFilterPresetsToStorage,
    createFilterPreset,
} from "@/lib/order-filter-utils";
import {
    normalizeOrder,
    getBaseOrderId,
    isOrderFinal,
} from "@/lib/order-normalize-utils";
import {
    exportOrders as exportOrdersUtil,
} from "@/lib/order-export-utils";
// React Query hooks for caching
import {
    useOrdersQuery,
    useUpdateStatusMutation,
    useUpdateOrderMutation,
    useDeleteOrderMutation,
    useCreateOrderMutation,
    orderKeys
} from "@/hooks/use-orders-query";

import { OrderSchema } from "@/lib/schemas";

// normalizeOrder is now imported from @/lib/order-normalize-utils
import { createOrderAction, splitOrderAction } from "@/app/actions/orders";

import { SyncQueue } from "@/lib/sync-queue";
import { useUserPreferences, PREFERENCE_KEYS } from "@/hooks/use-user-preferences";

// =============================================
// ENHANCED ORDERS HOOK
// =============================================

export function useOrders() {
    // =============================================
    // REACT QUERY INTEGRATION FOR CACHING
    // =============================================
    // Import the cached query - this provides instant data on repeat visits
    const queryClient = useQueryClient();
    const { data: cachedOrders, isLoading: queryLoading, error: queryError, isFetching } = useOrdersQuery();

    // Import mutations for optimistic updates
    const updateStatusMutation = useUpdateStatusMutation();
    const updateOrderMutation = useUpdateOrderMutation();
    const deleteOrderMutation = useDeleteOrderMutation();
    const createOrderMutation = useCreateOrderMutation();

    const { user, profile } = useAuth();

    // Core state - now seeded from React Query cache
    const [orders, setOrders] = useState<Order[]>(() => {
        // Initialize from cache if available to prevent flash of loading state
        const cached = queryClient.getQueryData<Order[]>(["orders", "list"]);
        return cached || [];
    });
    const [archivedOrders, setArchivedOrders] = useState<Order[]>([]);
    // Start as false if we have cached data (prevents loading flash on navigation)
    const [loading, setLoading] = useState(() => {
        const cached = queryClient.getQueryData<Order[]>(["orders", "list"]);
        return !cached; // Only show loading if no cache
    });
    const [error, setError] = useState<string | null>(null);
    // Version counter to force re-renders on realtime updates
    const [realtimeVersion, setRealtimeVersion] = useState(0);

    // Sync React Query data to local state (for backward compatibility)
    useEffect(() => {
        if (cachedOrders) {
            setOrders(cachedOrders);
            setLoading(false);
            setError(null);
        }
    }, [cachedOrders]);

    // Handle query errors
    useEffect(() => {
        if (queryError) {
            setError(queryError instanceof Error ? queryError.message : "Failed to fetch orders");
            setLoading(false);
        }
    }, [queryError]);

    // Refs to prevent race conditions
    const hasInitiallyLoaded = useRef(false); // Track if initial data has been loaded
    const isMountedRef = useRef(true); // Track if component is still mounted

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

    // getLocalDateString is now imported from @/lib/order-filter-utils

    // User preferences for persisting filters
    const { getPreference, setPreference, userId } = useUserPreferences();

    // Track if we've loaded user-specific preferences yet
    const hasLoadedUserPrefs = useRef(false);

    // Filters state - load from saved preferences or default to today's orders
    const [filters, setFiltersState] = useState<OrderFilters>(() => {
        // Try to load from localStorage immediately (will use anonymous if auth not ready)
        if (typeof window !== "undefined") {
            try {
                // Direct localStorage read to avoid hook dependency issues
                const stored = localStorage.getItem(`schneiders_prefs_anonymous_orderFilters`);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    // Strip riskLevel — it should not persist across sessions
                    // as it can silently hide most orders (e.g. riskLevel: "flagged")
                    delete parsed.riskLevel;
                    return parsed;
                }
            } catch (e) {
                // Fall through to default
            }
        }
        return getDefaultFilters();
    });

    // Reload filters when user auth resolves (goes from null to actual userId)
    useEffect(() => {
        if (userId && !hasLoadedUserPrefs.current) {
            // User just logged in or auth just resolved - load their preferences
            const saved = getPreference<OrderFilters>(PREFERENCE_KEYS.ORDER_FILTERS);
            if (saved) {
                // Strip riskLevel — it should not persist across sessions
                delete saved.riskLevel;
                setFiltersState(saved);
            }
            hasLoadedUserPrefs.current = true;
        } else if (!userId) {
            // User logged out - reset the flag
            hasLoadedUserPrefs.current = false;
        }
    }, [userId, getPreference]);

    // Wrapper to persist filters when they change
    const setFilters = useCallback((newFilters: OrderFilters | ((prev: OrderFilters) => OrderFilters)) => {
        setFiltersState(prev => {
            const updated = typeof newFilters === 'function' ? newFilters(prev) : newFilters;
            // Persist to user-scoped localStorage (debounced internally)
            // Strip riskLevel from persistence — it should reset on each page load
            // to prevent silently hiding orders across sessions
            const { riskLevel, ...persistableFilters } = updated;
            setPreference(PREFERENCE_KEYS.ORDER_FILTERS, persistableFilters);
            return updated;
        });
    }, [setPreference]);

    // =============================================
    // INITIAL DATA FETCH (Real-time subscription only now)
    // =============================================

    useEffect(() => {
        // Mark as mounted
        isMountedRef.current = true;

        // Generate unique ID for this subscription
        const subscriptionId = Math.random().toString(36).substring(7);

        // Note: Initial fetch is now handled by React Query
        // Fetch auxiliary data only if not already loaded (prevents re-fetch on navigation)
        if (rejectionReasons.length === 0) fetchRejectionReasons();
        if (messageTemplates.length === 0) fetchMessageTemplates();
        if (blacklistedPhones.size === 0) fetchBlacklist();
        loadFilterPresets();

        let pollingInterval: NodeJS.Timeout | null = null;
        let realtimeWorking = false;
        let realtimeRefetchTimeout: NodeJS.Timeout | null = null; // Debounce for realtime updates

        // Set up real-time subscription
        const channel = supabase
            .channel(`orders_changes_${subscriptionId} `) // Unique channel name
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "orders"
                },
                (payload) => {
                    // Handle INSERT - add new order to state
                    if (payload.eventType === "INSERT" && payload.new) {
                        const newOrder = normalizeOrder(payload.new as Order);

                        // Skip archived orders (they shouldn't be in main list)
                        if (newOrder.is_archived) return;

                        // Show notification for new orders
                        notificationService.showNewOrderNotification(
                            newOrder.customer_name,
                            newOrder.order_id,
                            newOrder.priority
                        );

                        // Add to state (idempotent - skip if already present)
                        setOrders(prev => {
                            if (prev.some(o => o.id === newOrder.id)) return prev;
                            return [newOrder, ...prev];
                        });
                    }

                    // Handle UPDATE - efficiently patch the single order instead of refetching all orders
                    if (payload.eventType === "UPDATE" && payload.new) {
                        const updatedOrder = normalizeOrder(payload.new as Order);

                        setOrders(prev => {
                            // If it's archived, remove from active list
                            if (updatedOrder.is_archived) {
                                return prev.filter(o => o.id !== updatedOrder.id);
                            }

                            // Update or add to list
                            const exists = prev.some(o => o.id === updatedOrder.id);
                            if (exists) {
                                return prev.map(o => o.id === updatedOrder.id ? updatedOrder : o);
                            } else {
                                // It was unarchived or we missed the insert
                                return [updatedOrder, ...prev];
                            }
                        });

                        // Notify React Query cache to stay in sync
                        queryClient.setQueryData<Order[]>(["orders", "list"], (old) => {
                            if (!old) return old;
                            if (updatedOrder.is_archived) return old.filter(o => o.id !== updatedOrder.id);
                            const exists = old.some(o => o.id === updatedOrder.id);
                            if (exists) return old.map(o => o.id === updatedOrder.id ? updatedOrder : o);
                            return [updatedOrder, ...old];
                        });

                        // Trigger a smooth UI refresh for components tracking realtime updates
                        setRealtimeVersion(v => v + 1);
                    }

                    // Handle DELETE - remove order from state
                    if (payload.eventType === "DELETE" && payload.old) {
                        const deletedId = (payload.old as { id: string }).id;
                        setOrders(prev => prev.filter(o => o.id !== deletedId));
                    }
                }
            )
            .subscribe((status, err) => {
                if (status === "SUBSCRIBED") {
                    realtimeWorking = true;
                    // Clear polling if realtime starts working
                    if (pollingInterval) {
                        clearInterval(pollingInterval);
                        pollingInterval = null;
                    }
                } else if (status === "CHANNEL_ERROR" || status === "CLOSED") {
                    console.log(`[Realtime] Error - falling back to polling: `, err);
                    // DISABLED POLLING FOR DEBUGGING - Suspect it causes freeze
                    // if (!pollingInterval) {
                    //     pollingInterval = setInterval(() => {
                    //         if (!document.hidden) {
                    //             fetchOrders(false);
                    //         }
                    //     }, 120000); // 2 minutes - less disruptive
                    // }
                } else {
                    // Other status values (TIMED_OUT, etc.)
                }
            });

        return () => {
            // Mark as unmounted to prevent state updates on unmounted component
            isMountedRef.current = false;
            // Cancel any pending fetch
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            channel.unsubscribe();
            if (pollingInterval) clearInterval(pollingInterval);
            if (realtimeRefetchTimeout) clearTimeout(realtimeRefetchTimeout);
        };
    }, []);

    // =============================================
    // FETCH FUNCTIONS
    // =============================================

    // Keep track of the latest abort controller
    const abortControllerRef = useRef<AbortController | null>(null);

    async function fetchOrders(isInitialLoad: boolean = false) {
        // Cancel previous request if it's still running
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // Create new controller for this request
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            // Note: Using select("*") because TypeScript Order type includes 
            // some optional columns that may not exist in all DB schemas
            const { data, error: fetchError } = await supabase
                .from("orders")
                .select("*")
                .eq("is_archived", false)
                .order("created_at", { ascending: false })
                .abortSignal(controller.signal);

            // If aborted, don't update state
            if (controller.signal.aborted) {
                return;
            }

            // Check if component mounted
            if (!isMountedRef.current) {
                return;
            }

            if (fetchError) throw fetchError;

            console.time(`[PERF - fetchOrders] normalize ${data?.length || 0} orders`);
            const ordersWithDefaults = (data || []).map(normalizeOrder);
            console.timeEnd(`[PERF - fetchOrders] normalize ${data?.length || 0} orders`);

            setOrders(ordersWithDefaults);
            setError(null);
            hasInitiallyLoaded.current = true;
        } catch (err) {
            // Ignore abort errors
            if (err instanceof Error && err.name === 'AbortError') {
                return;
            }

            if (isMountedRef.current && !controller.signal.aborted) {
                console.error("Error fetching orders:", err);
                setError(err instanceof Error ? err.message : "Failed to fetch orders");
            }
        } finally {
            if (isMountedRef.current && !controller.signal.aborted) {
                setLoading(false);
            }
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

            const ordersWithDefaults = (data || []).map(normalizeOrder);

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
        const presets = loadFilterPresetsFromStorage();
        setFilterPresets(presets);
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

                    // Fix for matching return orders:
                    let matchesOriginalOrderId = false;
                    if (order.original_order_id) {
                        if (order.original_order_id.toLowerCase().includes(query)) {
                            matchesOriginalOrderId = true;
                        } else {
                            const parentOrder = ordersToFilter.find(o => o.id === order.original_order_id);
                            if (parentOrder && parentOrder.order_id?.toLowerCase().includes(query)) {
                                matchesOriginalOrderId = true;
                            }
                        }
                    }

                    if (!matchesName && !matchesPhone && !matchesOrderId && !matchesDeliveryId && !matchesOriginalOrderId) return false;
                }

                return true;
            });
        },
        [filters]
    );

    const filteredOrders = useMemo(() => {
        console.time(`[PERF - useOrders] compute for ${orders.length} orders`);
        const result = applyFilters(orders).sort((a, b) => {
            // Pinned orders always come first
            if (a.is_pinned && !b.is_pinned) return -1;
            if (!a.is_pinned && b.is_pinned) return 1;
            // Then sort by date descending (newest first)
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
        console.timeEnd(`[PERF - useOrders] compute for ${orders.length} orders`);
        return result;
    }, [orders, applyFilters]);

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
    const availableCities = useMemo(() => {
        return [...new Set(orders.map((o) => o.city).filter(Boolean))] as string[];
    }, [orders]);

    // Get unique products from orders
    const availableProducts = useMemo(() => {
        return [...new Set(orders.flatMap((o) => o.items?.map((i) => i.name) || []).filter(Boolean))] as string[];
    }, [orders]);

    // =============================================
    // FILTER PRESET FUNCTIONS
    // =============================================

    function saveFilterPreset(name: string) {
        const preset = createFilterPreset(name, filters, "orders");
        const updated = [...filterPresets, preset];
        setFilterPresets(updated);
        saveFilterPresetsToStorage(updated);
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
        saveFilterPresetsToStorage(updated);
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
                    action: `Changed status to ${status} `,
                    timestamp: new Date(),
                };
                setUndoStack(prev => [undoEntry, ...prev.slice(0, MAX_UNDO_STACK - 1)]);
            }

            // Use React Query mutation for optimistic update and cache management
            const { updateData } = await updateStatusMutation.mutateAsync({
                orderId,
                status,
                rejectionReason
            });

            // Record status change to history table for timeline tracking
            // Note: This is a side effect we still run directly
            if (previousOrder && previousOrder.status !== status) {
                // Fire and forget history insert to not block UI
                supabase
                    .from("order_status_history")
                    .insert([{
                        order_id: orderId,
                        from_status: previousOrder.status,
                        to_status: status,
                        changed_at: new Date().toISOString(),
                        notes: rejectionReason || null,
                        changed_by: profile?.display_name || user?.email || 'System',
                    }]).then(({ error }) => {
                        if (error) console.error("Failed to record status history:", error);
                    });
            }



            // Log activity
            if (previousOrder && previousOrder.status !== status) {
                activityLogger.logStatusChange(
                    orderId,
                    previousOrder.order_id,
                    previousOrder.status,
                    status,
                    rejectionReason
                );
            }

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
            // delete (cleanUpdates as any).items; // We NEED to update items for split order
            delete (cleanUpdates as any).customer;

            // Use React Query mutation for optimistic update
            const { updates: appliedUpdates } = await updateOrderMutation.mutateAsync({
                orderId,
                updates: cleanUpdates
            });



            return { success: true };
        } catch (err) {
            console.error("Error updating order:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to update order",
            };
        }
    }



    async function createOrder(orderData: Omit<Order, "id" | "created_at" | "updated_at">): Promise<{ success: boolean; data?: Order; error?: string }> {
        try {
            // Validate with Zod before creating
            // We need to shape the data slightly to match the schema's expectation (some fields might be null vs undefined)
            // Using safeParse for validation
            const validationResult = OrderSchema.safeParse({
                ...orderData,
                // Ensure array presence defaults
                items: orderData.items || [],
            });

            if (!validationResult.success) {
                const errorMessage = validationResult.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
                console.error("Validation failed:", errorMessage);
                return { success: false, error: `Validation Error: ${errorMessage}` };
            }

            // Use validated data or original data? 
            // Better to use original as Zod might strip unknown fields if strict is set (not set here but good practice)
            // But validation ensures validity.

            // Offline handling: Check network status or catch network errors
            if (!navigator.onLine) {
                console.log("Offline: Queuing order creation");

                // create a temp ID
                const tempId = `temp-${Date.now()}`;
                const offlineOrder = { ...orderData, id: tempId, created_at: new Date().toISOString() } as Order;

                // Add to Sync Queue
                await SyncQueue.enqueue({
                    type: "CREATE_ORDER",
                    payload: orderData,
                });

                // Optimistically update React Query cache
                queryClient.setQueryData<Order[]>(["orders", "list"], (old) => {
                    return [offlineOrder, ...(old || [])];
                });

                // Also update local state
                setOrders(prev => [offlineOrder, ...prev]);

                return { success: true, data: offlineOrder };
            }

            // Calculate risk assessment before creation to persist it
            // This ensures "state-of-the-art" recording of risk at the moment of order creation
            try {
                if (orderData.phone) {
                    // Dynamic import to avoid circular dependencies if any
                    const { fraudDetector } = await import("@/lib/fraud-detector");
                    const riskAssessment = await fraudDetector.assessCustomerRisk(orderData.phone);
                    const riskPayload = fraudDetector.getPersistencePayload(riskAssessment);

                    // Attach to order data
                    // @ts-ignore - risk_metadata is added to schema but TypeScript might lag
                    orderData.risk_metadata = riskPayload;

                    // Also add to attention flags if high risk
                    if (riskAssessment.level === 'high' || riskAssessment.level === 'blocked') {
                        // @ts-ignore
                        orderData.needs_attention = true;
                        // @ts-ignore
                        orderData.attention_reasons = [...(orderData.attention_reasons || []), 'high_risk_customer'];
                    }
                }
            } catch (riskErr) {
                console.error("Error calculating initial risk:", riskErr);
                // Continue creation even if risk check fails
            }

            // Use React Query mutation for optimistic update
            const data = await createOrderMutation.mutateAsync(orderData);

            // Log activity
            activityLogger.logOrderCreate(
                data.id,
                data.order_id,
                orderData.source || "manual"
            );

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
            const newOrderId = `CLN - ${originalOrder.order_id} -${Date.now().toString(36).toUpperCase()} `;

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
                notes: `Cloned from order #${originalOrder.order_id} `,
                status: "new" as const,
                priority: "normal" as const,
                payment_status: originalOrder.payment_status || "cod",
                is_return: false,
                is_archived: false,
            };

            return createOrder(clonedOrderData);
        } catch (err) {
            console.error("Error cloning order:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to clone order",
            };
        }
    }

    async function splitOrder(originalOrderId: string, keptItems: any[], returnedItems: any[]): Promise<{ success: boolean; error?: string }> {
        try {
            const originalOrder = orders.find(o => o.id === originalOrderId);
            // We don't throw here if not found locally, we let server handle it, 
            // but we need it for logging if successful.

            const result = await splitOrderAction(originalOrderId, keptItems, returnedItems);

            if (result.success) {
                // Force refresh of orders list to show the new rejected order and updated original order
                await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });

                // 4. Log unique activity
                if (originalOrder) {
                    const calculateTotal = (items: any[]) => items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
                    const keptTotal = calculateTotal(keptItems);
                    const returnedTotal = calculateTotal(returnedItems);

                    activityLogger.log({
                        action: 'order.edit',
                        entityType: 'order',
                        entityId: originalOrderId,
                        details: {
                            order_id: originalOrder.order_id,
                            note: `Split order: Kept ${keptItems.length} items (${keptTotal}), Returned ${returnedItems.length} items (${returnedTotal}). New Return Order: ${result.data?.order_id || 'Generated'}`
                        }
                    });
                }

                return { success: true };

            } else {
                return {
                    success: false,
                    error: result.error || "Failed to split order"
                };
            }

        } catch (err) {
            console.error("Split order failed:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to split order"
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
            const uniqueOrderIds = Array.from(new Set(orderIds));
            if (uniqueOrderIds.length === 0) {
                return { success: true, count: 0 };
            }

            // Unlink any child orders first (set original_order_id to null)
            const { error: unlinkError } = await supabase
                .from("orders")
                .update({ original_order_id: null })
                .in("original_order_id", uniqueOrderIds);

            if (unlinkError) console.warn("Error unlinking child orders:", unlinkError);

            const { data: deletedRows, error: deleteError } = await supabase
                .from("orders")
                .delete()
                .in("id", uniqueOrderIds)
                .select("id");

            if (deleteError) throw deleteError;

            const deletedIds = new Set((deletedRows || []).map((row) => row.id));

            // If nothing was deleted, surface an explicit error.
            if (deletedIds.size === 0) {
                throw new Error("No orders were deleted. You may not have permission to delete these orders.");
            }

            // Remove from local state
            setOrders((prev) => prev.filter((order) => !deletedIds.has(order.id)));

            return {
                success: deletedIds.size === uniqueOrderIds.length,
                count: deletedIds.size,
                requestedCount: uniqueOrderIds.length,
                deletedIds: Array.from(deletedIds),
            };
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
            // Unlink any child orders first (set original_order_id to null)
            // We do this directly because the mutation might just try to delete
            await supabase
                .from("orders")
                .update({ original_order_id: null })
                .eq("original_order_id", orderId);

            // Use React Query mutation for optimistic update
            await deleteOrderMutation.mutateAsync(orderId);

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

        // cleanPhoneForExport is now imported from @/lib/export-utils

        const headers = [
            "Order ID",
            "Customer Name",
            "Phone",
            "City",
            "Address",
            "Items",
            "Total",
            "Status",
            "Payment Status",
            "Created At",
        ];

        const rows = ordersToExport.map((order) => [
            order.order_id,
            order.customer_name,
            cleanPhoneForExport(order.phone),
            order.city || "",
            order.address_details || "",
            order.items?.map((i) => `${i.name} x${i.quantity} `).join("; ") || "",
            order.price,
            order.status,
            order.payment_status,
            new Date(order.created_at).toLocaleDateString(),
        ]);

        if (format === "csv") {
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

        // For xlsx - use Tab-separated values for Excel compatibility
        const tsvContent = [
            headers.join("\t"),
            ...rows.map((row) => row.map((cell) => `${cell} `).join("\t")),
        ].join("\n");

        const blob = new Blob([tsvContent], { type: "application/vnd.ms-excel;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `orders_export_${new Date().toISOString().split("T")[0]}.xls`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        return { success: true, count: ordersToExport.length };
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

        // Check if the original order has items
        if (!originalOrder.items || originalOrder.items.length === 0) {
            return { success: false, error: "الطلب الأصلي لا يحتوي على منتجات" };
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
            source: originalOrder.source || "other", // Inherit source from original order
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

            if (order.is_return) return false;

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

        const normalizedOrderPhone = normalizePhoneForSearch(order.phone);

        return orders.filter((o) => {
            if (o.id === orderId || o.is_return) return false;
            // Use normalized phone comparison
            if (normalizePhoneForSearch(o.phone) !== normalizedOrderPhone) return false;

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
        const normalizedPhone = normalizePhoneForSearch(phone);
        return orders
            .filter((order) => normalizePhoneForSearch(order.phone) === normalizedPhone && !order.is_return)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    // Precompute a hash map of order counts by base normalized phone for O(1) lookups during scrolling
    const customerOrderCountsMap = useMemo(() => {
        const counts = new Map<string, number>();
        const processedBaseIds = new Set<string>();

        // Helper to extract base order ID
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

            // Create a unique compound key so we don't count the same order twice
            // if it's duplicated with differently formatted IDs like LF-1234-1 and LF-1234-2
            const orderDedupKey = `${normalizedPhone}-${baseId}`;

            if (!processedBaseIds.has(orderDedupKey)) {
                processedBaseIds.add(orderDedupKey);
                counts.set(normalizedPhone, (counts.get(normalizedPhone) || 0) + 1);
            }
        });

        return counts;
    }, [orders]);

    // Get customer order count (O(1) lookup against pre-computed map)
    const getCustomerOrderCount = useCallback((phone: string, currentOrderId?: string): number => {
        const normalizedPhone = normalizePhoneForSearch(phone);
        return customerOrderCountsMap.get(normalizedPhone) || 0;
    }, [customerOrderCountsMap]);

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
                    notes: `[مدمج مع #${keepOrder.order_id}] ${archiveOrder.notes || ''} `.trim(),
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
    // BATCH MANAGEMENT
    // =============================================

    async function createBatch(
        name: string,
        orderIds: string[],
        invoiceTemplate: string = "prime",
        printType: string = "invoice"
    ) {
        try {
            const selectedOrders = orders.filter((o) => orderIds.includes(o.id));
            const totalValue = selectedOrders.reduce((sum, o) => sum + Number(o.price || 0), 0);
            const cities = [...new Set(selectedOrders.map((o) => o.city).filter(Boolean))] as string[];

            const { data, error } = await supabase
                .from("print_batches")
                .insert({
                    name,
                    order_count: orderIds.length,
                    total_value: totalValue,
                    cities,
                    order_ids: orderIds,
                    invoice_template: invoiceTemplate,
                    print_type: printType,
                })
                .select()
                .single();

            if (error) throw error;
            return { success: true, batch: data };
        } catch (err) {
            console.error("Error creating batch:", err);
            return { success: false, error: err instanceof Error ? err.message : "Failed to create batch" };
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

    // Calculate velocity metrics (avg time between status changes)
    const velocityMetrics = useMemo(() => {
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
    }, [orders]);

    // Calculate Peak Hours
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

    // =============================================
    // RETURN OBJECT
    // =============================================

    const contextValue = useMemo(() => ({
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
        // Realtime version counter (for forcing re-renders when realtime updates happen)
        realtimeVersion,

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
        splitOrder,
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
        createBatch,

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
    }), [
        // Ensure that any internal state accessed by the returned hooks and values is in this dependency array.
        // This allows the returned functions to capture the fresh state closure, while maintaining object 
        // reference stability when unrelated components (e.g. react-query's isFetching) trigger a hook render.
        orders, statusCounts, archivedOrders, filteredOrders, loading, error, stats, realtimeVersion,
        rejectionReasons, messageTemplates, filterPresets, availableCities, availableProducts, filters,
        undoStack
    ]);

    return contextValue;
}
