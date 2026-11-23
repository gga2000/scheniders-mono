import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import { getPrimeClient, type PrimeClient } from "@/lib/prime/client";
import { createDemoPrimeClient, DEMO_PRIME_CONNECTION } from "@/lib/prime/demo-client";
import type { PrimeMerchant } from "@/lib/prime/shipment-payload";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** The tenant's switched-on Prime link: who it ships as, and the Prime branch its parcels go through. */
export interface PrimeConnection extends PrimeMerchant {
    /** As staff call it (e.g. «فرع الكوت»); null when the operator has not set it. */
    branchName: string | null;
}

/**
 * The tenant's Prime connection when its API link is switched on, else null,
 * with when Prime's statuses were last read for it (null before the first read).
 */
export async function loadPrimeConnection(db: ServiceDb, tenantId: string): Promise<{ connection: PrimeConnection; syncedAt: string | null } | null> {
    const { data, error } = await db
        .from("prime_connections")
        .select("merchant_login_id, shop_id, branch_name, last_synced_at")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const branch = typeof data.branch_name === "string" ? data.branch_name.trim() : "";
    return {
        connection: { merchantLoginId: data.merchant_login_id, shopId: Number(data.shop_id), branchName: branch || null },
        syncedAt: typeof data.last_synced_at === "string" ? data.last_synced_at : null,
    };
}

/** A tenant's way to Prime: the client to call and the merchant and branch it ships as. */
export interface PrimeLink {
    client: PrimeClient;
    connection: PrimeConnection;
    /** When Prime's statuses were last read for this store; null before the first read and for the demo store, which reads nothing. */
    syncedAt: string | null;
}

async function isDemoTenant(db: ServiceDb, tenantId: string): Promise<boolean> {
    const { data, error } = await db.from("tenants").select("is_demo").eq("id", tenantId).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.is_demo === true;
}

/**
 * The tenant's Prime link, or null when it has none: its switched-on
 * connection through the real Prime client, or, for the demo store (which
 * never has a connection row), the demo client that answers from the store's
 * own parcels and calls no one. Every merchant Prime route starts here.
 */
export async function loadPrimeLink(db: ServiceDb, tenantId: string): Promise<PrimeLink | null> {
    const client = getPrimeClient();
    const found = client ? await loadPrimeConnection(db, tenantId) : null;
    if (client && found) return { client, ...found };
    if (await isDemoTenant(db, tenantId)) return { client: createDemoPrimeClient(db, tenantId), connection: DEMO_PRIME_CONNECTION, syncedAt: null };
    return null;
}
