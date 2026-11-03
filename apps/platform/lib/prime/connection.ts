import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { PrimeMerchant } from "@/lib/prime/shipment-payload";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** The tenant's switched-on Prime link: who it ships as, and the Prime branch its parcels go through. */
export interface PrimeConnection extends PrimeMerchant {
    /** As staff call it (e.g. «فرع الكوت»); null when the operator has not set it. */
    branchName: string | null;
}

/** The tenant's Prime connection when its API link is switched on, else null. */
export async function loadPrimeConnection(db: ServiceDb, tenantId: string): Promise<PrimeConnection | null> {
    const { data, error } = await db
        .from("prime_connections")
        .select("merchant_login_id, shop_id, branch_name")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const branch = typeof data.branch_name === "string" ? data.branch_name.trim() : "";
    return { merchantLoginId: data.merchant_login_id, shopId: Number(data.shop_id), branchName: branch || null };
}

/** The tenant's Prime merchant + shop when its API link is switched on, else null. */
export async function loadPrimeMerchant(db: ServiceDb, tenantId: string): Promise<PrimeMerchant | null> {
    const connection = await loadPrimeConnection(db, tenantId);
    return connection ? { merchantLoginId: connection.merchantLoginId, shopId: connection.shopId } : null;
}
