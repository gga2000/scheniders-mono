"use client";

import { useState, useRef, useLayoutEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import {
    supabase,
    type Order,
    type OrderItem,
    type OrderNote,
    type OrderStatusHistory,
    type FollowUpReminder,
    type OrderPriority,
    type PaymentStatus,
} from "@/lib/supabase";
import { normalizeOrder } from "@/lib/order-normalize-utils";
import { cleanPhoneForExport } from "@/lib/export-utils";
import { activityLogger } from "@/lib/activity-logger";
import { OrderSchema } from "@/lib/schemas";
import { splitOrderAction } from "@/app/actions/orders";
import { getIdempotencyGuard, generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "sonner";
import {
    useUpdateStatusMutation,
    useUpdateOrderMutation,
    useCreateOrderMutation,
    orderKeys
} from "@/hooks/use-orders-query";
import { orderRepository } from "@/lib/repositories/order-repository";

// =============================================
// ORDER CRUD HOOK
// All create/read/update/delete operations,
// bulk operations, undo, notes, timeline,
// reminders, batch, export, and more.
// =============================================

interface UndoEntry {
    orderId: string;
    previousState: Partial<Order>;
    action: string;
    timestamp: Date;
}

interface UseOrderCrudOptions {
    orders?: Order[];
}

export function useOrderCrud({ orders = [] }: UseOrderCrudOptions = {}) {
    const queryClient = useQueryClient();
    const { user, profile, session } = useAuth();

    // Stable Auth Ref to prevent stale closures in stableAPI proxy
    const authRef = useRef({ user, profile, session });
    useLayoutEffect(() => {
        authRef.current = { user, profile, session };
    });

    // Helper: optimistically update the React Query orders cache
    const optimisticUpdate = (updater: (prev: Order[]) => Order[]) => {
        queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
            if (!old) return old;
            return updater(old);
        });
    };

    // Mutations
    const updateStatusMutation = useUpdateStatusMutation();
    const updateOrderMutation = useUpdateOrderMutation();
    const createOrderMutation = useCreateOrderMutation();

    // Undo stack
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const MAX_UNDO_STACK = 10;

    // Per-order mutation sequence counter: ensures only the LATEST mutation
    // for a given order actually writes to Supabase. Earlier mutations detect
    // they've been superseded and bail out silently.
    const statusMutationSeqRef = useRef(new Map<string, number>());

    // Per-order debounce timers: coalesces rapid-fire status changes (300ms)
    // so only the final status is sent to Supabase.
    const statusDebounceRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    // Abort controller for fetch
    // const isMountedRef = useRef(true);

    // =============================================
    // REFETCH VIA REACT QUERY (replaces legacy fetchOrders)
    // =============================================

    async function fetchOrders() {
        // Simply invalidate the React Query cache — it will refetch automatically
        await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
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
            return { success: true, count: ordersWithDefaults.length };
        } catch (err) {
            console.error("Error fetching archived orders:", err);
            return { success: false, error: err instanceof Error ? err.message : "Failed to fetch archived orders" };
        }
    }

    // =============================================
    // SINGLE ORDER OPERATIONS
    // =============================================

    async function updateOrderStatus(
        orderId: string,
        status: Order["status"],
        rejectionReason?: string
    ) {
        const _t0 = performance.now();
        console.log(`[Diag:StatusUpdate] START orderId=${orderId} newStatus=${status} timestamp=${Date.now()}`);

        // ── INSTANT OPTIMISTIC UPDATE ──
        // Apply optimistic UI immediately (no debounce) so the user sees feedback.
        const currentCache = queryClient.getQueryData<Order[]>(orderKeys.lists());
        const previousOrder = currentCache?.find(o => o.id === orderId) || orders.find(o => o.id === orderId);

        // Record to undo stack
        if (previousOrder) {
            setUndoStack(prev => [{
                orderId,
                previousState: {
                    status: previousOrder.status,
                    rejection_reason: previousOrder.rejection_reason,
                },
                action: `Changed status to ${status}`,
                timestamp: new Date(),
            }, ...prev.slice(0, MAX_UNDO_STACK - 1)]);
        }

        // ── DEBOUNCED NETWORK CALL (300ms) ──
        // If another status change for the same order arrives within 300ms,
        // cancel the previous timer and only send the latest status.
        const debounceMap = statusDebounceRef.current;
        const existingTimer = debounceMap.get(orderId);
        if (existingTimer) clearTimeout(existingTimer);
        console.log(`[Diag:StatusUpdate] DEBOUNCE orderId=${orderId} cancelledPrevious=${!!existingTimer}`);

        return new Promise<{ success: boolean; error?: string; superseded?: boolean }>((resolve) => {
            debounceMap.set(orderId, setTimeout(async () => {
                debounceMap.delete(orderId);

                // Latest-wins gate
                const seqMap = statusMutationSeqRef.current;
                const mySeq = (seqMap.get(orderId) ?? 0) + 1;
                seqMap.set(orderId, mySeq);
                console.log(`[Diag:StatusUpdate] DEBOUNCE_FIRE orderId=${orderId} seq=${mySeq} elapsed=${(performance.now() - _t0).toFixed(1)}ms`);

                try {
                    const _tMut = performance.now();
                    console.log(`[Diag:StatusUpdate] MUTATION_START orderId=${orderId} seq=${mySeq}`);

                    // Get current user information for attribution
                    const { profile: currentProfile, user: currentUser } = authRef.current;
                    const changedBy = currentProfile?.display_name || currentUser?.email || 'System';
                    const changedByAvatar = currentProfile?.avatar_url;

                    await updateStatusMutation.mutateAsync({
                        orderId,
                        status,
                        rejectionReason,
                        last_status_changed_by_name: changedBy,
                        last_status_changed_by_avatar: changedByAvatar || undefined,
                        expectedUpdatedAt: previousOrder?.updated_at,
                    });
                    console.log(`[Diag:StatusUpdate] MUTATION_OK orderId=${orderId} seq=${mySeq} took=${(performance.now() - _tMut).toFixed(1)}ms`);

                    // Handle Advanced Inventory & Supplies based on Status Changes
                    if (previousOrder && previousOrder.status !== status) {
                        console.log(`[Diag:StatusUpdate] INVENTORY_START orderId=${orderId}`);
                        import("@/lib/inventory-engine").then(engine => {
                            const items = previousOrder.items || [];
                            const prevWasActive = !['completed', 'delivered', 'rejected', 'refund_delivered', 'refund_failed', 'cancelled'].includes(previousOrder.status);
                            const nowIsActive = !['completed', 'delivered', 'rejected', 'refund_delivered', 'refund_failed', 'cancelled'].includes(status);

                            if (status === 'completed' || status === 'delivered') {
                                engine.fulfillOrder(items);
                                engine.deductSupplies(items.length);
                            } else if (status === 'rejected' || status === 'refund_delivered') {
                                engine.quarantineOrder(orderId, items, rejectionReason || `Changed to ${status}`);
                            } else if (status === 'cancelled' && prevWasActive) {
                                engine.releaseAllocation(items);
                            } else if (nowIsActive && !prevWasActive) {
                                if (previousOrder.status === 'rejected' || previousOrder.status === 'refund_delivered' || previousOrder.status === 'cancelled') {
                                    engine.removeFromQuarantine(orderId);
                                }
                                engine.allocateOrder(items);
                            }
                            console.log(`[Diag:StatusUpdate] INVENTORY_OK orderId=${orderId}`);
                        }).catch(err => {
                            console.log(`[Diag:StatusUpdate] INVENTORY_ERR orderId=${orderId} err=${err}`);
                            console.error(err);
                        });
                    }

                    // Record status change to history table
                    if (previousOrder && previousOrder.status !== status) {
                        const { profile: currentProfile, user: currentUser } = authRef.current;
                        const changedBy = currentProfile?.display_name || currentUser?.email || 'System';

                        console.log(`[Diag:StatusUpdate] HISTORY_INSERT orderId=${orderId}`);
                        try {
                            const { error: historyError } = await supabase
                                .from("order_status_history")
                                .insert([{
                                    order_id: orderId,
                                    from_status: previousOrder.status,
                                    to_status: status,
                                    changed_at: new Date().toISOString(),
                                    notes: rejectionReason || null,
                                    changed_by: changedBy,
                                }]);
                            
                            if (historyError) {
                                console.log(`[Diag:StatusUpdate] HISTORY_ERR orderId=${orderId} err=${historyError.message}`);
                                console.error("Failed to record status history:", historyError);
                                toast.error("Status updated, but failed to log history record");
                            } else {
                                console.log(`[Diag:StatusUpdate] HISTORY_OK orderId=${orderId}`);
                            }
                        } catch (historyErr) {
                            console.log(`[Diag:StatusUpdate] HISTORY_CATCH_ERR orderId=${orderId} err=${historyErr}`);
                            console.error("Exception recording status history:", historyErr);
                        }
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

                    console.log(`[Diag:StatusUpdate] RESOLVE orderId=${orderId} success=true totalTime=${(performance.now() - _t0).toFixed(1)}ms`);
                    resolve({ success: true });
                } catch (err) {
                    // If we've been superseded, don't show error
                    if (seqMap.get(orderId) !== mySeq) {
                        console.log(`[Diag:StatusUpdate] RESOLVE orderId=${orderId} superseded=true seq=${mySeq} currentSeq=${seqMap.get(orderId)}`);
                        resolve({ success: false, superseded: true });
                        return;
                    }
                    console.log(`[Diag:StatusUpdate] MUTATION_ERR orderId=${orderId} seq=${mySeq} err=${err instanceof Error ? err.message : err} totalTime=${(performance.now() - _t0).toFixed(1)}ms`);
                    console.error("Error updating order status:", err);
                    const msg = err instanceof Error ? err.message : "Failed to update order status";
                    toast.error(msg);
                    resolve({ success: false, error: msg });
                }
            }, 300));
        });
    }

    async function updateOrder(orderId: string, updates: Partial<Order>, expectedUpdatedAt?: string): Promise<{ success: boolean; error?: string; data?: Order }> {
        const _tUpdate = performance.now();
        console.log(`[Diag:UpdateOrder] START orderId=${orderId} fields=${Object.keys(updates).join(',')}`);
        try {
            const cleanUpdates = { ...updates };
            delete (cleanUpdates as Record<string, unknown>).customer;

            // --- Audit Trail Tracking ---
            const currentCache = queryClient.getQueryData<Order[]>(orderKeys.lists());
            const previousOrder = currentCache?.find(o => o.id === orderId) || orders.find(o => o.id === orderId);

            if (previousOrder) {
                const changes: string[] = [];
                const FieldsToTrack: (keyof Order)[] = [
                    'customer_name', 'phone', 'secondary_phone', 'city',
                    'address_details', 'price', 'notes', 'internal_notes',
                    'priority', 'payment_status', 'scheduled_date'
                ];

                const fieldLabels: Record<string, string> = {
                    customer_name: "Name",
                    phone: "Phone",
                    secondary_phone: "Secondary Phone",
                    city: "City",
                    address_details: "Address",
                    price: "Price",
                    notes: "Notes",
                    internal_notes: "Internal Notes",
                    priority: "Priority",
                    payment_status: "Payment Status",
                    scheduled_date: "Scheduled Date"
                };

                FieldsToTrack.forEach(field => {
                    const newVal = updates[field];
                    const oldVal = previousOrder[field];
                    // Skip if newVal is undefined (not target of update)
                    if (newVal !== undefined && newVal !== oldVal) {
                        const label = fieldLabels[field] || field;
                        changes.push(`${label}: ${oldVal || 'None'} → ${newVal || 'None'}`);
                    }
                });

                // Items comparison
                if (updates.items && JSON.stringify(updates.items) !== JSON.stringify(previousOrder.items)) {
                    changes.push(`Items updated`);
                }

                if (changes.length > 0) {
                    const { profile: currentProfile, user: currentUser } = authRef.current;
                    const changedBy = currentProfile?.display_name || currentUser?.email || 'System';

                    supabase
                        .from("order_status_history")
                        .insert([{
                            order_id: orderId,
                            from_status: previousOrder.status,
                            to_status: previousOrder.status,
                            changed_at: new Date().toISOString(),
                            notes: `Updated: ${changes.join(', ')}`,
                            changed_by: changedBy,
                        }]).then(({ error }) => {
                            if (error) console.error("Failed to record detail history:", error);
                        });
                }
            }

            // Use passed expectedUpdatedAt or fallback to cache if not provided
            const conflictCheckTimestamp = expectedUpdatedAt || previousOrder?.updated_at;

            await updateOrderMutation.mutateAsync({
                orderId,
                updates: cleanUpdates,
                expectedUpdatedAt: conflictCheckTimestamp
            });

            console.log(`[Diag:UpdateOrder] MUTATION_OK orderId=${orderId} took=${(performance.now() - _tUpdate).toFixed(1)}ms`);
            return { success: true };
        } catch (err) {
            console.log(`[Diag:UpdateOrder] MUTATION_ERR orderId=${orderId} err=${err instanceof Error ? err.message : err} took=${(performance.now() - _tUpdate).toFixed(1)}ms`);
            console.error("Error updating order:", err);
            toast.error(err instanceof Error ? err.message : "Failed to update order");
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to update order",
            };
        }
    }

    async function createOrder(orderData: Omit<Order, "id" | "created_at" | "updated_at">): Promise<{ success: boolean; data?: Order; error?: string }> {
        // Idempotency guard: prevent double-click / duplicate submissions
        const fingerprint = `create_${orderData.order_id || ''}_${orderData.phone || ''}_${Date.now()}`;
        const idempotencyKey = generateIdempotencyKey(fingerprint);
        const guard = getIdempotencyGuard();

        if (!guard.tryExecute(idempotencyKey)) {
            console.log(`[Diag:CreateOrder] IDEMPOTENCY_BLOCKED key=${idempotencyKey}`);
            return { success: false, error: "Duplicate request — this order is already being created." };
        }

        try {
            const validationResult = OrderSchema.safeParse({
                ...orderData,
                items: orderData.items || [],
            });

            if (!validationResult.success) {
                const errorMessage = validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
                console.log(`[Diag:CreateOrder] VALIDATION_FAIL errors=${errorMessage}`);
                console.error("Validation failed:", errorMessage);
                return { success: false, error: `Validation Error: ${errorMessage}` };
            }

            // Get current user information for attribution
            const { profile: currentProfile, user: currentUser } = authRef.current;
            const changedBy = currentProfile?.display_name || currentUser?.email || 'System';
            const changedByAvatar = currentProfile?.avatar_url;

            // Include user attribution in the order data so notifications show the correct creator
            const orderDataWithAttribution = {
                ...orderData,
                last_status_changed_by_name: changedBy,
                last_status_changed_by_avatar: changedByAvatar || undefined,
            };

            // Start order creation instantly for optimal perceived performance
            console.log(`[Diag:CreateOrder] MUTATION_START`);
            const mutationPromise = createOrderMutation.mutateAsync(orderDataWithAttribution);

            // Calculate risk assessment seamlessly in the background WITHOUT blocking the UI
            try {
                if (orderData.phone) {
                    console.log(`[Diag:CreateOrder] FRAUD_CHECK_START phone=${orderData.phone}`);
                    import("@/lib/fraud-detector").then(async ({ fraudDetector }) => {
                        try {
                            const riskAssessment = await fraudDetector.assessCustomerRisk(orderData.phone!);
                            const riskPayload = fraudDetector.getPersistencePayload(riskAssessment);
                            console.log(`[Diag:CreateOrder] FRAUD_CHECK_RESULT level=${riskAssessment.level}`);

                            if (riskAssessment.level === 'high' || riskAssessment.level === 'blocked') {
                                const data = await mutationPromise; // Wait for ID to exist
                                if (data && data.id) {
                                    console.log(`[Diag:CreateOrder] FRAUD_UPDATE_START orderId=${data.id}`);
                                    // Soft update the order with the background risk metadata
                                    await updateOrderMutation.mutateAsync({
                                        orderId: data.id,
                                        updates: {
                                            risk_metadata: riskPayload,
                                            needs_attention: true,
                                            attention_reasons: ['high_risk_customer']
                                        }
                                    });
                                }
                            }
                        } catch (bgErr) {
                            console.log(`[Diag:CreateOrder] FRAUD_UPDATE_ERR err=${bgErr instanceof Error ? bgErr.message : bgErr}`);
                            console.error("Error in background risk calculation:", bgErr);
                        }
                    });
                }
            } catch (riskErr) {
                console.error("Error initiating risk check:", riskErr);
            }

            const data = await mutationPromise;

            // Handle Advanced Inventory
            import("@/lib/inventory-engine").then(engine => {
                engine.allocateOrder(orderData.items || []);
            }).catch(console.error);

            activityLogger.logOrderCreate(
                data.id,
                data.order_id,
                orderData.source || "manual"
            );

            // Record initial status change to history (fire-and-forget — don't block the modal)
            supabase
                .from("order_status_history")
                .insert([{
                    order_id: data.id,
                    changed_by: changedBy,
                    from_status: null,
                    to_status: orderData.status || "new",
                    changed_at: new Date().toISOString(),
                    notes: 'Order Created',
                }])
                .then(({ error: historyError }) => {
                    if (historyError) console.error("Failed to record initial status history:", historyError);
                });

            return { success: true, data };
        } catch (err) {
            // Release idempotency key so the user can retry
            guard.release(idempotencyKey);
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

            const newOrderId = `CLN - ${originalOrder.order_id} -${Date.now().toString(36).toUpperCase()} `;

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
                is_replacement: false,
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

    async function splitOrder(originalOrderId: string, keptItems: OrderItem[], returnedItems: OrderItem[]): Promise<{ success: boolean; error?: string }> {
        try {
            const originalOrder = orders.find(o => o.id === originalOrderId);

            const result = await splitOrderAction(originalOrderId, keptItems, returnedItems);

            if (result.success) {
                await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });

                if (originalOrder) {
                    const calculateTotal = (items: OrderItem[]) => items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
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

    async function setPriority(orderId: string, priority: OrderPriority) {
        return updateOrder(orderId, { priority });
    }

    async function setPaymentStatus(orderId: string, paymentStatus: PaymentStatus) {
        return updateOrder(orderId, { payment_status: paymentStatus });
    }

    // =============================================
    // PIN ORDERS
    // =============================================

    async function togglePin(orderId: string) {
        const order = orders.find(o => o.id === orderId);
        if (!order) return { success: false, error: "Order not found" };

        const newPinnedState = !order.is_pinned;

        // Optimistic update via React Query cache
        optimisticUpdate((prev) =>
            prev.map((o) =>
                o.id === orderId ? { ...o, is_pinned: newPinnedState } : o
            )
        );

        try {
            const { data, error } = await supabase
                .from("orders")
                .update({ is_pinned: newPinnedState })
                .eq("id", orderId)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error("Pin update failed: write was rejected");
            return { success: true };
        } catch (err) {
            console.error("Error toggling pin:", err);
            // Rollback optimistic update
            optimisticUpdate((prev) =>
                prev.map((o) =>
                    o.id === orderId ? { ...o, is_pinned: !newPinnedState } : o
                )
            );
            const msg = err instanceof Error ? err.message : "Failed to toggle pin";
            toast.error(msg);
            return { success: false, error: msg };
        }
    }

    async function setPin(orderId: string, isPinned: boolean) {
        optimisticUpdate((prev) =>
            prev.map((o) =>
                o.id === orderId ? { ...o, is_pinned: isPinned } : o
            )
        );

        try {
            const { data, error } = await supabase
                .from("orders")
                .update({ is_pinned: isPinned })
                .eq("id", orderId)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error("Pin update failed: write was rejected");
            return { success: true };
        } catch (err) {
            console.error("Error setting pin:", err);
            optimisticUpdate((prev) =>
                prev.map((o) =>
                    o.id === orderId ? { ...o, is_pinned: !isPinned } : o
                )
            );
            const msg = err instanceof Error ? err.message : "Failed to set pin";
            toast.error(msg);
            return { success: false, error: msg };
        }
    }

    // =============================================
    // REVIEW / VERIFIED
    // =============================================

    async function toggleReviewed(orderId: string) {
        const order = orders.find(o => o.id === orderId);
        if (!order) return { success: false, error: "Order not found" };

        const newReviewedState = !order.is_reviewed;

        optimisticUpdate((prev) =>
            prev.map((o) =>
                o.id === orderId ? { ...o, is_reviewed: newReviewedState } : o
            )
        );

        try {
            const { data, error } = await supabase
                .from("orders")
                .update({ is_reviewed: newReviewedState })
                .eq("id", orderId)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error("Review update failed: write was rejected");
            return { success: true };
        } catch (err) {
            console.error("Error toggling reviewed:", err);
            optimisticUpdate((prev) =>
                prev.map((o) =>
                    o.id === orderId ? { ...o, is_reviewed: !newReviewedState } : o
                )
            );
            const msg = err instanceof Error ? err.message : "Failed to toggle reviewed";
            toast.error(msg);
            return { success: false, error: msg };
        }
    }

    async function markAsVerifiedCustomer(orderId: string) {
        const order = orders.find(o => o.id === orderId);
        if (!order) return { success: false, error: "Order not found" };

        const phone = order.phone;
        optimisticUpdate((prev) =>
            prev.map((o) =>
                o.phone === phone ? { ...o, is_verified_customer: true } : o
            )
        );

        try {
            const { data, error } = await supabase
                .from("orders")
                .update({ is_verified_customer: true })
                .eq("phone", phone)
                .select("id");

            if (error) throw error;
            if (!data || data.length === 0) throw new Error("Verified update failed: write was rejected");
            return { success: true };
        } catch (err) {
            console.error("Error marking as verified customer:", err);
            optimisticUpdate((prev) =>
                prev.map((o) =>
                    o.phone === phone ? { ...o, is_verified_customer: false } : o
                )
            );
            const msg = err instanceof Error ? err.message : "Failed to mark as verified";
            toast.error(msg);
            return { success: false, error: msg };
        }
    }

    // =============================================
    // BULK OPERATIONS
    // =============================================

    async function bulkUpdateStatus(orderIds: string[], status: Order["status"]) {
        try {
            const previousOrders = orders.filter(o => orderIds.includes(o.id));
            const currentStatuses: { [key: string]: Order["status"] } = {};
            const expectedUpdatedAts: { [key: string]: string } = {};
            previousOrders.forEach(o => {
                currentStatuses[o.id] = o.status;
                if (o.updated_at) expectedUpdatedAts[o.id] = o.updated_at;
            });

            // Get current user information for attribution
            const { profile: currentProfile, user: currentUser } = authRef.current;
            const changedBy = currentProfile?.display_name || currentUser?.email || 'System';
            const changedByAvatar = currentProfile?.avatar_url;

            // Use central repository for bulk updates
            const { successfulOperations, failedOperations } = await orderRepository.bulkUpdateStatus(
                orderIds,
                status,
                undefined, // rejectionReason
                changedBy,
                changedByAvatar || undefined,
                expectedUpdatedAts
            );

            if (successfulOperations.length === 0 && failedOperations.length > 0) {
                // If everything failed, throw the first error to be caught by the outer catch block
                throw failedOperations[0].error || new Error("Bulk status update failed completely");
            } else if (failedOperations.length > 0) {
                console.warn(`[bulkUpdateStatus] ${failedOperations.length} orders failed to update, possibly due to conflicts:`, failedOperations);
                toast.warning(`${failedOperations.length} orders could not be updated (they may have been modified by someone else)`);
            }

            const successfulIds = successfulOperations.map((op: { id: string }) => op.id);

            // Handle Advanced Inventory & Supplies for each SUCCESSFUL order
            import("@/lib/inventory-engine").then(engine => {
                const nowIsActive = !['completed', 'delivered', 'rejected', 'refund_delivered', 'refund_failed', 'cancelled'].includes(status);

                successfulOperations.forEach(({ id }: { id: string }) => {
                    const previousOrder = previousOrders.find(o => o.id === id);
                    if (!previousOrder) return;
                    
                    const items = previousOrder.items || [];
                    const prevWasActive = !['completed', 'delivered', 'rejected', 'refund_delivered', 'refund_failed', 'cancelled'].includes(previousOrder.status);

                    if (status === 'completed' || status === 'delivered') {
                        engine.fulfillOrder(items);
                        engine.deductSupplies(items.length);
                    } else if (status === 'rejected' || status === 'refund_delivered') {
                        engine.quarantineOrder(id, items, `Bulk changed to ${status}`);
                    } else if (status === 'cancelled' && prevWasActive) {
                        engine.releaseAllocation(items);
                    } else if (nowIsActive && !prevWasActive) {
                        if (['rejected', 'refund_delivered', 'cancelled'].includes(previousOrder.status)) {
                            engine.removeFromQuarantine(id);
                        }
                        engine.allocateOrder(items);
                    }
                });
            }).catch(console.error);

            // Record status change to history table for each updated order
            const historyEntries = successfulIds.map(id => ({
                order_id: id,
                changed_by: changedBy,
                from_status: currentStatuses[id] || 'unknown',
                to_status: status,
                changed_at: new Date().toISOString(),
                notes: `Bulk update to ${status}`,
            }));

            if (historyEntries.length > 0) {
                const { error: historyError } = await supabase
                    .from("order_status_history")
                    .insert(historyEntries);

                if (historyError) {
                    console.error("Failed to record bulk status history (but status was updated):", historyError);
                    toast.error("Status updated, but failed to log history records.");
                }
            }

            // Update React Query cache
            optimisticUpdate((prev) =>
                prev.map((order) =>
                    orderIds.includes(order.id) ? { ...order, status } : order
                )
            );

            return { success: true, count: orderIds.length };
        } catch (err) {
            console.error("Error bulk updating orders:", err);
            const msg = err instanceof Error ? err.message : "Failed to bulk update";
            toast.error(msg);
            return { success: false, error: msg };
        }
    }

    async function bulkArchive(orderIds: string[]) {
        try {
            const { error: updateError } = await supabase
                .from("orders")
                .update({ is_archived: true })
                .in("id", orderIds);

            if (updateError) throw updateError;

            // Remove archived orders from active list in cache
            optimisticUpdate((prev) => prev.filter((order) => !orderIds.includes(order.id)));
            return { success: true, count: orderIds.length };
        } catch (err) {
            console.error("Error archiving orders:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to archive orders",
            };
        }
    }

    async function bulkUnarchive(orderIds: string[]) {
        try {
            const { error: updateError } = await supabase
                .from("orders")
                .update({ is_archived: false })
                .in("id", orderIds);

            if (updateError) throw updateError;

            await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
            return { success: true, count: orderIds.length };
        } catch (err) {
            console.error("Error unarchiving orders:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to unarchive orders",
            };
        }
    }

    async function bulkDelete(orderIds: string[]) {
        try {
            const uniqueOrderIds = Array.from(new Set(orderIds));
            if (uniqueOrderIds.length === 0) {
                return { success: true, count: 0 };
            }

            // Get current session token for server-side auth verification from context
            if (!session?.access_token) {
                throw new Error("Not authenticated. Please sign in again.");
            }

            const t1 = performance.now();
            // Use server-side API route with service role to bypass RLS
            const res = await fetch("/api/orders/delete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ ids: uniqueOrderIds }),
            });

            const result = await res.json();
            const t2 = performance.now();
            console.log(`[Perf] Frontend fetch to /api/orders/delete took: ${(t2 - t1).toFixed(2)}ms`);

            if (!result.success) {
                throw new Error(result.error || "Failed to delete orders");
            }

            const deletedIds = new Set(result.deletedIds || []);

            if (deletedIds.size === 0) {
                throw new Error("No orders were deleted.");
            }

            const t3 = performance.now();
            optimisticUpdate((prev) => prev.filter((order) => !deletedIds.has(order.id)));
            const t4 = performance.now();
            console.log(`[Perf] Frontend optimistic update took: ${(t4 - t3).toFixed(2)}ms`);

            const t5 = performance.now();
            // Invalidate React Query cache so stale data doesn't reappear
            queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
            const t6 = performance.now();
            console.log(`[Perf] Frontend query invalidation took: ${(t6 - t5).toFixed(2)}ms`);
            console.log(`[Perf] Total frontend bulkDelete time: ${(performance.now() - t1).toFixed(2)}ms`);

            return {
                success: deletedIds.size === uniqueOrderIds.length,
                count: deletedIds.size,
                requestedCount: uniqueOrderIds.length,
                deletedIds: Array.from(deletedIds),
            };
        } catch (err) {
            console.error("Error deleting orders:", err);
            const msg = err instanceof Error ? err.message : "Failed to delete orders";
            toast.error(msg);
            return { success: false, error: msg };
        }
    }

    async function deleteOrder(orderId: string) {
        try {
            const result = await bulkDelete([orderId]);
            return { success: result.success, error: result.error };
        } catch (err) {
            console.error("Error deleting order:", err);
            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to delete order",
            };
        }
    }

    async function checkOrderIdExists(orderId: string, excludeUuid?: string): Promise<boolean> {
        try {
            let query = supabase
                .from("orders")
                .select("id")
                .eq("order_id", orderId);

            if (excludeUuid) {
                query = query.neq("id", excludeUuid);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data && data.length > 0;
        } catch (err) {
            console.error("Error checking order ID:", err);
            return false;
        }
    }

    // =============================================
    // EXPORT
    // =============================================

    function exportOrders(orderIds: string[], format: "csv" | "xlsx" = "csv") {
        const ordersToExport = orders.filter((o) => orderIds.includes(o.id));

        const headers = [
            "Order ID", "Customer Name", "Phone", "City", "Address",
            "Items", "Total", "Status", "Payment Status", "Created At",
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
        deductDeliveryFee?: boolean;
        notes?: string;
    }) {
        const originalOrder = orders.find((o) => o.id === originalOrderId);
        if (!originalOrder) {
            return { success: false, error: "Original order not found" };
        }

        if (!originalOrder.items || originalOrder.items.length === 0) {
            return { success: false, error: "الطلب الأصلي لا يحتوي على منتجات" };
        }

        const existingReturns = orders.filter(o =>
            o.is_return && o.original_order_id === originalOrderId
        );
        const returnCount = existingReturns.length + 1;

        const sequenceNum = originalOrder.sequence_number || originalOrder.order_id;
        const returnOrderId = `RTN-${sequenceNum}-${returnCount}`;

        const deliveryFeeDeduction = returnData.deductDeliveryFee ? 5000 : 0;
        const finalReturnAmount = returnData.return_amount - deliveryFeeDeduction;

        // Default return note template with the actual refund amount
        const defaultReturnNote = `استرجاع المنتج من الزبون والتأكد من سلامته وعدم تضرر زجاجة العطر او نقصانها , ووجود كارت الضمان , مع إعطاء الزبون مبلغ قدره ${finalReturnAmount.toLocaleString()} دينار , خلافه يمنع الاسترجاع من الزبون.`;

        const returnOrder: Omit<Order, "id" | "created_at" | "updated_at"> = {
            order_id: returnOrderId,
            customer_name: originalOrder.customer_name,
            phone: originalOrder.phone,
            city: originalOrder.city,
            governorate_code: originalOrder.governorate_code,
            address_details: originalOrder.address_details,
            items: returnData.items || originalOrder.items,
            price: -finalReturnAmount,
            status: "return_pending",
            notes: returnData.notes || defaultReturnNote,
            is_return: true,
            is_replacement: false,
            original_order_id: originalOrderId,
            priority: "high",
            payment_status: "pending",
            is_archived: false,
            delivery_fee: deliveryFeeDeduction,
            rejection_reason: returnData.reason,
            source: originalOrder.source || "other",
        };

        return createOrder(returnOrder);
    }

    async function createReplacementOrder(originalOrderId: string, replacementData: {
        old_items: OrderItem[];
        new_items: OrderItem[];
        deductDeliveryFee?: boolean;
        notes?: string;
    }) {
        const originalOrder = orders.find((o) => o.id === originalOrderId);
        if (!originalOrder) {
            return { success: false, error: "Original order not found" };
        }

        if (!originalOrder.items || originalOrder.items.length === 0) {
            return { success: false, error: "الطلب الأصلي لا يحتوي على منتجات" };
        }

        const existingReplacements = orders.filter(o =>
            o.is_replacement && o.original_order_id === originalOrderId
        );
        const replacementCount = existingReplacements.length + 1;

        const sequenceNum = originalOrder.sequence_number || originalOrder.order_id;
        const replacementOrderId = `RPL-${sequenceNum}-${replacementCount}`;

        // Calculate price difference between old and new items
        const oldTotal = replacementData.old_items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
        const newTotal = replacementData.new_items.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
        const priceDifference = newTotal - oldTotal;

        const deliveryFeeDeduction = replacementData.deductDeliveryFee ? 5000 : 0;

        // Default replacement note template
        const defaultNote = replacementData.notes || "استبدال المنتج القديم بعد التأكد من سلامته وعدم تضرر زجاجة العطر او نقصانها خلافه يمنع الاستبدال قطعاً, ثم إعطاء الزبون المنتج الجديد . 5000 دينار توصيل مقطوعة من الحساب";

        const replacementOrder: Omit<Order, "id" | "created_at" | "updated_at"> = {
            order_id: replacementOrderId,
            customer_name: originalOrder.customer_name,
            phone: originalOrder.phone,
            city: originalOrder.city,
            governorate_code: originalOrder.governorate_code,
            address_details: originalOrder.address_details,
            items: replacementData.new_items,
            price: priceDifference,
            status: "confirmed",
            notes: defaultNote,
            is_replacement: true,
            is_return: false,
            original_order_id: originalOrderId,
            priority: "high",
            payment_status: priceDifference > 0 ? "pending" : "cod",
            is_archived: false,
            delivery_fee: deliveryFeeDeduction,
            source: originalOrder.source || "other",
        };

        return createOrder(replacementOrder);
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

            const combinedItems = [...(keepOrder.items || [])];
            for (const archiveItem of archiveOrder.items || []) {
                const existingItem = combinedItems.find((i) => i.name === archiveItem.name);
                if (existingItem) {
                    existingItem.quantity = (existingItem.quantity || 1) + (archiveItem.quantity || 1);
                } else {
                    combinedItems.push(archiveItem);
                }
            }

            const combinedPrice = (Number(keepOrder.price) || 0) + (Number(archiveOrder.price) || 0);
            const combinedNotes = [keepOrder.notes, archiveOrder.notes].filter(Boolean).join(' | ');

            const { error: updateError } = await supabase
                .from("orders")
                .update({
                    items: combinedItems,
                    price: combinedPrice,
                    notes: combinedNotes || keepOrder.notes,
                })
                .eq("id", keepOrderId);

            if (updateError) throw updateError;

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

            // Record history for both orders
            const { profile: currentProfile, user: currentUser } = authRef.current;
            const changedBy = currentProfile?.display_name || currentUser?.email || 'System';

            await supabase
                .from("order_status_history")
                .insert([
                    {
                        order_id: keepOrderId,
                        changed_by: changedBy,
                        from_status: keepOrder.status,
                        to_status: keepOrder.status, // Still the same status, but data changed
                        notes: `Merged with #${archiveOrder.order_id}`,
                    },
                    {
                        order_id: archiveOrderId,
                        changed_by: changedBy,
                        from_status: archiveOrder.status,
                        to_status: "rejected",
                        notes: `Merged into #${keepOrder.order_id}`,
                    }
                ]);

            // Update React Query cache
            optimisticUpdate((prev) =>
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
            const msg = err instanceof Error ? err.message : "Failed to merge orders";
            toast.error(msg);
            return { success: false, error: msg };
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
            const { error: updateError } = await supabase
                .from("orders")
                .update(lastAction.previousState)
                .eq("id", lastAction.orderId);

            if (updateError) throw updateError;

            // Update React Query cache
            optimisticUpdate((prev) =>
                prev.map((order) =>
                    order.id === lastAction.orderId
                        ? { ...order, ...lastAction.previousState }
                        : order
                )
            );

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
    // FAANG-GRADE MEMOIZATION
    // Stabilize the hook payload to prevent Context invalidation loops
    // =============================================

    const latestFn = {
        // Legacy fetch
        fetchOrders,
        fetchArchivedOrders,

        // Single order operations
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
        bulkUnarchive,
        bulkDelete,
        exportOrders,
        createBatch,

        // Return orders
        createReturnOrder,
        createReplacementOrder,

        // Merge
        mergeOrders,

        // Notes
        addOrderNote,
        getOrderNotes,

        // Timeline
        getOrderTimeline,

        // Reminders
        setFollowUpReminder,
        getActiveReminders,
        completeReminder,

        // Duplicate management
        dismissDuplicate,

        // Undo
        undoLastAction,
        getLastUndoAction,
        clearUndoStack,
        checkOrderIdExists,
    };

    const apiRef = useRef(latestFn);

    useLayoutEffect(() => {
        apiRef.current = latestFn;
    });

    const stableAPI = useMemo(() => {
        const proxy: Record<string, unknown> = {};
        for (const key in latestFn) {
            proxy[key as keyof typeof latestFn] = (...args: unknown[]) => {
                // @ts-expect-error dynamic wrapper
                return apiRef.current[key as keyof typeof latestFn](...args);
            };
        }
        return proxy as typeof latestFn;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return {
        ...stableAPI,
        canUndo: undoStack.length > 0,
    };
}
