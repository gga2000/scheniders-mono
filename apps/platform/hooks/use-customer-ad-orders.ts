import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import type { AcquisitionOrder } from "@/lib/customer-acquisition";

/** The customer's orders that carried an ad link, in the active store only. */
export function useCustomerAdOrders(phoneVariants: readonly string[], enabled: boolean) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["customer-ad-orders", tenantId, phoneVariants],
        enabled: enabled && !!tenantId && phoneVariants.length > 0,
        queryFn: async (): Promise<AcquisitionOrder[]> => {
            if (!tenantId) throw new Error("No active store");
            const { data, error } = await supabase
                .from("orders")
                .select("created_at, ad_channel, attribution, is_return, is_replacement")
                .eq("tenant_id", tenantId)
                .in("phone", [...phoneVariants])
                .not("ad_channel", "is", null)
                .order("created_at", { ascending: true })
                .limit(50);
            if (error) throw error;
            return data ?? [];
        },
    });
}
