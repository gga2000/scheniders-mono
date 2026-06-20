import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { computeRatingSummary } from "@scheniders/shared";
import type { ProductReview } from "@scheniders/shared";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PHOTOS = 4;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — mirrors the bucket's file_size_limit.
const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// ── GET /api/reviews?product_id&tenant_id — approved reviews + rating summary ──
const getQuerySchema = z.object({
  product_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
});

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = getQuerySchema.safeParse({
    product_id: url.searchParams.get("product_id"),
    tenant_id: url.searchParams.get("tenant_id"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  // Anon client → public RLS exposes ONLY approved reviews of live tenants.
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_reviews")
    .select("id,product_id,rating,title,body,author_name,photo_urls,created_at")
    .eq("product_id", parsed.data.product_id)
    .eq("tenant_id", parsed.data.tenant_id)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 });
  }

  const reviews = (data ?? []) as ProductReview[];
  const summary = computeRatingSummary(reviews);
  return NextResponse.json({ reviews, summary });
}

// ── POST /api/reviews — submit a review (multipart: fields + photos[]) ──
// Stored as `pending`; the merchant moderates before it shows publicly.
const postBodySchema = z.object({
  tenant_id: z.string().uuid(),
  product_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  author_name: z.string().trim().min(1).max(80).optional(),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().max(2000).optional(),
});

/** Empty form fields arrive as "" — normalize to undefined for optionals. */
function field(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

export async function POST(req: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form" }, { status: 400 });
  }

  const ratingRaw = field(form, "rating");
  const parsed = postBodySchema.safeParse({
    tenant_id: field(form, "tenant_id"),
    product_id: field(form, "product_id"),
    rating: ratingRaw === undefined ? undefined : Number(ratingRaw),
    author_name: field(form, "author_name"),
    title: field(form, "title"),
    body: field(form, "body"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid review", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { tenant_id, product_id, rating, author_name, title, body } = parsed.data;

  const photos = form
    .getAll("photos")
    .filter((p): p is File => p instanceof File && p.size > 0);
  if (photos.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `At most ${MAX_PHOTOS} photos` },
      { status: 400 },
    );
  }
  for (const photo of photos) {
    if (!MIME_EXT[photo.type]) {
      return NextResponse.json({ error: "Unsupported image type" }, { status: 400 });
    }
    if (photo.size > MAX_BYTES) {
      return NextResponse.json({ error: "Image too large (max 5 MB)" }, { status: 400 });
    }
  }

  const service = createSupabaseServiceClient();

  // Anti-abuse: the product must exist AND belong to the claimed tenant before
  // we accept a review for it (never trust the client-supplied ids blindly).
  const { data: product, error: productErr } = await service
    .from("products")
    .select("id")
    .eq("id", product_id)
    .eq("tenant_id", tenant_id)
    .maybeSingle();
  if (productErr) {
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!product) {
    return NextResponse.json({ error: "Unknown product" }, { status: 404 });
  }

  const photo_urls: string[] = [];
  for (const photo of photos) {
    const ext = MIME_EXT[photo.type];
    const path = `${tenant_id}/${product_id}/${randomUUID()}.${ext}`;
    const bytes = Buffer.from(await photo.arrayBuffer());
    const { error: uploadErr } = await service.storage
      .from("review-photos")
      .upload(path, bytes, { contentType: photo.type, upsert: false });
    if (uploadErr) {
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
    const { data: pub } = service.storage.from("review-photos").getPublicUrl(path);
    photo_urls.push(pub.publicUrl);
  }

  const { error: insertErr } = await service.from("product_reviews").insert({
    tenant_id,
    product_id,
    rating,
    title: title ?? null,
    body: body ?? null,
    author_name: author_name ?? null,
    photo_urls,
    status: "pending",
  });
  if (insertErr) {
    return NextResponse.json({ error: "Could not save review" }, { status: 500 });
  }

  return NextResponse.json({ success: true, pending: true });
}
