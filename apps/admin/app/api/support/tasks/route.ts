import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { adminDisplayName } from "@/lib/support-admin-name";
import { SupportTasksSchema, TaskLogSchema, supportRefusal } from "@/lib/support";

export const dynamic = "force-dynamic";

/**
 * GET /api/support/tasks — the first-week plan tasks due by the end of today
 * (Baghdad), with each shop's support person and last calls. Planned in the
 * database by support_onboard_shops() every 5 minutes.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  try {
    const { data, error } = await createAdminClient().rpc("support_tasks_due");
    if (error) throw error;
    return NextResponse.json({ tasks: SupportTasksSchema.parse(data), me: admin.user.id });
  } catch (error) {
    console.error("Support tasks API error:", error);
    return NextResponse.json({ error: "Failed to load today's tasks" }, { status: 500 });
  }
}

/**
 * POST /api/support/tasks {taskId, outcome, note} — record a call. Done
 * closes the task; no answer brings it back in 3 hours; later, tomorrow.
 * The call and its activity row are written together by support_task_log().
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdminPermission(request, "handle_support");
  if (admin instanceof NextResponse) return admin;

  const parsed = TaskLogSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.rpc("support_task_log", {
      p_task_id: parsed.data.taskId,
      p_admin_id: admin.user.id,
      p_admin_name: await adminDisplayName(supabase, admin),
      p_outcome: parsed.data.outcome,
      p_note: parsed.data.note,
      p_actor_email: admin.user.email ?? null,
    });

    const refusal = supportRefusal(error);
    if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });
    if (error) throw error;

    // The database wrote the call and its support_task_logged activity row
    // in one transaction.
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Support task log error:", error);
    return NextResponse.json({ error: "Failed to save the call" }, { status: 500 });
  }
}
