import { NextResponse, type NextRequest } from "next/server";
import { resolvePreviewTokenSecret, signPreviewToken } from "@scheniders/shared/preview-token";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { env } from "@/lib/env";
import { withFailureReport } from "@/lib/job-monitor";
import { buildStorefrontUrl, pickPrimaryDomain } from "@/lib/storefront-url";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** How long the link opens the store; the draft-view session it starts ends with it. */
const STORE_ORDER_LINK_SECONDS = 2 * 60 * 60;

/**
 * GET /api/guide/store-order-link: where the guide's «اطلب من متجرك» stop
 * sends the merchant (Fermi B11). It opens the shop's own store in draft view
 * (the storefront's /api/draft-view, the editor preview's signed token), so
 * an order placed there is a test order: no WhatsApp to the customer, no fee,
 * no trial count, left out of the numbers. Shop admins only; the shop comes
 * from the session.
 */
async function handleGET(request: NextRequest) {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const secret = resolvePreviewTokenSecret();
    if (!secret) throw new Error("Store order link: no preview token secret");

    const db = createSupabaseServiceClient();
    const [tenant, domains] = await Promise.all([
        db.from("tenants").select("slug").eq("id", caller.tenantId).maybeSingle(),
        db.from("tenant_domains").select("domain, created_at").eq("tenant_id", caller.tenantId).eq("verified", true),
    ]);
    if (tenant.error) throw new Error(`Store order link: shop read failed: ${tenant.error.message}`);
    if (domains.error) throw new Error(`Store order link: domains read failed: ${domains.error.message}`);
    const slug = tenant.data?.slug;
    if (!slug) return NextResponse.json({ success: false, error: "no_store" }, { status: 404 });

    const store = new URL(
        buildStorefrontUrl({
            slug,
            customDomain: pickPrimaryDomain(domains.data ?? []),
            rootDomain: env.NEXT_PUBLIC_STOREFRONT_ROOT_DOMAIN,
            hostname: request.nextUrl.host,
        }),
    );
    const link = new URL("/api/draft-view", store.origin);
    link.searchParams.set("tenant", slug);
    link.searchParams.set("token", signPreviewToken({ tenant_id: caller.tenantId }, secret, STORE_ORDER_LINK_SECONDS));
    link.searchParams.set("to", store.pathname);
    return NextResponse.json({ success: true, data: { url: link.toString() } });
}

export const GET = withFailureReport("api/guide/store-order-link GET", handleGET);
