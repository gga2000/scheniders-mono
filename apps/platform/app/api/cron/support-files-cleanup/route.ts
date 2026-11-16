import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireCronAuth } from "@/lib/cron-auth";
import { CRON_MONITORS, withCronMonitor } from "@/lib/job-monitor";
import { SUPPORT_SHOT_BUCKET, SUPPORT_VOICE_BUCKET } from "@/lib/support/schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Files removed per run; a full batch means the next run carries on. */
const BATCH = 500;

const oldFilesSchema = z.array(
    z.object({ bucket: z.enum([SUPPORT_SHOT_BUCKET, SUPPORT_VOICE_BUCKET]), name: z.string().min(1) }),
);

/**
 * Cron, daily: pictures of the screen and voice notes merchants sent support
 * are kept 30 days. The database names the old files (support_old_files);
 * they are removed through the Storage API so the stored file goes too. The
 * messages keep their text; the staff console says the file is no longer stored.
 */
async function runScheduled(request: Request) {
    const denied = requireCronAuth(request);
    if (denied) return denied;

    const db = createSupabaseServiceClient();
    const { data, error } = await db.rpc("support_old_files", { p_limit: BATCH });
    if (error) {
        console.error("[support-files-cleanup] support_old_files failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const files = oldFilesSchema.safeParse(data);
    if (!files.success) {
        console.error("[support-files-cleanup] Unexpected support_old_files result", files.error.message);
        return NextResponse.json({ error: "Unexpected support_old_files result" }, { status: 500 });
    }

    const removed: Record<string, number> = { [SUPPORT_SHOT_BUCKET]: 0, [SUPPORT_VOICE_BUCKET]: 0 };
    for (const bucket of [SUPPORT_SHOT_BUCKET, SUPPORT_VOICE_BUCKET]) {
        const names = files.data.filter((f) => f.bucket === bucket).map((f) => f.name);
        if (names.length === 0) continue;
        const { data: gone, error: removeError } = await db.storage.from(bucket).remove(names);
        if (removeError) {
            console.error(`[support-files-cleanup] Removing from ${bucket} failed:`, removeError);
            return NextResponse.json({ error: `${bucket}: ${removeError.message}`, removed }, { status: 500 });
        }
        removed[bucket] = gone?.length ?? 0;
    }

    return NextResponse.json({ success: true, removed, hasMore: files.data.length === BATCH });
}

export const GET = withCronMonitor(CRON_MONITORS.supportFilesCleanup, runScheduled);
