import type { createSupabaseServiceClient } from "@/lib/supabase-server";

type ServiceDb = ReturnType<typeof createSupabaseServiceClient>;

/** More files of one kind than this in 10 minutes from one shop is not a support chat. */
export const SUPPORT_FILES_PER_10_MIN = 10;
const TEN_MINUTES_MS = 10 * 60 * 1000;

/** True when the shop already stored its 10 files of this kind in the last 10 minutes. */
export async function supportUploadsFull(db: ServiceDb, bucket: string, tenantId: string): Promise<boolean> {
    const { data, error } = await db.storage.from(bucket).list(tenantId, {
        limit: SUPPORT_FILES_PER_10_MIN,
        sortBy: { column: "created_at", order: "desc" },
    });
    if (error) throw new Error(`Support file list failed (${bucket}): ${error.message}`);
    const since = Date.now() - TEN_MINUTES_MS;
    return (data ?? []).filter((f) => f.created_at && Date.parse(f.created_at) >= since).length >= SUPPORT_FILES_PER_10_MIN;
}
