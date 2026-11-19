import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { IMPORT_MAX_IMAGES } from "@/lib/product-import";
import { fetchImage } from "@/lib/product-import-images";
import { notAnId } from "@/lib/route-id";

export const dynamic = "force-dynamic";

const BUCKET = "product-images";

const bodySchema = z.object({
  productId: z.string().uuid(),
  links: z.array(z.string().min(1).max(2048)).min(1).max(IMPORT_MAX_IMAGES),
});

/**
 * POST /api/merchants/[id]/product-import/images: the images of one product
 * the import added (Fermi B12 item 7). Each link from the merchant's file is
 * fetched from the public internet only, checked to be a real image, and
 * saved in the shop's product-images storage where the product editor keeps
 * gallery images; admin_attach_product_images then puts them on the product
 * and writes the staff log line. A link that fails is named with why; the
 * others are saved all the same.
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
  const { productId, links } = parsed.data;

  const supabase = createAdminClient();
  const saved: string[] = [];
  try {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("tenant_id", id)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return NextResponse.json({ error: "Product not found in this shop" }, { status: 404 });

    const fetched = await Promise.all(links.map((link) => fetchImage(link)));
    const failed: { link: string; reason: string }[] = [];
    const urls: string[] = [];
    const stamp = Date.now();
    for (const [n, image] of fetched.entries()) {
      const link = links[n] ?? "";
      if (!image.ok) {
        failed.push({ link, reason: image.reason });
        continue;
      }
      // The product editor's own place for gallery images: the shop may manage them from there.
      const path = `gallery/${productId}/import-${stamp}-${n + 1}.${image.kind.ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, image.bytes, { contentType: image.kind.type, upsert: false });
      if (uploadError) {
        console.error("Product image upload failed:", uploadError);
        failed.push({ link, reason: "The image could not be saved" });
        continue;
      }
      saved.push(path);
      urls.push(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    }

    if (urls.length === 0) return NextResponse.json({ saved: 0, imageUrl: null, failed });

    const { data, error } = await supabase.rpc("admin_attach_product_images", {
      p_tenant: id,
      p_product: productId,
      p_urls: urls,
      p_admin_user_id: auth.user.id,
      p_actor_email: auth.user.email ?? null,
    });
    if (error) {
      await removeSaved(supabase, saved);
      if (error.code === "P0002") return NextResponse.json({ error: "Product not found in this shop" }, { status: 404 });
      throw error;
    }
    const attached = z.object({ image_url: z.string(), added: z.number().int() }).parse(data);
    return NextResponse.json({ saved: attached.added, imageUrl: attached.image_url, failed });
  } catch (error) {
    console.error("Product import images API error:", error);
    return NextResponse.json({ error: "Failed to save the images" }, { status: 500 });
  }
}

/** Files saved for a product the database then refused: nothing points at them. */
async function removeSaved(supabase: ReturnType<typeof createAdminClient>, paths: string[]) {
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.error("Product image clean-up failed:", error);
}
