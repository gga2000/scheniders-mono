"use client";

import { useState, useRef, useLayoutEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { diag } from "@/lib/diag";
import {
    supabase,
    type Order,
    type OrderItem,
    type OrderPriority,
    type PaymentStatus,
} from "@/lib/supabase";
import { createBulkActions } from "@/hooks/order-crud/bulk-actions";
import * as orderRecords from "@/lib/orders/order-records";
import { exportOrders as exportOrdersFromUtils } from "@/lib/order-export-utils";
import { calculateTotal } from "@/lib/order-utils";
import type { CreateOrderInput, CreateOrderResult } from "@/types/order";
import { activityLogger } from "@/lib/activity-logger";
import { OrderSchema } from "@/lib/schemas";
import { checkOrderIdExists as checkOrderIdExistsAction, renameOrderNumberAction, splitOrderAction, unsplitOrderAction } from "@/app/actions/orders";
import { getIdempotencyGuard, generateIdempotencyKey } from "@/lib/idempotency";
import { toast } from "@/hooks/use-toast";
import {
    useUpdateStatusMutation,
    useUpdateOrderMutation,
    useCreateOrderMutation,
    orderKeys,
    catchUpAfterOwnWrite,
} from "@/hooks/use-orders-query";
import { orderRepository } from "@/lib/repositories/order-repository";
import { classifyTransition, resolveStatusForOrder } from "@/lib/order-status-machine";
import { reportOrderError } from "@/lib/order-telemetry";
import { scheduleDayFromToday } from "@/lib/order-format-utils";
import { routeCreateOrderDate, FutureOrderDateError, FUTURE_ORDER_DATE_CODE } from "@/lib/order-date-guard";
import { orderWriteErrorMessage } from "@/lib/order-status-guard";
import { useLanguage } from "@/hooks/use-language";
import { toBaghdadDayKey } from "@/lib/order-window";
import { duplicateCandidateKeys } from "@/hooks/use-duplicate-window-alerts";

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

export type { BulkStatusResult } from "@/hooks/order-crud/bulk-actions";

export function useOrderCrud({ orders = [] }: UseOrderCrudOptions = {}) {
    const queryClient = useQueryClient();
    const { user, profile, session, tenantId } = useAuth();

    // Stable Auth Ref to prevent stale closures in stableAPI proxy
    const authRef = useRef({ user, profile, session });
    useLayoutEffect(() => {
        authRef.current = { user, profile, session };
    });
    const { t } = useLanguage();
    const tRef = useRef(t);
    useLayoutEffect(() => {
        tRef.current = t;
    });

    // Helper: optimistically update the React Query orders cache
    const optimisticUpdate = (updater: (prev: Order[]) => Order[]) => {
        queryClient.setQueryData<Order[]>(orderKeys.lists(), (old) => {
            if (!old) return old;
            return updater(old);
        });
    };

    // Mutations
    // This hook inserts the history row after the PATCH (its trigger writes the
    // order again) and catches up once that lands — see updateOrderStatus.
    const updateStatusMutation = useUpdateStatusMutation({ catchUp: "caller" });
    const updateOrderMutation = useUpdateOrderMutation();
    const createOrderMutation = useCreateOrderMutation();

    const { bulkUpdateStatus, bulkReschedule, bulkArchive, bulkUnarchive, bulkDelete } = createBulkActions({
        orders,
        tenantId,
        session,
        authRef,
        tRef,
        queryClient,
        optimisticUpdate,
    });

    // Undo stack
    const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
    const MAX_UNDO_STACK = 10;

    // Per-order mutation sequence counter: ensures only the LATEST mutation
    // for a given order actually writes to Supabase. Earlier mutations detect
    // they've been superseded and bail out silently.
    const statusMutationSeqRef = useRef(new Map<string, number>());

    // Per-order debounce timers: coalesces rapid-fire status changes (300ms)
    // so only the final status is sent to Supabase. The pending call's resolve
    // is kept so a cancelled call settles as superseded instead of never.
    const statusDebounceRef = useRef(new Map<string, {
        timer: ReturnType<typeof setTimeout>;
        resolve: (result: { success: boolean; superseded: true }) => void;
    }>());

    // Per-order catch-up after a status change (see updateOrderStatus). The
    // next change to the same order waits for it before reading its version.
    const catchUpRef = useRef(new Map<string, Promise<void>>());

    // Abort controller for fetch
    // const isMountedRef = useRef(true);

    // =============================================
    // REFETCH VIA REACT QUERY (replaces legacy fetchOrders)
    // =============================================

    async function fetchOrders() {
        // Simply invalidate the React Query cache — it will refetch automatically
        await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    }

    /**
     * Load the active tenant's archived orders into `orderKeys.archived()`, the
     * cache `useArchivedOrdersQuery` (and so the archive view) reads. This used
     * to run its own `select("*")` with no tenant filter and drop the result,
     * so the archive view stayed empty while every column — margin included —
     * was downloaded.
     */
    async function fetchArchivedOrders() {
        if (!tenantId) return { success: false, error: "No tenant context" };
        try {
            const archived = await queryClient.fetchQuery({
                queryKey: orderKeys.archived(),
                queryFn: () => orderRepository.findArchived(tenantId),
            });
            return { success: true, count: archived.length };
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
        if (previousOrder) status = resolveStatusForOrder(previousOrder, status);

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
        const pending = debounceMap.get(orderId);
        if (pending) {
            clearTimeout(pending.timer);
            pending.resolve({ success: false, superseded: true });
        }
        diag.log(`[Diag:StatusUpdate] DEBOUNCE orderId=${orderId} cancelledPrevious=${!!pending}`);

        return new Promise<{ success: boolean; error?: string; superseded?: boolean }>((resolve) => {
            const timer = setTimeout(async () => {
                debounceMap.delete(orderId);

                // Latest-wins gate
                const seqMap = statusMutationSeqRef.current;
                const mySeq = (seqMap.get(orderId) ?? 0) + 1;
                seqMap.set(orderId, mySeq);
                diag.log(`[Diag:StatusUpdate] DEBOUNCE_FIRE orderId=${orderId} seq=${mySeq} elapsed=${(performance.now() - _t0).toFixed(1)}ms`);

                // A previous status change on this order wrote the row twice
                // (PATCH, then the history trigger). Its catch-up brings the
                // second write — the version this change must be based on —
                // into the cache. Wait for it (it never rejects), or this write
                // would conflict with our own.
                const pendingCatchUp = catchUpRef.current.get(orderId);
                if (pendingCatchUp) await pendingCatchUp;

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

                    const { data: written } = await updateStatusMutation.mutateAsync({
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
                    if (previousOrder && previousOrder.status !== status && tenantId) {
                        import("@/lib/orders/status-side-effects").then(effects =>
                            effects.applyStatusSideEffect(supabase, {
                                tenantId,
                                items: previousOrder.items || [],
                                from: previousOrder.status,
                                to: status,
                            })
                        ).then(result => {
                            if (!result.success) {
                                toast.error(tRef.current("orders.toast.sideEffectFailed", { error: result.error ?? tRef.current("orders.toast.unknownError") }));
                            }
                        }).catch(console.error);
                    }

                    // The status-history row is written by the database
                    // (trg_log_order_status_change), in the same transaction.

                    // Catch the caches up with what this change wrote — whether
                    // the history insert ran, failed or was skipped. It replaces
                    // the full refetch that used to run 2s after every change:
                    // one delta from the sync watermark (floored at our PATCH, so
                    // it always includes the trigger's second write of this row),
                    // then the active search / duplicate-margin queries.
                    const catchUp = catchUpAfterOwnWrite(queryClient, tenantId, {
                        source: "statusSettled",
                        since: written.updated_at,
                    });
                    catchUpRef.current.set(orderId, catchUp);
                    void catchUp.then(() => {
                        if (catchUpRef.current.get(orderId) === catchUp) catchUpRef.current.delete(orderId);
                    });

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
                    const msg = orderWriteErrorMessage(err, tRef.current);
                    toast.error(msg);
                    resolve({ success: false, error: msg });
                }
            }, 300);
            debounceMap.set(orderId, { timer, resolve });
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
            let previousOrder = currentCache?.find(o => o.id === orderId) || orders.find(o => o.id === orderId);

            // F-040: the browser cannot write orders.order_id (the database
            // refuses it); a changed number goes through the server action,
            // and the rest of the update follows on the renamed row.
            const newOrderNumber = cleanUpdates.order_id;
            delete cleanUpdates.order_id;
            if (newOrderNumber !== undefined && newOrderNumber !== previousOrder?.order_id) {
                const renamed = await renameOrderNumberAction(orderId, newOrderNumber, authRef.current.session?.access_token ?? "");
                if (!renamed.success || !renamed.data) {
                    const error = renamed.error || "Failed to change the order number";
                    toast.error(error);
                    return { success: false, error };
                }
                const renamedRow = renamed.data;
                queryClient.setQueryData<Order[]>(orderKeys.lists(), (prev) =>
                    prev?.map(o => o.id === orderId ? { ...o, ...renamedRow } : o)
                );
                previousOrder = previousOrder ? { ...previousOrder, ...renamedRow } : renamedRow;
                // The rename bumped `version`; a caller-held one is now stale.
                expectedVersion = renamedRow.version;
                if (Object.keys(cleanUpdates).length === 0) {
                    return { success: true, data: renamedRow };
                }
            }

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
                    toast.error(tRef.current("orders.toast.auditFailed"));
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
                toast.error(orderWriteErrorMessage(err, tRef.current));
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
                        postponedTo ? tRef.current("orders.toast.createdNotScheduled") : tRef.current("orders.toast.createdDateUnchanged"),
                        dateErr instanceof Error ? dateErr.message : tRef.current("orders.toast.setDateFromDetails"),
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
                // The one success message for a split: callers no longer add
                // their own, which used to stack a second toast on this one.
                toast({
                    title: tRef.current("orders.toast.split"),
                    variant: "success",
                    description: tRef.current("orders.toast.splitDesc", { count: returnedItems.length }),
                    duration: splitLogId ? 20000 : undefined,
                    action: splitLogId ? {
                        label: tRef.current("orders.toast.undo"),
                        onClick: async () => {
                            const undo = await unsplitOrderAction(splitLogId, session?.access_token ?? "");
                            if (!undo.success) {
                                toast.error(tRef.current("orders.toast.splitUndoFailed"), undo.error);
                                return;
                            }
                            await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
                            toast.success(tRef.current("orders.toast.splitUndone"), tRef.current("orders.toast.splitUndoneDesc"));
                        },
                    } : undefined,
                });

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
                .select("id")
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
                .select("id")
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
                .select("id")
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error("Review update failed: write was rejected");
            activityLogger.log({
                action: 'order.edit',
                entityType: 'order',
                entityId: orderId,
                details: {
                    order_id: order.order_id,
                    note: newReviewedState ? 'Marked payment checked' : 'Cleared payment checked',
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

        if (!tenantId) return { success: false, error: "No tenant context" };

        const phone = order.phone;
        optimisticUpdate((prev) =>
            prev.map((o) =>
                o.phone === phone ? { ...o, is_verified_customer: true } : o
            )
        );

        try {
            // Verifying a customer here must never touch another tenant's
            // orders for the same phone number.
            const { data, error } = await supabase
                .from("orders")
                .update({ is_verified_customer: true })
                .eq("tenant_id", tenantId)
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
                toast({
                    title: tRef.current("orders.toast.merged"),
                    variant: "success",
                    description: tRef.current("orders.toast.mergedDesc", { from: archiveOrder.order_id, to: keepOrder.order_id }),
                    duration: 20000,
                    action: {
                        label: tRef.current("orders.toast.undo"),
                        onClick: async () => {
                            const { error: undoError } = await supabase.rpc("unmerge_orders_atomic", {
                                _merge_log_id: mergeLogId,
                                _tenant_id: tenantId,
                            });
                            if (undoError) {
                                toast.error(tRef.current("orders.toast.mergeUndoFailed"), undoError.message);
                                return;
                            }
                            await queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
                            toast.success(tRef.current("orders.toast.mergeUndone"), tRef.current("orders.toast.mergeUndoneDesc"));
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
    // DUPLICATE DISMISSAL
    // =============================================

    /**
     * "Not a duplicate": the merchant has looked at these orders and they are
     * legitimate. Stored as `is_verified_customer` on exactly those orders —
     * the flag the 48h detector already honours (lib/duplicate-window) — so
     * their banners and the confirm/ship guard stand down, while a NEW order
     * from the same number is still checked.
     *
     * This used to insert into `duplicate_dismissals`, a table that never
     * existed on this project: every dismissal failed and the banner returned.
     */
    async function dismissDuplicate(orderIds: string[], notes?: string): Promise<{ success: boolean; error?: string }> {
        const ids = [...new Set(orderIds)];
        if (ids.length === 0) return { success: false, error: "No orders to dismiss" };
        const idSet = new Set(ids);
        // Roll back to what each order had, not to a blanket false.
        const before = new Map(orders.filter(o => idSet.has(o.id)).map(o => [o.id, o.is_verified_customer]));

        optimisticUpdate(prev => prev.map(o => (idSet.has(o.id) ? { ...o, is_verified_customer: true } : o)));
        try {
            const { data, error } = await supabase
                .from("orders")
                .update({ is_verified_customer: true })
                .in("id", ids)
                .select("id");

            if (error) throw error;
            if (!data || data.length === 0) throw new Error("Dismiss failed: write was rejected");
            const first = orders.find(o => idSet.has(o.id));
            activityLogger.log({
                action: 'order.edit',
                entityType: 'order',
                entityId: ids[0],
                details: {
                    order_id: first?.order_id,
                    note: `Dismissed duplicate warning on ${data.length} orders${notes ? `: ${notes}` : ""}`,
                },
            }, tenantId);
            // The margin rows (twins outside the loaded window) are cached
            // separately; refresh them so the index sees the new flag too.
            void queryClient.invalidateQueries({ queryKey: duplicateCandidateKeys.all });
            return { success: true };
        } catch (err) {
            console.error("Error dismissing duplicate:", err);
            optimisticUpdate(prev => prev.map(o => (before.has(o.id) ? { ...o, is_verified_customer: before.get(o.id) } : o)));
            const msg = err instanceof Error ? err.message : "Failed to dismiss duplicate";
            toast.error(msg);
            return { success: false, error: msg };
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
        bulkReschedule,
        bulkArchive,
        bulkUnarchive,
        bulkDelete,
        exportOrders,
        createBatch: (name: string, orderIds: string[], invoiceTemplate?: string, printType?: string) =>
            orderRecords.createBatch(tenantId, orders, name, orderIds, invoiceTemplate, printType),

        // Return orders

        // Merge
        mergeOrders,

        // Notes
        addOrderNote: (orderId: string, note: string) => orderRecords.addOrderNote(tenantId, orderId, note),
        getOrderNotes: orderRecords.getOrderNotes,

        // Timeline
        getOrderTimeline: orderRecords.getOrderTimeline,

        // Duplicate management
        dismissDuplicate,

        // Undo
        undoLastAction,
        getLastUndoAction,
        clearUndoStack,
        // Order numbers are unique across every tenant (orders_order_id_key),
        // so the check runs on the server where it can see them all. Under RLS
        // the browser saw only its own tenant's numbers and called a number
        // another store had taken "available"; the save then failed. It throws
        // when it cannot check, so no caller shows "available" by mistake.
        checkOrderIdExists: (orderId: string, excludeUuid?: string) =>
            checkOrderIdExistsAction(orderId, excludeUuid, authRef.current.session?.access_token ?? ""),
    };

    const apiRef = useRef(latestFn);

    useLayoutEffect(() => {
        apiRef.current = latestFn;
    });

    // One identity for the life of the hook, so consumers can list these in
    // effect deps without re-running; each call reads the latest closure.
    const [stableAPI] = useState(() => {
        type Api = typeof latestFn;
        const proxy = {} as Record<keyof Api, unknown>;
        for (const key of Object.keys(latestFn) as (keyof Api)[]) {
            proxy[key] = (...args: unknown[]) =>
                (apiRef.current[key] as unknown as (...a: unknown[]) => unknown)(...args);
        }
        return proxy as Api;
    });

    return {
        ...stableAPI,
        canUndo: undoStack.length > 0,
    };
}
