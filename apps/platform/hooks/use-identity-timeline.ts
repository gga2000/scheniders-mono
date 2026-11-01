"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/auth/auth-provider";
import { normalizePhoneForSearch } from "@/lib/order-utils";
import { storedPhoneVariants } from "@/lib/order-server-search";

export type IdentityEventType = "name" | "city" | "address" | "phone";

export interface IdentityEvent {
    type: IdentityEventType;
    value: string;
    created_at: string;
}

export function useIdentityTimeline(phone: string | undefined) {
    const { tenantId } = useAuth();
    return useQuery({
        queryKey: ["identity-timeline", tenantId, phone],
        queryFn: async (): Promise<IdentityEvent[]> => {
            if (!phone || !tenantId) return [];

            // orders.phone keeps the number as typed ("07…" or "+964…"), so
            // match every stored spelling of this customer's number.
            const normalized = normalizePhoneForSearch(phone);
            if (!normalized) return [];
            const variants = storedPhoneVariants(normalized);
            const list = variants.map((v) => `"${v}"`).join(",");

            const { data, error } = await supabase
                .from("orders")
                .select("customer_name, city, address_details, created_at, phone, secondary_phone")
                .eq("tenant_id", tenantId)
                .or(`phone.in.(${list}),secondary_phone.in.(${list})`)
                .order("created_at", { ascending: true });
            if (error) throw error;

            const rows = (data || []) as Array<{
                customer_name: string | null;
                city: string | null;
                address_details: string | null;
                created_at: string;
                phone: string | null;
                secondary_phone: string | null;
            }>;

            const seenNames = new Set<string>();
            const seenCities = new Set<string>();
            const seenAddresses = new Set<string>();
            const seenPhones = new Set<string>();
            const events: IdentityEvent[] = [];

            for (const row of rows) {
                if (row.customer_name && !seenNames.has(row.customer_name)) {
                    seenNames.add(row.customer_name);
                    events.push({ type: "name", value: row.customer_name, created_at: row.created_at });
                }
                if (row.city && !seenCities.has(row.city)) {
                    seenCities.add(row.city);
                    events.push({ type: "city", value: row.city, created_at: row.created_at });
                }
                if (row.address_details && !seenAddresses.has(row.address_details)) {
                    seenAddresses.add(row.address_details);
                    events.push({ type: "address", value: row.address_details, created_at: row.created_at });
                }
                const altPhone = row.secondary_phone && normalizePhoneForSearch(row.secondary_phone) !== normalized ? row.secondary_phone : null;
                if (altPhone && !seenPhones.has(altPhone)) {
                    seenPhones.add(altPhone);
                    events.push({ type: "phone", value: altPhone, created_at: row.created_at });
                }
            }

            return events;
        },
        enabled: !!phone && !!tenantId,
        staleTime: 5 * 60 * 1000,
    });
}
