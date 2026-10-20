import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";

const bodySchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

const paramsSchema = z.object({ id: z.uuid() });

/**
 * `public.convert_lead_atomic` (migration 20261020163000) does the whole
 * conversion — tenant, wallet, subscription, lead update, activity, commission
 * — in one transaction under a row lock on the lead, so two concurrent
 * converts cannot both create a tenant. The plan is fixed (starter) inside the
 * function; changing it afterwards is `change_plan` (super_admin).
 */
const rpcResultSchema = z.discriminatedUnion("outcome", [
  z.object({ outcome: z.literal("converted"), tenant_id: z.uuid() }),
  z.object({ outcome: z.literal("already_converted"), tenant_id: z.uuid().nullable() }),
  z.object({ outcome: z.literal("not_found") }),
  z.object({ outcome: z.literal("prospect_not_open") }),
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Open to support_staff by design — see `convert_lead` in admin-permissions.ts.
  const auth = await requireAdminPermission(request, "convert_lead");
  if (auth instanceof NextResponse) return auth;

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("convert_lead_atomic", {
    _lead_id: parsedParams.data.id,
    // Attributed to the authenticated caller, never to a client-supplied id.
    _actor_id: auth.user.id,
    _notes: parsed.data.notes || null,
  });

  if (error) {
    console.error("Convert error:", error);
    return NextResponse.json({ error: "Failed to convert lead" }, { status: 500 });
  }

  const result = rpcResultSchema.safeParse(data);
  if (!result.success) {
    console.error("Convert error: unexpected convert_lead_atomic result", data);
    return NextResponse.json({ error: "Failed to convert lead" }, { status: 500 });
  }

  switch (result.data.outcome) {
    case "converted":
      return NextResponse.json({ success: true, tenant_id: result.data.tenant_id });
    case "already_converted":
      return NextResponse.json(
        { error: "Lead already converted", tenant_id: result.data.tenant_id },
        { status: 409 }
      );
    case "not_found":
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    case "prospect_not_open":
      return NextResponse.json(
        { error: "The prospect store is no longer an open trial and cannot be converted" },
        { status: 400 }
      );
  }
}
