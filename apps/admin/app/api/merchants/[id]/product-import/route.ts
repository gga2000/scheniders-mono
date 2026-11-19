import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { IMPORT_BATCH, importBatchResultSchema, importProductSchema } from "@/lib/product-import";
import { notAnId } from "@/lib/route-id";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  products: z.array(importProductSchema).min(1).max(IMPORT_BATCH),
});

/**
 * POST /api/merchants/[id]/product-import: adds one batch of up to 100
 * planned products to the shop (Fermi B12 item 7), all or none, through
 * admin_import_products, which also writes the staff log line. A product
 * whose name the shop has by now is skipped and named in the answer, so a
 * batch sent twice adds nothing twice.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "import_products");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { data, error } = await createAdminClient().rpc("admin_import_products", {
      p_tenant: id,
      p_products: parsed.data.products,
      p_admin_user_id: auth.user.id,
      p_actor_email: auth.user.email ?? null,
      p_file_name: parsed.data.fileName,
    });
    if (error) {
      const refused = refusal(error);
      if (refused) return refused;
      throw error;
    }
    return NextResponse.json(importBatchResultSchema.parse(data));
  } catch (error) {
    console.error("Product import API error:", error);
    return NextResponse.json({ error: "Failed to import the products" }, { status: 500 });
  }
}

/** The database's refusals, in words the team can act on; nothing of the batch was added. */
function refusal(error: { code?: string; hint?: string; message?: string }): NextResponse | null {
  if (error.code === "23505") {
    return NextResponse.json(
      { error: "A SKU or barcode in this batch is already used in the shop." },
      { status: 409 },
    );
  }
  if (error.code === "P0001" && error.hint?.startsWith("TENANT_PAUSED")) {
    return NextResponse.json({ error: "This shop is paused for new products. Lift the pause first." }, { status: 409 });
  }
  if (error.code === "P0002") return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  if (error.code === "22023") return NextResponse.json({ error: "A product in this batch is not valid" }, { status: 400 });
  return null;
}
