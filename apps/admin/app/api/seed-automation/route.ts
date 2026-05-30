import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminFromRequest, requireAdminPermission } from "@/lib/api-auth";

/**
 * GET — Check if seed automation cron jobs are active
 * POST — Toggle seed automation on/off (super_admin only)
 */

export async function GET(request: NextRequest) {
  const auth = await requireAdminFromRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("get_seed_automation_status");

    if (error) {
      // If the function doesn't exist or cron isn't set up, return inactive
      return NextResponse.json({ active: false, jobs: [], error: error.message });
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ active: false, jobs: [] }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminPermission(request, "update_settings");
  if (auth instanceof NextResponse) return auth;

  try {
    const { active } = await request.json();
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("toggle_seed_automation", {
      _active: active,
    });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, ...data });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to toggle automation" }, { status: 500 });
  }
}
