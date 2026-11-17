import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest, requireAdminPermission } from "@/lib/api-auth";
import { logAdminAction } from "@/lib/activity-logger";

/**
 * GET — whether the seed automation jobs (pg_cron jobs named seed_*) run.
 * POST — switch them on or off (update_settings).
 *
 * A read that failed answered 200 with "off", so the switch showed off for a
 * state nobody knew; and with no seed job at all, switching "on" changed
 * nothing yet answered success, so the switch showed on. Both now say so.
 */

const statusSchema = z.object({
  active: z.boolean(),
  jobs: z.array(z.object({ jobname: z.string(), schedule: z.string(), active: z.boolean() })),
});
const switchBody = z.object({ active: z.boolean() });
const switchedSchema = z.object({ active: z.boolean(), jobs_updated: z.number() });

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { data, error } = await createAdminClient().rpc("get_seed_automation_status");
    if (error) throw error;
    return NextResponse.json(statusSchema.parse(data));
  } catch (error) {
    console.error("Seed automation status error:", error);
    return NextResponse.json({ error: "Could not read whether Seed Automation is on." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission(request, "update_settings");
  if (auth instanceof NextResponse) return auth;

  const body = switchBody.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ success: false, error: "Say whether Seed Automation should be on or off." }, { status: 400 });
  }

  try {
    const { data, error } = await createAdminClient().rpc("toggle_seed_automation", { _active: body.data.active });
    if (error) throw error;
    const switched = switchedSchema.parse(data);
    if (switched.jobs_updated === 0) {
      return NextResponse.json(
        { success: false, error: "There is no seed job to switch, so nothing changed." },
        { status: 409 },
      );
    }

    await logAdminAction(auth, "update_settings", {
      details: { setting: "seed_automation", active: switched.active, jobs: switched.jobs_updated },
    });

    return NextResponse.json({ success: true, ...switched });
  } catch (error) {
    console.error("Seed automation switch error:", error);
    return NextResponse.json({ success: false, error: "Seed Automation did not switch." }, { status: 500 });
  }
}
