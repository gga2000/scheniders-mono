// Blacklist writes, shared by Orders, Returns and Customers.
//
// The key is (tenant_id, normalized phone) and the DB also normalizes on write,
// so a number blocked as 07…, +9647… or 7… is one entry that every intake path
// (manual orders, Lightfunnels, the customer list) matches.

import { supabase } from "@/lib/supabase";
import { normalizePhoneForSearch } from "@/lib/order-utils";

export interface BlacklistWrite {
    tenantId: string;
    phone: string;
    reason: string;
    notes?: string | null;
    addedBy?: string | null;
}

export async function addToBlacklist({ tenantId, phone, reason, notes, addedBy }: BlacklistWrite): Promise<void> {
    const { error } = await supabase.from("blacklist").upsert(
        {
            tenant_id: tenantId,
            phone: normalizePhoneForSearch(phone),
            reason,
            notes: notes || null,
            added_by: addedBy ?? null,
        },
        { onConflict: "tenant_id,phone" },
    );
    if (error) throw error;
}

/**
 * Unblocking needs `customers.unblock` (admins). The database refuses the
 * DELETE for anyone else by matching no rows rather than raising, so an empty
 * result is reported as a failure instead of a silent no-op.
 */
export async function removeFromBlacklist(tenantId: string, phone: string): Promise<void> {
    const { data, error } = await supabase
        .from("blacklist")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("phone", normalizePhoneForSearch(phone))
        .select("phone");
    if (error) throw error;
    if (!data?.length) throw new Error("Customer was not unblocked");
}
