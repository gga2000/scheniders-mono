import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { PrimeAttentionReason } from "@/lib/prime/status-map";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** Shown as who did it, in the feed and on a push. */
export const PRIME_NOTICE_ACTOR = "Prime";

/** Every notification the Prime link writes; the feed's Prime chip shows these (type LIKE 'prime.%'). */
export type PrimeNoticeType =
    | "prime.delivered"
    | "prime.returning"
    | "prime.cancelled"
    | "prime.price_changed"
    | "prime.partial"
    | "prime.payment"
    | "prime.daily";

/** The order a parcel notice is about. */
export interface PrimeNoticeOrder {
    id: string;
    orderNumber: string;
    customerName: string | null;
    city: string | null;
}

const PARCEL_NOTICE: Readonly<Record<PrimeAttentionReason, { type: PrimeNoticeType; priority: "normal" | "high" }>> = {
    delivery_returning: { type: "prime.returning", priority: "high" },
    delivery_courier_cancelled: { type: "prime.cancelled", priority: "high" },
    delivery_price_changed: { type: "prime.price_changed", priority: "normal" },
    delivery_partial_delivery: { type: "prime.partial", priority: "normal" },
};

interface NoticeRow {
    tenant_id: string;
    type: PrimeNoticeType;
    category: "delivery";
    audience: "tenant" | "user";
    recipient_id: string | null;
    actor_name: string;
    entity_type: string | null;
    entity_id: string | null;
    entity_label: string | null;
    payload: Record<string, string | number | null>;
    priority: "normal" | "high";
    group_key: string;
}

async function insert(db: ServiceDb, rows: NoticeRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await db.from("notifications").insert(rows);
    if (error) throw new Error(`Prime notification failed: ${error.message}`);
}

/** A parcel Prime flagged for a person: coming back, cancelled by Prime, delivered at another price or in part. */
export async function noticeParcelFlag(db: ServiceDb, tenantId: string, order: PrimeNoticeOrder, reason: PrimeAttentionReason): Promise<void> {
    const { type, priority } = PARCEL_NOTICE[reason];
    await insert(db, [
        {
            tenant_id: tenantId,
            type,
            category: "delivery",
            audience: "tenant",
            recipient_id: null,
            actor_name: PRIME_NOTICE_ACTOR,
            entity_type: "order",
            entity_id: order.id,
            entity_label: `#${order.orderNumber}`,
            payload: { customer: order.customerName, city: order.city },
            priority,
            group_key: `${type}:${order.id}`,
        },
    ]);
}

/**
 * One line for every parcel a status read moved to delivered: how many, and
 * the governorate when they all went to one. Orders delivered as one batch.
 */
export async function noticeDelivered(db: ServiceDb, tenantId: string, orders: readonly PrimeNoticeOrder[], batchKey: string): Promise<void> {
    if (orders.length === 0) return;
    const cities = new Set(orders.map((o) => o.city?.trim() || null));
    const [only] = cities;
    const single = orders.length === 1 ? orders[0] : null;
    await insert(db, [
        {
            tenant_id: tenantId,
            type: "prime.delivered",
            category: "delivery",
            audience: "tenant",
            recipient_id: null,
            actor_name: PRIME_NOTICE_ACTOR,
            entity_type: single ? "order" : null,
            entity_id: single ? single.id : null,
            entity_label: single ? `#${single.orderNumber}` : null,
            payload: { count: orders.length, city: cities.size === 1 ? (only ?? null) : null, customer: single?.customerName ?? null },
            priority: "normal",
            group_key: `prime.delivered:${batchKey}`,
        },
    ]);
}

/** The store's administrators: Prime's money goes to them only. */
async function storeAdmins(db: ServiceDb, tenantId: string): Promise<string[]> {
    const { data, error } = await db.from("tenant_members").select("user_id").eq("tenant_id", tenantId).eq("role", "admin").eq("status", "active");
    if (error) throw new Error(error.message);
    return (data ?? []).map((m) => String(m.user_id));
}

/** Money news (a payment, the evening summary), one row per administrator. */
export async function noticeForAdmins(
    db: ServiceDb,
    tenantId: string,
    type: "prime.payment" | "prime.daily",
    payload: Record<string, string | number | null>,
    groupKey: string,
): Promise<void> {
    const admins = await storeAdmins(db, tenantId);
    await insert(
        db,
        admins.map((userId) => ({
            tenant_id: tenantId,
            type,
            category: "delivery" as const,
            audience: "user" as const,
            recipient_id: userId,
            actor_name: PRIME_NOTICE_ACTOR,
            entity_type: null,
            entity_id: null,
            entity_label: null,
            payload,
            priority: "normal" as const,
            group_key: groupKey,
        })),
    );
}
