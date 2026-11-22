import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin-supabase";
import { requireAdminPermission } from "@/lib/api-auth";
import { everyRow } from "@/lib/every-row";
import { IMPORT_MAX_FILE_BYTES, guessMapping, type ShopProducts } from "@/lib/product-import";
import { readImportFile } from "@/lib/product-import-file";
import { notAnId } from "@/lib/route-id";

export const dynamic = "force-dynamic";

/**
 * POST /api/merchants/[id]/product-import/read: reads the Excel or CSV file
 * a merchant sent (Fermi B12 item 7) and answers its header and rows, a first
 * guess at which column is which product field, and what the shop already
 * has (product names, the SKUs and barcodes of its products and choices, and
 * its products with no image yet), so the screen can plan and preview the
 * import (lib/product-import.ts planImport) as the team matches columns.
 * It saves nothing. Body: multipart, the file in "file".
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminPermission(request, "import_products");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const missing = notAnId(id);
  if (missing) return missing;

  let file: File;
  try {
    const sent = (await request.formData()).get("file");
    if (!(sent instanceof File)) return NextResponse.json({ error: "Choose the file to read." }, { status: 400 });
    file = sent;
  } catch {
    return NextResponse.json({ error: "Choose the file to read." }, { status: 400 });
  }
  if (file.size > IMPORT_MAX_FILE_BYTES) {
    return NextResponse.json({ error: "The file is bigger than 4 MB. Split it into smaller files." }, { status: 413 });
  }

  const read = await readImportFile(new Uint8Array(await file.arrayBuffer()), file.name);
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 422 });

  try {
    const supabase = createAdminClient();
    const { data: shop, error: shopError } = await supabase.from("tenants").select("id").eq("id", id).maybeSingle();
    if (shopError) throw shopError;
    if (!shop) return NextResponse.json({ error: "Merchant not found" }, { status: 404 });

    const [products, variants] = await Promise.all([
      everyRow<{ id: string; name: string | null; sku: string | null; barcode: string | null; is_archived: boolean | null; image_url: string | null }>((from, to) =>
        supabase
          .from("products")
          .select("id, name, sku, barcode, is_archived, image_url")
          .eq("tenant_id", id)
          .order("id")
          .range(from, to),
      ),
      everyRow<{ sku: string | null; barcode: string | null }>((from, to) =>
        supabase.from("product_variants").select("sku, barcode").eq("tenant_id", id).order("id").range(from, to),
      ),
    ]);

    const has: ShopProducts = {
      // Archived products do not block a name, as in admin_import_products.
      names: products.filter((p) => !p.is_archived && p.name).map((p) => p.name ?? ""),
      // A SKU or barcode stays taken while its product is archived, and a code
      // on a choice counts as on a product: the till finds a scanned code on
      // either, and admin_import_products refuses both.
      skus: [...products, ...variants].map((p) => p.sku?.trim() ?? "").filter(Boolean),
      barcodes: [...products, ...variants].map((p) => p.barcode?.trim() ?? "").filter(Boolean),
      // A product gets its main image with its first one (the editor and
      // admin_attach_product_images both set it), so none means no photo:
      // a second read of the file finishes a run whose images were cut short.
      noImages: products.filter((p) => !p.is_archived && p.name && !p.image_url).map((p) => ({ id: p.id, name: p.name ?? "" })),
    };

    return NextResponse.json({ file: read.file, mapping: guessMapping(read.file.headers), shop: has });
  } catch (error) {
    console.error("Product import read API error:", error);
    return NextResponse.json({ error: "Failed to read the shop's products" }, { status: 500 });
  }
}
