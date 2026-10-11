"use client";

import { useState, useRef, useLayoutEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { diag } from "@/lib/diag";
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
import { exportOrders as exportOrdersFromUtils } from "@/lib/order-export-utils";
import { calculateTotal } from "@/lib/order-utils";
import type { CreateOrderInput, CreateOrderResult } from "@/types/order";
import { activityLogger } from "@/lib/activity-logger";
import { OrderSchema } from "@/lib/schemas";
import { splitOrderAction, unsplitOrderAction } from "@/app/actions/orders";
import { MAX_ORDER_IDS_PER_REQUEST } from "@/lib/order-api-schemas";
import { getIdempotencyGuard, generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "sonner";
import {
    useUpdateStatusMutation,
    useUpdateOrderMutation,
    useCreateOrderMutation,
    orderKeys
} from "@/hooks/use-orders-query";
import { orderRepository } from "@/lib/repositories/order-repository";
import { classifyTransition } from "@/lib/order-status-machine";
import { reportOrderError } from "@/lib/order-telemetry";
import { useOrderStore } from "@/store/use-order-store";
import { scheduleDayFromToday } from "@/lib/order-format-utils";
import { routeCreateOrderDate, FutureOrderDateError, FUTURE_ORDER_DATE_CODE } from "@/lib/order-date-guard";
import { toBaghdadDayKey } from "@/lib/order-window";
import {
    summarizeBulkFailures,
    formatFailedOrderList,
    findUnaffectedIds,
} from "@/lib/order-bulk-result";

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
    /**
     * The status this action set. Undo only applies while the order is still
     * on it — otherwise someone else has moved the order on and reverting
     * would clobber their write.
     */
    expectedStatus?: Order["status"];
}

interface UseOrderCrudOptions {
    orders?: Order[];
}

export function useOrderCrud({ orders = [] }: UseOrderCrudOptions = {}) {
    const queryClient = useQueryClient();
    const { user, profile, session, tenantId } = useAuth();

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
        rejectionReason?: string,
        reasonId?: string
    ) {
        const _t0 = performance.now();
        diag.log(`[Diag:StatusUpdate] START orderId=${orderId} newStatus=${status} timestamp=${Date.now()}`);

        // ── INSTANT OPTIMISTIC UPDATE ──
        // Apply optimistic UI immediately (no debounce) so the user sees feedback.
        const currentCache = queryClient.getQueryData<Order[]>(orderKeys.lists());
        const previousOrder = currentCache?.find(o => o.id === orderId) || orders.find(o => o.id === orderId);

        // Auto-redirect: return orders marked as "delivered" should use "refund_delivered"
        if (previousOrder?.is_return && status === 'delivered') {
            status = 'refund_delivered' as Order["status"];
        }

        // COR-3: report a status change that has no legitimate reading — an order
        // claiming a fulfilment outcome it was never shipped for. Deliberately
        // reported, not blocked: 60 distinct transitions occur in production in a
        // six-month window, including corrections that look wrong but are real
        // work, so refusing them would stop staff mid-shift.
        if (previousOrder) {
            const verdict = classifyTransition(previousOrder.status, status);
            if (verdict.kind === "unusual") {
                reportOrderError(new Error(`Unusual status transition: ${previousOrder.status} -> ${status}`), {
                    operation: "orders-unusual-status-transition",
                    orderId,
                    extra: { from: previousOrder.status, to: status, reason: verdict.reason },
                });
            }
        }

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
                expectedStatus: status,
            }, ...prev.slice(0, MAX_UNDO_STACK - 1)]);
        }

        // ── DEBOUNCED NETWORK CALL (300ms) ──
        // If another status change for the same order arrives within 300ms,
        // cancel the previous timer and only send the latest status.
        const debounceMap = statusDebounceRef.current;
        const existingTimer = debounceMap.get(orderId);
        if (existingTimer) clearTimeout(existingTimer);
        diag.log(`[Diag:StatusUpdate] DEBOUNCE orderId=${orderId} cancelledPrevious=${!!existingTimer}`);

        return new Promise<{ success: boolean; error?: string; superseded?: boolean }>((resolve) => {
            debounceMap.set(orderId, setTimeout(async () => {
                debounceMap.delete(orderId);

                // Latest-wins gate
                const seqMap = statusMutationSeqRef.current;
                const mySeq = (seqMap.get(orderId) ?? 0) + 1;
                seqMap.set(orderId, mySeq);
                diag.log(`[Diag:StatusUpdate] DEBOUNCE_FIRE orderId=${orderId} seq=${mySeq} elapsed=${(performance.now() - _t0).toFixed(1)}ms`);

                try {
                    const _tMut = performance.now();
                    diag.log(`[Diag:StatusUpdate] MUTATION_START orderId=${orderId} seq=${mySeq}`);

                    // Get current user information for attribution
                    const { profile: currentProfile, user: currentUser } = authRef.current;
                    const changedBy = currentProfile?.display_name || currentUser?.email || 'System';
                    const changedByAvatar = currentProfile?.avatar_url;

                    // Read the concurrency token at FIRE time, not at click time:
                    // `previousOrder` was snapshotted before the 300ms debounce, so
                    // a preceding write by this same user may already have advanced
                    // the version. Using the stale snapshot produced a false
                    // "modified elsewhere" conflict against ourselves.
                    const freshOrder = queryClient
                        .getQueryData<Order[]>(orderKeys.lists())
                        ?.find(o => o.id === orderId);

                    await updateStatusMutation.mutateAsync({
                        orderId,
                        status,
                        rejectionReason,
                        rejectionReasonId: reasonId,
                        last_status_changed_by_name: changedBy,
                        last_status_changed_by_avatar: changedByAvatar || undefined,
                        expectedVersion: freshOrder?.version ?? previousOrder?.version,
                    });
                    diag.log(`[Diag:StatusUpdate] MUTATION_OK orderId=${orderId} seq=${mySeq} took=${(performance.now() - _tMut).toFixed(1)}ms`);

                    // Reserved/stock math is owned by the DB trigger on `orders`.
                    // Here we only fire side-effects the trigger does NOT cover:
                    //   - supplies/BOM deduction
                    //   - QC quarantine queue population for returns
                    if (previousOrder && previousOrder.status !== status) {
                        import("@/lib/inventory-engine").then(engine => {
                            const items = previousOrder.items || [];
                            const TERMINAL = ['completed', 'delivered', 'rejected', 'refund_delivered', 'refund_failed', 'cancelled'];
                            const prevWasActive = !TERMINAL.includes(previousOrder.status);
                            const nowIsActive = !TERMINAL.includes(status);

                            if (status === 'completed' || status === 'delivered') {
                                engine.deductSupplies(items);
                            } else if (status === 'rejected' || status === 'refund_delivered') {
                                engine.quarantineOrder(orderId, items, rejectionReason || `Changed to ${status}`);
                            } else if (nowIsActive && !prevWasActive &&
                                       ['rejected', 'refund_delivered', 'cancelled'].includes(previousOrder.status)) {
                                engine.removeFromQuarantine(orderId);
                            }
                        }).catch(console.error);
                    }

                    // Record status change to history table
                    if (previousOrder && previousOrder.status !== status) {
                        const { profile: currentProfile, user: currentUser } = authRef.current;
                        const changedBy = currentProfile?.display_name || currentUser?.email || 'System';

                        diag.log(`[Diag:StatusUpdate] HISTORY_INSERT orderId=${orderId}`);
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
                                    tenant_id: tenantId,
                                }]);
                            
                            if (historyError) {
                                diag.log(`[Diag:StatusUpdate] HISTORY_ERR orderId=${orderId} err=${historyError.message}`);
                                console.error("Failed to record status history:", historyError);
                                toast.error("Status updated, but failed to log history record");
                            } else {
                                diag.log(`[Diag:StatusUpdate] HISTORY_OK orderId=${orderId}`);
                            }
                        } catch (historyErr) {
                            diag.log(`[Diag:StatusUpdate] HISTORY_CATCH_ERR orderId=${orderId} err=${historyErr}`);
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
                            rejectionReason,
                            tenantId
                        );
                    }

                    diag.log(`[Diag:StatusUpdate] RESOLVE orderId=${orderId} success=true totalTime=${(performance.now() - _t0).toFixed(1)}ms`);
                    resolve({ success: true });
                } catch (err) {
                    // If we've been superseded, don't show error
                    if (seqMap.get(orderId) !== mySeq) {
                        diag.log(`[Diag:StatusUpdate] RESOLVE orderId=${orderId} superseded=true seq=${mySeq} currentSeq=${seqMap.get(orderId)}`);
                        resolve({ success: false, superseded: true });
                        return;
                    }
                    diag.log(`[Diag:StatusUpdate] MUTATION_ERR orderId=${orderId} seq=${mySeq} err=${err instanceof Error ? err.message : err} totalTime=${(performance.now() - _t0).toFixed(1)}ms`);
                    console.error("Error updating order status:", err);
                    const msg = err instanceof Error ? err.message : "Failed to update order status";
                    toast.error(msg);
                    resolve({ success: false, error: msg });
                }
            }, 300));
        });
    }

    async function updateOrder(orderId: string, updates: Partial<Order>, expectedVersion?: number, retryCount = 0): Promise<{ success: boolean; error?: string; code?: string; data?: Order }> {
        const _tUpdate = performance.now();
        diag.log(`[Diag:UpdateOrder] START orderId=${orderId} fields=${Object.keys(updates).join(',')} retry=${retryCount}`);
        try {
            const cleanUpdates = { ...updates };
            delete (cleanUpdates as Record<string, unknown>).customer;

            // --- Audit Trail Tracking (prepare changes list) ---
            const currentCache = queryClient.getQueryData<Order[]>(orderKeys.lists());
            const previousOrder = currentCache?.find(o => o.id === orderId) || orders.find(o => o.id === orderId);

            let auditChanges: string[] = [];
            if (previousOrder) {
                const changes: string[] = [];
                const FieldsToTrack: (keyof Order)[] = [
                    'customer_name', 'phone', 'secondary_phone', 'city',
                    'address_details', 'price', 'notes', 'internal_notes',
                    'priority', 'payment_status', 'scheduled_date', 'created_at'
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
                    scheduled_date: "Scheduled Date",
                    created_at: "Order Date"
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

                auditChanges = changes;
            }

            // Use the caller's expected version, else the one we hold in cache.
            const conflictCheckVersion = expectedVersion ?? previousOrder?.version;

            await updateOrderMutation.mutateAsync({
                orderId,
                updates: cleanUpdates,
                expectedVersion: conflictCheckVersion
            });

            // Record audit trail AFTER successful update (not before!)
            if (auditChanges.length > 0 && previousOrder) {
                const { profile: currentProfile, user: currentUser } = authRef.current;
                const changedBy = currentProfile?.display_name || currentUser?.email || 'System';

                const { error: detailHistoryError } = await supabase
                    .from("order_status_history")
                    .insert([{
                        order_id: orderId,
                        from_status: previousOrder.status,
                        to_status: previousOrder.status,
                        changed_at: new Date().toISOString(),
                        notes: `Updated: ${auditChanges.join(', ')}`,
                        changed_by: changedBy,
                        tenant_id: tenantId,
                    }]);

                if (detailHistoryError) {
                    console.error("Failed to record detail history:", detailHistoryError);
                    toast.error("Changes saved, but the audit entry could not be recorded");
                }
            }

            diag.log(`[Diag:UpdateOrder] MUTATION_OK orderId=${orderId} took=${(performance.now() - _tUpdate).toFixed(1)}ms`);
            return { success: true };
        } catch (err) {
            // Auto-retry on conflict (up to 2 times)
            if (err instanceof Error && err.message === "CONFLICT_DETECTED" && retryCount < 2) {
                diag.log(`[Diag:UpdateOrder] CONFLICT_RETRY orderId=${orderId} attempt=${retryCount + 1}`);

                // Fetch the latest version from the server
                await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
                await new Promise(resolve => setTimeout(resolve, 300)); // Brief delay for cache to update

                // Retry with fresh data
                return updateOrder(orderId, updates, undefined, retryCount + 1);
            }

            diag.log(`[Diag:UpdateOrder] MUTATION_ERR orderId=${orderId} err=${err instanceof Error ? err.message : err} took=${(performance.now() - _tUpdate).toFixed(1)}ms`);
            console.error("Error updating order:", err);

            // A future order date is a field error: the caller shows it under
            // the order-date control and keeps the form open.
            if (err instanceof FutureOrderDateError) {
                return { success: false, error: err.message, code: FUTURE_ORDER_DATE_CODE };
            }

            // Only show toast on final failure
            if (!(err instanceof Error && err.message === "CONFLICT_DETECTED") || retryCount >= 2) {
                toast.error(err instanceof Error ? err.message : "Failed to update order");
            }

            return {
                success: false,
                error: err instanceof Error ? err.message : "Failed to update order",
            };
        }
    }

    async function createOrder(orderData: CreateOrderInput): Promise<CreateOrderResult> {
        // Extract custom_created_at before passing to mutation (not part of Order schema)
        const { custom_created_at, ...cleanOrderData } = orderData;

        // Idempotency guard: prevent double-click / duplicate submissions
        const fingerprint = `create_${cleanOrderData.order_id || ''}_${cleanOrderData.phone || ''}_${Date.now()}`;
        const idempotencyKey = generateIdempotencyKey(fingerprint);
        const guard = getIdempotencyGuard();

        if (!guard.tryExecute(idempotencyKey)) {
            diag.log(`[Diag:CreateOrder] IDEMPOTENCY_BLOCKED key=${idempotencyKey}`);
            return { success: false, error: "Duplicate request — this order is already being created." };
        }

        try {
            const validationResult = OrderSchema.safeParse({
                ...cleanOrderData,
                items: cleanOrderData.items || [],
            });

            if (!validationResult.success) {
                const errorMessage = validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
                diag.log(`[Diag:CreateOrder] VALIDATION_FAIL errors=${errorMessage}`);
                console.error("Validation failed:", errorMessage);
                return { success: false, error: `Validation Error: ${errorMessage}` };
            }

            // Get current user information for attribution
            const { profile: currentProfile, user: currentUser } = authRef.current;
            const changedBy = currentProfile?.display_name || currentUser?.email || 'System';
            const changedByAvatar = currentProfile?.avatar_url;

            // Include user attribution in the order data so notifications show the correct creator
            const orderDataWithAttribution = {
                ...cleanOrderData,
                last_status_changed_by_name: changedBy,
                last_status_changed_by_avatar: changedByAvatar || undefined,
            };

            // Start order creation instantly for optimal perceived performance
            diag.log(`[Diag:CreateOrder] MUTATION_START`);
            const mutationPromise = createOrderMutation.mutateAsync(orderDataWithAttribution);

            // Calculate risk assessment seamlessly in the background WITHOUT blocking the UI
            try {
                if (cleanOrderData.phone) {
                    diag.log(`[Diag:CreateOrder] FRAUD_CHECK_START phone=${cleanOrderData.phone}`);
                    import("@/lib/fraud-detector").then(async ({ fraudDetector }) => {
                        try {
                            const riskAssessment = await fraudDetector.assessCustomerTrust(cleanOrderData.phone!);
                            // Persist the trust assessment as the risk metadata payload — the
                            // older TrustEngine.getPersistencePayload helper has been removed.
                            const riskPayload = {
                                level: riskAssessment.level,
                                tier: riskAssessment.tier,
                                score: riskAssessment.score,
                                deliverySuccessRate: riskAssessment.deliverySuccessRate,
                                isBlacklisted: riskAssessment.isBlacklisted,
                                lastOrderDate: riskAssessment.lastOrderDate,
                                evaluatedAt: new Date().toISOString(),
                            };
                            diag.log(`[Diag:CreateOrder] FRAUD_CHECK_RESULT level=${riskAssessment.level}`);

                            if (riskAssessment.level === 'high' || riskAssessment.level === 'blocked') {
                                const data = await mutationPromise; // Wait for ID to exist
                                if (data && data.id) {
                                    diag.log(`[Diag:CreateOrder] FRAUD_UPDATE_START orderId=${data.id}`);
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
                            diag.log(`[Diag:CreateOrder] FRAUD_UPDATE_ERR err=${bgErr instanceof Error ? bgErr.message : bgErr}`);
                            console.error("Error in background risk calculation:", bgErr);
                        }
                    });
                }
            } catch (riskErr) {
                console.error("Error initiating risk check:", riskErr);
            }

            const data = await mutationPromise;

            // The form's date goes to one of two columns: a past date back-dates
            // the placement (`created_at`), a future one postpones the order
            // (`scheduled_date`). create_order_atomic accepts neither, so it is a
            // follow-up write — awaited, because this used to be fire-and-forget:
            // a future date went to created_at, the database refused it
            // (trg_orders_created_at_not_future), and nobody was told.
            const { createdAt: backdatedAt, scheduledDate: postponedTo } = routeCreateOrderDate(custom_created_at);
            const dateUpdate: Partial<Order> = {};
            if (backdatedAt) dateUpdate.created_at = backdatedAt;
            if (postponedTo) dateUpdate.scheduled_date = postponedTo;
            if (data?.id && Object.keys(dateUpdate).length > 0) {
                try {
                    const dated = await orderRepository.update(data.id, dateUpdate);
                    queryClient.setQueryData<Order[]>(orderKeys.lists(), (prev) =>
                        prev?.map(o => o.id === data.id ? { ...o, ...dated } : o)
                    );
                    Object.assign(data, dated);
                } catch (dateErr) {
                    reportOrderError(dateErr, { operation: "createOrder-date", orderId: data.id });
                    toast.warning(
                        postponedTo ? "Order created, but not scheduled" : "Order created, but its date was not changed",
                        { description: dateErr instanceof Error ? dateErr.message : "Set the date from the order's details." },
                    );
                }
            }

            // Reserved stock is allocated automatically by the DB trigger on `orders`
            // (INSERT of a confirmed/active order reserves its linked items).

            activityLogger.logOrderCreate(
                data.id,
                data.order_id,
                cleanOrderData.source || "manual",
                tenantId
            );

            // The initial history row is written by the `trg_log_order_creation_history`
            // trigger on `orders`, not here. Writing it client-side only covered
            // orders created through this form — LightFunnels webhook ingestion wrote
            // none at all (35.7% coverage vs 100% for every other source). Doing it in
            // the database covers every ingestion path, including ones added later.

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

            const result = await splitOrderAction(originalOrderId, keptItems, returnedItems, session?.access_token ?? "");

            if (result.success) {
                await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });

                if (originalOrder) {
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
                    }, tenantId);
                }

                // WF-2: split rewrites the original and creates a return order,
                // and used to be irreversible. split_order_atomic now snapshots
                // what it overwrote and returns split_log_id, so the undo can be
                // offered here. It stays valid only while the return order is
                // untouched — the RPC refuses once it has shipped or refunded,
                // and says which, rather than silently doing nothing.
                const splitLogId = (result.data as (Order & { split_log_id?: string }) | undefined)?.split_log_id;
                if (splitLogId) {
                    toast.success("Order split", {
                        description: `A return order was created for ${returnedItems.length} item(s)`,
                        duration: 20000,
                        action: {
                            label: "Undo",
                            onClick: async () => {
                                const undo = await unsplitOrderAction(splitLogId, session?.access_token ?? "");
                                if (!undo.success) {
                                    toast.error("Could not undo the split", { description: undo.error });
                                    return;
                                }
                                await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
                                toast.success("Split undone", { description: "The order is back as it was" });
                            },
                        },
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
        // Baghdad calendar days. `toISOString().split("T")[0]` is the UTC day,
        // which made "tomorrow" land on today between 00:00 and 03:00 Baghdad.
        let scheduledDate: string | null = null;
        if (date === "tomorrow") {
            scheduledDate = scheduleDayFromToday(1);
        } else if (date === "+2days") {
            scheduledDate = scheduleDayFromToday(2);
        } else if (date instanceof Date) {
            scheduledDate = toBaghdadDayKey(date);
        }

        // null clears the schedule. It used to be sent as `undefined`, which
        // PostgREST drops from the payload, so "clear" silently did nothing.
        return updateOrder(orderId, { scheduled_date: scheduledDate });
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
            activityLogger.log({
                action: 'order.edit',
                entityType: 'order',
                entityId: orderId,
                details: { note: newPinnedState ? 'Pinned order' : 'Unpinned order' },
            }, tenantId);
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
            activityLogger.log({
                action: 'order.edit',
                entityType: 'order',
                entityId: orderId,
                details: { note: isPinned ? 'Pinned order' : 'Unpinned order' },
            }, tenantId);
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
            activityLogger.log({
                action: 'order.edit',
                entityType: 'order',
                entityId: orderId,
                details: {
                    order_id: order.order_id,
                    note: newReviewedState ? 'Marked order reviewed' : 'Marked order not reviewed',
                },
            }, tenantId);
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
            activityLogger.log({
                action: 'order.edit',
                entityType: 'order',
                entityId: orderId,
                details: {
                    order_id: order.order_id,
                    note: `Marked customer verified across ${data.length} orders`,
                },
            }, tenantId);
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
            const expectedVersions: { [key: string]: number } = {};
            previousOrders.forEach(o => {
                currentStatuses[o.id] = o.status;
                if (typeof o.version === "number") expectedVersions[o.id] = o.version;
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
                expectedVersions
            );

            if (successfulOperations.length === 0 && failedOperations.length > 0) {
                // If everything failed, throw the first error to be caught by the outer catch block
                throw failedOperations[0].error || new Error("Bulk status update failed completely");
            } else if (failedOperations.length > 0) {
                // Report what actually happened per order. Blaming every failure
                // on a concurrent edit hid permission and transport errors, and
                // naming no orders left no way to know what to retry.
                const summary = summarizeBulkFailures(
                    failedOperations,
                    previousOrders,
                    orderIds.length,
                    "updated",
                );
                console.warn(`[bulkUpdateStatus] ${summary.title}`, failedOperations);
                toast.warning(summary.title, { description: summary.description });
                // Keep the failures selected so a retry does not need reselecting.
                useOrderStore.getState().setSelectedOrders(new Set(summary.failedIds));
            }

            const successfulIds = successfulOperations.map((op: { id: string }) => op.id);

            // Reserved/stock math handled by the DB trigger. Only supplies + QC-queue side-effects here.
            import("@/lib/inventory-engine").then(engine => {
                const TERMINAL = ['completed', 'delivered', 'rejected', 'refund_delivered', 'refund_failed', 'cancelled'];
                successfulOperations.forEach(({ id }: { id: string }) => {
                    const previousOrder = previousOrders.find(o => o.id === id);
                    if (!previousOrder) return;

                    const items = previousOrder.items || [];
                    const prevWasActive = !TERMINAL.includes(previousOrder.status);
                    const nowIsActive = !TERMINAL.includes(status);

                    if (status === 'completed' || status === 'delivered') {
                        engine.deductSupplies(items);
                    } else if (status === 'rejected' || status === 'refund_delivered') {
                        engine.quarantineOrder(id, items, `Bulk changed to ${status}`);
                    } else if (nowIsActive && !prevWasActive &&
                               ['rejected', 'refund_delivered', 'cancelled'].includes(previousOrder.status)) {
                        engine.removeFromQuarantine(id);
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
                tenant_id: tenantId,
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
            // `.in()` succeeds even when RLS filters rows out, so ask which rows
            // were actually written rather than assuming the whole selection was.
            const { data: archived, error: updateError } = await supabase
                .from("orders")
                .update({ is_archived: true })
                .in("id", orderIds)
                .select("id");

            if (updateError) throw updateError;

            const archivedIds = (archived ?? []).map((row) => row.id);
            const skipped = findUnaffectedIds(orderIds, archivedIds);
            if (skipped.length > 0) {
                toast.warning(`${skipped.length} of ${orderIds.length} orders were not archived`, {
                    description: `Not archived: ${formatFailedOrderList(skipped, orders)}`,
                });
            }

            if (archivedIds.length > 0) {
                activityLogger.log({
                    action: 'order.edit',
                    entityType: 'order',
                    entityId: archivedIds[0],
                    details: { note: `Archived ${archivedIds.length} orders`, order_ids: archivedIds },
                }, tenantId);
            }

            // Remove archived orders from active list in cache
            optimisticUpdate((prev) => prev.filter((order) => !archivedIds.includes(order.id)));
            return { success: true, count: archivedIds.length };
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
            const { data: unarchived, error: updateError } = await supabase
                .from("orders")
                .update({ is_archived: false })
                .in("id", orderIds)
                .select("id");

            if (updateError) throw updateError;

            const unarchivedIds = (unarchived ?? []).map((row) => row.id);
            const skipped = findUnaffectedIds(orderIds, unarchivedIds);
            if (skipped.length > 0) {
                toast.warning(`${skipped.length} of ${orderIds.length} orders were not unarchived`, {
                    description: `Not unarchived: ${formatFailedOrderList(skipped, orders)}`,
                });
            }

            if (unarchivedIds.length > 0) {
                activityLogger.log({
                    action: 'order.edit',
                    entityType: 'order',
                    entityId: unarchivedIds[0],
                    details: { note: `Unarchived ${unarchivedIds.length} orders`, order_ids: unarchivedIds },
                }, tenantId);
            }

            await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
            return { success: true, count: unarchivedIds.length };
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
            // The delete route caps a single request at MAX_ORDER_IDS_PER_REQUEST
            // ids, so "select all" over a large book is sent in chunks. Each chunk
            // is independent: a later failure does not undo earlier deletions, and
            // the caller still receives the true deleted set.
            const deletedIds = new Set<string>();
            let chunkError: string | null = null;

            for (let i = 0; i < uniqueOrderIds.length; i += MAX_ORDER_IDS_PER_REQUEST) {
                const chunk = uniqueOrderIds.slice(i, i + MAX_ORDER_IDS_PER_REQUEST);
                const res = await fetch("/api/orders/delete", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ ids: chunk }),
                });

                const result = await res.json();
                if (!result.success) {
                    chunkError = result.error || "Failed to delete orders";
                    break;
                }
                for (const id of (result.deletedIds || []) as string[]) deletedIds.add(id);
            }

            const t2 = performance.now();
            console.log(`[Perf] Frontend fetch to /api/orders/delete took: ${(t2 - t1).toFixed(2)}ms`);

            // Only fail outright if nothing at all was deleted; otherwise report
            // the partial result so the UI can show what actually happened.
            if (chunkError && deletedIds.size === 0) {
                throw new Error(chunkError);
            }

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

    /**
     * ARCH-4: this reimplemented lib/order-export-utils rather than calling it,
     * and had drifted — it appended a trailing space to every item and to every
     * TSV cell, and duplicated the header list and the download plumbing. It now
     * delegates, so the mobile export and the desktop export produce identical
     * files and the CSV quoting fix applies to both.
     */
    function exportOrders(orderIds: string[], format: "csv" | "xlsx" = "csv") {
        const ordersToExport = orders.filter((o) => orderIds.includes(o.id));
        return exportOrdersFromUtils(ordersToExport, format);
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

            // Single atomic RPC: combining items/money, archiving the duplicate
            // and writing both history rows now happen in ONE transaction. The
            // previous three sequential client writes could leave the kept order
            // holding the combined revenue while the duplicate stayed active.
            const { profile: currentProfile, user: currentUser } = authRef.current;
            const changedBy = currentProfile?.display_name || currentUser?.email || 'System';

            const { data: mergedOrder, error: mergeError } = await supabase
                .rpc("merge_orders_atomic", {
                    _keep_order_id: keepOrderId,
                    _archive_order_id: archiveOrderId,
                    _tenant_id: tenantId,
                    _changed_by: changedBy,
                });

            if (mergeError) throw mergeError;

            const merged = mergedOrder as (Order & { merge_log_id?: string }) | null;
            const mergeLogId = merged?.merge_log_id;

            // Update React Query cache
            optimisticUpdate((prev) =>
                prev
                    .map((order) => {
                        if (order.id === keepOrderId) {
                            // Prefer the authoritative row the RPC returned.
                            return merged ? { ...order, ...merged } : order;
                        }
                        return order;
                    })
                    .filter((order) => order.id !== archiveOrderId)
            );

            // WF-2: merge sums two orders' money and archives one of them, and
            // used to be irreversible. merge_orders_atomic now snapshots exactly
            // the columns it overwrites, so this can be handed straight back as
            // an undo instead of sending the operator to support.
            if (mergeLogId) {
                toast.success("Orders merged", {
                    description: `${archiveOrder.order_id} merged into ${keepOrder.order_id}`,
                    duration: 20000,
                    action: {
                        label: "Undo",
                        onClick: async () => {
                            const { error: undoError } = await supabase.rpc("unmerge_orders_atomic", {
                                _merge_log_id: mergeLogId,
                                _tenant_id: tenantId,
                            });
                            if (undoError) {
                                toast.error("Could not undo the merge", { description: undoError.message });
                                return;
                            }
                            await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
                            toast.success("Merge undone", { description: "Both orders are back as they were" });
                        },
                    },
                });
            }

            // Merging combines money and archives the duplicate, so it needs an
            // audit record naming both sides — previously it left none at all.
            activityLogger.log({
                action: 'order.edit',
                entityType: 'order',
                entityId: keepOrderId,
                details: {
                    order_id: keepOrder.order_id,
                    note: `Merged order ${archiveOrder.order_id} into ${keepOrder.order_id}`,
                    merged_from_order_id: archiveOrder.order_id,
                    merged_from_id: archiveOrderId,
                },
            }, tenantId);

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
                .insert([{ order_id: orderId, note, tenant_id: tenantId }])
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
                    tenant_id: tenantId,
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
                    tenant_id: tenantId,
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
            // Undo used to write blind on `id` alone, so it would happily revert
            // a newer change made by someone else. Make it a compare-and-set:
            // only apply while the order still holds the status this action set.
            let undoQuery = supabase
                .from("orders")
                .update(lastAction.previousState)
                .eq("id", lastAction.orderId);

            if (lastAction.expectedStatus) {
                undoQuery = undoQuery.eq("status", lastAction.expectedStatus);
            }

            const { data: undone, error: updateError } = await undoQuery.select("id");

            if (updateError) throw updateError;

            if (!undone || undone.length === 0) {
                // Nothing matched: the order moved on, or is no longer visible to
                // this user. Drop the entry so the stack does not keep offering
                // an undo that can never apply.
                setUndoStack(prev => prev.slice(1));
                return {
                    success: false,
                    error: "This order has changed since then, so it was not reverted.",
                };
            }

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
