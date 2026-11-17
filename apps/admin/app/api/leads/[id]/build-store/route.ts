import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api-auth";
import { notAnId } from "@/lib/route-id";

// What the Build Store form sends. Blank name: the lead's. No `slug`: the web
// address is made from the name. The database checks each again.
const bodySchema = z.object({
  business_name: z.string().trim().max(200).optional(),
  // The form's "Web Address": its Latin letters and digits start the address.
  slug: z.string().trim().max(60).optional(),
  industry_id: z.uuid().nullish(),
  description: z.string().trim().max(2000).nullish(),
  template: z.string().trim().min(1).max(40).default("general"),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  products: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        price: z.number().int().min(0).default(0),
        description: z.string().max(2000).nullish(),
        image_url: z.url().nullish(),
      }),
    )
    .max(10)
    .default([]),
});

/**
 * `public.admin_build_prospect_store` names the shop and makes its web
 * address from the form (the lead's name when the form leaves it blank), and
 * writes the shop, its products, its
 * wallet, the lead's link, the lead's history and the staff log row in one
 * transaction under a lock on the lead, the lock convert_lead_atomic takes
 * too. A failure leaves nothing behind, and a build cannot race a convert.
 */
const resultSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), tenant_id: z.uuid(), slug: z.string().min(1) }),
  z.object({ success: z.literal(false), error: z.enum(["bad_input", "not_found", "converted", "store_exists"]) }),
]);

const REFUSED = {
  bad_input: { status: 400, error: "Invalid store details" },
  not_found: { status: 404, error: "Lead not found" },
  converted: { status: 409, error: "Lead already converted" },
  store_exists: { status: 409, error: "A store already exists for this lead" },
} as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Building a demo store is lead work, which the sales team owns.
  const admin = await requireAdminPermission(request, "convert_lead");
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: REFUSED.bad_input.error }, { status: REFUSED.bad_input.status });
  }
  const body = parsed.data;

  const { data, error } = await createAdminClient().rpc("admin_build_prospect_store", {
    _lead_id: id,
    _template: body.template,
    _primary_color: body.primary_color ?? null,
    _products: body.products.map((p) => ({
      name: p.name,
      price: p.price,
      description: p.description ?? null,
      image_url: p.image_url ?? null,
    })),
    // Attributed to the signed-in caller, never to a client-supplied id.
    _admin_user_id: admin.user.id,
    _actor_email: admin.user.email ?? null,
    _business_name: body.business_name || null,
    _address: body.slug || null,
    _industry_id: body.industry_id ?? null,
    _description: body.description || null,
  });
  if (error) {
    console.error("Build store error:", error);
    return NextResponse.json({ error: "Failed to build store" }, { status: 500 });
  }

  const result = resultSchema.safeParse(data);
  if (!result.success) {
    console.error("Build store error: unexpected admin_build_prospect_store result", data);
    return NextResponse.json({ error: "Failed to build store" }, { status: 500 });
  }
  if (!result.data.success) {
    const refused = REFUSED[result.data.error];
    return NextResponse.json({ error: refused.error }, { status: refused.status });
  }

  const { tenant_id, slug } = result.data;
  return NextResponse.json({ tenant: { id: tenant_id, slug }, store_url: `/s/${slug}` }, { status: 201 });
}
