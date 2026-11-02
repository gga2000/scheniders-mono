import { NextResponse } from "next/server";
import dns from "dns/promises";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { isAcceptedCnameTarget } from "@/lib/custom-domain";
import { DomainConflictError, provisionCustomDomain, type DomainSsl } from "@/lib/vercel-domains";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ domain_id: z.string().uuid() });

/** DNS says "no such record yet" with these codes; anything else is a resolver failure, not an answer. */
const NO_RECORD_CODES = new Set(["ENODATA", "ENOTFOUND", "NXDOMAIN"]);

/**
 * POST /api/domains/verify  Body: { domain_id }   (tenant admin)
 *
 * Marks the caller's own custom domain verified once its CNAME points at
 * Scheniders. The tenant comes from the caller's session, never the request, so
 * one tenant cannot probe or verify another tenant's domain ids.
 */
export async function POST(request: Request): Promise<NextResponse> {
    const caller = await requireRequestCaller(request, "tenant-admin");
    if (!caller.ok) return caller.response;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
        return NextResponse.json({ error: "domain_id is required" }, { status: 400 });
    }
    const { domain_id } = parsed.data;

    const supabase = createSupabaseServiceClient();
    const { data: domain, error: fetchError } = await supabase
        .from("tenant_domains")
        .select("id, domain, verified")
        .eq("id", domain_id)
        .eq("tenant_id", caller.tenantId)
        .maybeSingle();
    if (fetchError) {
        console.error("[domains/verify] lookup failed:", fetchError);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    if (!domain) {
        return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }
    if (domain.verified) {
        return NextResponse.json({ verified: true });
    }

    let records: string[];
    try {
        records = await dns.resolveCname(domain.domain);
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code && NO_RECORD_CODES.has(code)) {
            return NextResponse.json({
                verified: false,
                error: "CNAME record not found. DNS changes can take up to 48 hours to propagate.",
            });
        }
        console.error("[domains/verify] DNS lookup failed:", err);
        return NextResponse.json(
            { error: "DNS lookup failed. Try again in a minute." },
            { status: 502 },
        );
    }

    if (!records.some(isAcceptedCnameTarget)) {
        return NextResponse.json({
            verified: false,
            error: "CNAME record found, but it does not point to Scheniders.",
        });
    }

    // Route the domain to the storefront before telling the shopper it works.
    const ssl = await provision(domain.domain);
    if (!ssl.ok && ssl.conflict) {
        return NextResponse.json({
            verified: false,
            error: "This domain is already connected to another store.",
        });
    }
    // Not marked verified while routing failed: the merchant retries, instead of
    // holding a "verified" domain that was never added to the storefront.
    if (!ssl.ok) {
        return NextResponse.json({ error: "Could not connect the domain. Try again in a minute." }, { status: 502 });
    }

    const { error: updateError } = await supabase
        .from("tenant_domains")
        .update({ verified: true, verified_at: new Date().toISOString() })
        .eq("id", domain.id)
        .eq("tenant_id", caller.tenantId);
    if (updateError) {
        console.error("[domains/verify] update failed:", updateError);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    return NextResponse.json({ verified: true, ssl: ssl.state });
}

type Provisioned = { ok: true; state: DomainSsl } | { ok: false; conflict: boolean };

/** Provisioning outcome as data: a conflict and an outage are told apart, neither throws past here. */
async function provision(domain: string): Promise<Provisioned> {
    try {
        return { ok: true, state: await provisionCustomDomain(domain) };
    } catch (err) {
        if (err instanceof DomainConflictError) return { ok: false, conflict: true };
        console.error("[domains/verify] Vercel provisioning failed:", err);
        return { ok: false, conflict: false };
    }
}
