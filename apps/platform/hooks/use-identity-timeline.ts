"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type IdentityEventType = "name" | "city" | "address" | "phone";

export interface IdentityEvent {
    type: IdentityEventType;
    value: string;
    created_at: string;
}

export function useIdentityTimeline(phone: string | undefined) {
    return useQuery({
        queryKey: ["identity-timeline", phone],
        queryFn: async (): Promise<IdentityEvent[]> => {
            if (!phone) return [];

            const { data, error } = await supabase
                .from("orders")
                .select("customer_name, city, address_details, created_at, phone, secondary_phone")
                .or(`phone.eq.${phone},secondary_phone.eq.${phone}`)
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
                const altPhone = row.secondary_phone && row.secondary_phone !== phone ? row.secondary_phone : null;
                if (altPhone && !seenPhones.has(altPhone)) {
                    seenPhones.add(altPhone);
                    events.push({ type: "phone", value: altPhone, created_at: row.created_at });
                }
            }

            return events;
        },
        enabled: !!phone,
        staleTime: 5 * 60 * 1000,
    });
}
