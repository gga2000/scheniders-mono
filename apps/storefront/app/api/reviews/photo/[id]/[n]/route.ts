import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createSupabaseServerClient,
  createSupabaseServiceClient,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().uuid(),
  n: z.coerce.number().int().min(0).max(9),
});

/**
 * One photo of an APPROVED review. The bucket is private; the review row is
 * read on the anon client, so the `reviews_public_read` policy (approved, live
 * store) decides whether the photo exists at all. Pending or rejected photos
 * get the same 404 as a missing one.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; n: string }> },
): Promise<Response> {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) return new NextResponse(null, { status: 404 });
  const { id, n } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: review, error } = await supabase
    .from("product_reviews")
    .select("tenant_id, photo_paths")
    .eq("id", id)
    .eq("status", "approved")
    .maybeSingle<{ tenant_id: string; photo_paths: string[] }>();
  if (error) return new NextResponse(null, { status: 503 });
  const path = review?.photo_paths[n];
  // A path outside the review's own store folder is never served.
  if (!review || !path || !path.startsWith(`${review.tenant_id}/`)) {
    return new NextResponse(null, { status: 404 });
  }

  const { data: blob, error: downloadErr } = await createSupabaseServiceClient()
    .storage.from("review-photos")
    .download(path);
  if (downloadErr || !blob) return new NextResponse(null, { status: 404 });

  return new NextResponse(blob.stream(), {
    headers: {
      "content-type": blob.type || "application/octet-stream",
      "x-content-type-options": "nosniff",
      // Short, so a review the merchant later hides stops showing soon.
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
