import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/api-auth";
import { notAnId } from "@/lib/route-id";
import { LEAD_GONE } from "@/lib/lead-update";

// What the Build Store form sends. Blank name: the lead's. No `slug`: the web
// address is made from the name. The database checks each again. Each refusal
// names the field: one "Invalid store details" for all of them named none.
const bodySchema = z.object({
  business_name: z.string().trim().max(200, { error: "The business name can have at most 200 characters." }).optional(),
  // The form's "Web Address": its Latin letters and digits start the address.
  slug: z.string().trim().max(60, { error: "The web address can have at most 60 characters." }).optional(),
  industry_id: z.uuid({ error: "Pick an industry from the list." }).nullish(),
  description: z.string().trim().max(2000, { error: "The description can have at most 2,000 characters." }).nullish(),
  template: z.string().trim().min(1, { error: "Pick a template." }).max(40, { error: "Pick a template." }).default("general"),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: "The colour must be a code such as #1E1E1E." }).optional(),
  products: z
    .array(
      z.object({
        name: z.string().trim().min(1, { error: "Each product needs a name." }).max(200, { error: "A product name can have at most 200 characters." }),
        price: z
          .number({ error: "A product price must be a number." })
          .int({ error: "A product price is whole dinars, with no fraction." })
          .min(0, { error: "A product price cannot be below 0." })
          .default(0),
        description: z.string().max(2000, { error: "A product description can have at most 2,000 characters." }).nullish(),
        // A web link only: the storefront shows it as the product's picture.
        image_url: z
          .url({ protocol: /^https?$/, error: "A product image must be a full web link, such as https://…/photo.jpg." })
          .nullish(),
      }),
    )
    .max(10, { error: "A store can start with at most 10 products." })
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
  not_found: { status: 404, error: LEAD_GONE },
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
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.path.length ? issue.message : REFUSED.bad_input.error }, { status: REFUSED.bad_input.status });
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
