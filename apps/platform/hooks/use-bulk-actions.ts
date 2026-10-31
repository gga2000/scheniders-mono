"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { normalizePhoneForSearch } from "@/lib/order-utils";

const TAG_UPSERT_CHUNK = 1000;

export function useCustomerBulkActions() {
    const queryClient = useQueryClient();
    const { tenantId } = useAuth();
    const [isTagging, setIsTagging] = useState(false);

    /**
     * Gives every selected customer every selected tag. The key is
     * (tenant_id, normalized phone, tag_id), so re-tagging is a no-op.
     */
    const bulkAddTags = async (customerPhones: string[], tagIds: string[]) => {
        if (!customerPhones.length || !tagIds.length) return;
        if (!tenantId) throw new Error("No active store");
        setIsTagging(true);

        try {
            const payload = customerPhones.flatMap((phone) =>
                tagIds.map((tagId) => ({
                    tenant_id: tenantId,
                    customer_phone: normalizePhoneForSearch(phone),
                    tag_id: tagId,
                })),
            );

            // Chunked so a select-all over thousands of customers stays under the request limit.
            for (let i = 0; i < payload.length; i += TAG_UPSERT_CHUNK) {
                const { error } = await supabase
                    .from("customer_tag_assignments")
                    .upsert(payload.slice(i, i + TAG_UPSERT_CHUNK), { onConflict: "tenant_id,customer_phone,tag_id", ignoreDuplicates: true });
                if (error) throw error;
            }

            // The list, the drawer and the profile page each cache the tags.
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["customers"] }),
                queryClient.invalidateQueries({ queryKey: ["customer-dialog"] }),
                queryClient.invalidateQueries({ queryKey: ["customer-profile"] }),
            ]);
        } finally {
            setIsTagging(false);
        }
    };

    return {
        bulkAddTags,
        isTagging,
    };
}
