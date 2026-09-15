import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveI18n } from "@scheniders/shared";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Tenant statuses whose storefront is publicly live — mirrors the anon
 * `public_storefront_read` RLS gate. Signups are only accepted for these.
 */
const LIVE_TENANT_STATUSES: readonly string[] = ["trial", "active"];

const newsletterBodySchema = z.object({
  tenant_id: z.string().uuid(),
  // Normalize (trim + lowercase) BEFORE validating so "  Foo@Bar.com " and
  // "foo@bar.com" resolve to the same subscriber row under the
  // UNIQUE(tenant_id, email) constraint.
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  // Accepted for forward-compat (per-locale confirmation emails later);
  // not stored today — mirrors checkout, which accepts-and-drops `locale`.
  locale: z.string().max(10).optional(),
});

/**
 * The merchant's own confirmation line, which often carries the reward the
 * signup was offered for ("your code is WELCOME15").
 *
 * It is read here, server-side, and returned only after a signup succeeds.
 * Passing it to the footer as a prop instead would serialize it into the
 * page payload of every page the footer appears on, so anyone reading the
 * source could take the coupon without subscribing.
 */
const successCopySchema = z.object({
  globals: z.object({
    footer: z.object({
      base: z.object({
        newsletter: z.object({ success_i18n: z.unknown().optional() }).optional(),
      }).optional(),
    }).optional(),
  }).optional(),
});

function successMessageFrom(config: unknown, locale: string | undefined): string | null {
  const parsed = successCopySchema.safeParse(config);
  if (!parsed.success) return null;
  const copy = parsed.data.globals?.footer?.base?.newsletter?.success_i18n;
  if (!copy) return null;
  const resolved = resolveI18n(copy as Parameters<typeof resolveI18n>[0], (locale ?? "ar") as Parameters<typeof resolveI18n>[1]);
  return resolved?.trim() ? resolved : null;
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "بيانات غير صالحة" },
        { status: 400 },
      );
    }

    const parsed = newsletterBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "بيانات غير صالحة" },
        { status: 400 },
      );
    }
    const { tenant_id, email, locale } = parsed.data;

    // Service client — same trusted-server pattern as /api/reviews. Anon RLS
    // does allow this INSERT (policy `public_subscribe_with_tenant`), but the
    // tenant-liveness gate below must be authoritative, and anon reads of
    // `tenants` are themselves RLS-filtered — so the check runs service-side.
    const service = createSupabaseServiceClient();

    // Anti-abuse: never trust the client-supplied tenant id blindly — the
    // tenant must exist and have a live storefront before we store anything.
    const { data: tenant, error: tenantErr } = await service
      .from("tenants")
      .select("id, status, store_config_v2")
      .eq("id", tenant_id)
      .maybeSingle();
    if (tenantErr) {
      console.error("[api/newsletter] tenant lookup failed:", tenantErr);
      return NextResponse.json(
        { ok: false, error: "حدث خطأ. حاول مرة أخرى." },
        { status: 500 },
      );
    }
    if (!tenant || !LIVE_TENANT_STATUSES.includes(tenant.status ?? "")) {
      return NextResponse.json(
        { ok: false, error: "المتجر غير متوفر" },
        { status: 404 },
      );
    }

    // Idempotent signup: UNIQUE(tenant_id, email) exists (migration
    // 20260411000001), so a repeat signup no-ops instead of erroring — the
    // visitor still sees success.
    const { error: insertErr } = await service
      .from("newsletter_subscribers")
      .upsert(
        { tenant_id, email },
        { onConflict: "tenant_id,email", ignoreDuplicates: true },
      );
    if (insertErr) {
      console.error("[api/newsletter] insert failed:", insertErr);
      return NextResponse.json(
        { ok: false, error: "حدث خطأ. حاول مرة أخرى." },
        { status: 500 },
      );
    }

    // The reward travels with the success response, never with the page.
    return NextResponse.json({
      ok: true,
      message: successMessageFrom(tenant.store_config_v2, locale),
    });
  } catch (e) {
    console.error("[api/newsletter]", e);
    return NextResponse.json(
      { ok: false, error: "حدث خطأ. حاول مرة أخرى." },
      { status: 500 },
    );
  }
}
