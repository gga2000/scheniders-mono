import { createHash } from "node:crypto";
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

/** What the database answers once the images are on the product. */
const attachedSchema = z.object({ image_url: z.string(), added: z.number().int() });

type Admin = ReturnType<typeof createAdminClient>;

/**
 * A link's file name, without its extension: the same link always saves to
 * the same file, so a second call for a product finds what the first saved.
 */
function importStem(link: string): string {
  return `import-${createHash("sha256").update(link).digest("hex").slice(0, 20)}`;
}

/**
 * POST /api/merchants/[id]/product-import/images: the images of one product
 * the import added (Fermi B12 item 7). Each link from the merchant's file is
 * fetched from the public internet only, checked to be a real image, and
 * saved in the shop's product-images storage where the product editor keeps
 * gallery images; admin_attach_product_images then puts them on the product
 * and writes the staff log line. A link that fails is named with why; the
 * others are saved all the same.
 *
 * A second call with the same links adds nothing twice: a link already saved
 * for the product is not fetched again, and the database skips an image the
 * product already has. "saved" counts the links whose image is on the
 * product after the call.
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
  const { productId } = parsed.data;
  const links = [...new Set(parsed.data.links)];

  const supabase = createAdminClient();
  try {
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("tenant_id", id)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return NextResponse.json({ error: "Product not found in this shop" }, { status: 404 });

    // The product editor's own place for gallery images: the shop may manage them from there.
    const folder = `gallery/${productId}`;
    const { data: listed, error: listError } = await supabase.storage.from(BUCKET).list(folder, { limit: 1000, search: "import-" });
    if (listError) throw listError;
    const earlier = new Map((listed ?? []).map((file) => [file.name.replace(/\.[^.]+$/, ""), `${folder}/${file.name}`]));

    const toFetch = links.filter((link) => !earlier.has(importStem(link)));
    const fetched = new Map(await Promise.all(toFetch.map(async (link) => [link, await fetchImage(link)] as const)));
    const failed: { link: string; reason: string }[] = [];
    /** Files on the product after the attach, in link order. */
    const paths: string[] = [];
    /** Files this call saved: removed again if the database does not take them. */
    const fresh: string[] = [];
    for (const link of links) {
      const stem = importStem(link);
      const saved = earlier.get(stem);
      if (saved !== undefined) {
        paths.push(saved);
        continue;
      }
      const image = fetched.get(link);
      if (!image?.ok) {
        failed.push({ link, reason: image?.reason ?? "The link did not open" });
        continue;
      }
      const path = `${folder}/${stem}.${image.kind.ext}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, image.bytes, { contentType: image.kind.type, upsert: false });
      if (uploadError && !alreadyThere(uploadError)) {
        console.error("Product image upload failed:", uploadError);
        failed.push({ link, reason: "The image could not be saved" });
        continue;
      }
      // Already there: a call running beside this one saved the same link first.
      if (!uploadError) fresh.push(path);
      paths.push(path);
    }

    if (paths.length === 0) return NextResponse.json({ saved: 0, imageUrl: null, failed });

    const urls = paths.map((path) => publicUrl(supabase, path));
    const { data, error } = await supabase
      .rpc("admin_attach_product_images", {
        p_tenant: id,
        p_product: productId,
        p_urls: urls,
        p_admin_user_id: auth.user.id,
        p_actor_email: auth.user.email ?? null,
      })
      .then(
        (answer) => answer,
        (thrown: unknown) => ({ data: null, error: { code: "", message: thrown instanceof Error ? thrown.message : String(thrown) } }),
      );
    if (error) {
      if (refusedByDatabase(error)) {
        // Refused: nothing was written, so nothing points at this call's files.
        await removeFiles(supabase, fresh);
        if (error.code === "P0002") return NextResponse.json({ error: "Product not found in this shop" }, { status: 404 });
      } else {
        // The call broke off: it may have been written. Keep the files the
        // product now shows; a second call reuses the rest.
        await removeUnattached(supabase, productId, fresh);
      }
      throw error;
    }
    const attached = attachedSchema.parse(data);
    return NextResponse.json({ saved: urls.length, imageUrl: attached.image_url, failed });
  } catch (error) {
    console.error("Product import images API error:", error);
    return NextResponse.json({ error: "Failed to save the images" }, { status: 500 });
  }
}

const publicUrl = (supabase: Admin, path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

/** Storage's answer when the path already holds a file (upsert off). */
function alreadyThere(error: { message: string; statusCode?: string }): boolean {
  return error.statusCode === "409" || /already exists/i.test(error.message);
}

/**
 * Whether the database itself refused the call (a SQLSTATE code), so its
 * transaction was rolled back; a call that broke off on the way has none.
 */
function refusedByDatabase(error: { code?: string }): boolean {
  return typeof error.code === "string" && /^[0-9A-Z]{5}$/.test(error.code);
}

async function removeFiles(supabase: Admin, paths: string[]) {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.error("Product image clean-up failed:", error);
}

/** After a call that broke off: removes the files the product's gallery does not hold. */
async function removeUnattached(supabase: Admin, productId: string, paths: string[]) {
  if (paths.length === 0) return;
  const urls = paths.map((path) => publicUrl(supabase, path));
  const { data, error } = await supabase.from("product_images").select("image_url").eq("product_id", productId).in("image_url", urls);
  if (error) {
    // Unknown whether they are on the product: they stay, and a second call reuses them.
    console.error("Product image clean-up check failed:", error);
    return;
  }
  const shown = new Set((data ?? []).map((row: { image_url: string }) => row.image_url));
  await removeFiles(
    supabase,
    paths.filter((_, n) => !shown.has(urls[n] ?? "")),
  );
}
