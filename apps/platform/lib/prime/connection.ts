import type { createSupabaseServiceClient } from "@/lib/supabase-server";
import type { PrimeMerchant } from "@/lib/prime/shipment-payload";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** The tenant's Prime merchant + shop when its API link is switched on, else null. */
export async function loadPrimeMerchant(db: ServiceDb, tenantId: string): Promise<PrimeMerchant | null> {
    const { data, error } = await db
        .from("prime_connections")
        .select("merchant_login_id, shop_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? { merchantLoginId: data.merchant_login_id, shopId: Number(data.shop_id) } : null;
}
