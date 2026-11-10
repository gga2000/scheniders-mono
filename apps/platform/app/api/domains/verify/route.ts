import { NextResponse } from "next/server";
import dns from "dns/promises";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { domainTxtName, isAcceptedApexIp, isAcceptedCnameTarget, txtRecordsProve } from "@/lib/custom-domain";
import { DomainConflictError, provisionCustomDomain, type DomainSsl } from "@/lib/vercel-domains";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ domain_id: z.string().uuid() });

/** DNS says "no such record yet" with these codes; anything else is a resolver failure, not an answer. */
const NO_RECORD_CODES = new Set(["ENODATA", "ENOTFOUND", "NXDOMAIN"]);

/**
 * POST /api/domains/verify  Body: { domain_id }   (tenant admin)
 *
 * Marks the caller's own custom domain verified once the store proves it owns
 * it (TXT `_scheniders.<domain>` = this row's token) and its CNAME (or, on an
 * apex, its A record) points at Scheniders. The DNS pointer alone would let
 * one store claim a domain another store pointed at us. The tenant comes from the caller's session, never the request, so
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
        .select("id, domain, verified, verification_token")
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

    const owned = await ownershipProved(domain.domain, domain.verification_token);
    if (owned === "dns_error") {
        return NextResponse.json({ error: "DNS lookup failed. Try again in a minute." }, { status: 502 });
    }
    if (!owned) {
        return NextResponse.json({
            verified: false,
            reason: "txt_missing",
            error: "TXT record not found. Add the TXT record shown, then try again; DNS can take up to 48 hours.",
        });
    }

    const routed = await pointsAtScheniders(domain.domain);
    if (routed === "dns_error") {
        return NextResponse.json({ error: "DNS lookup failed. Try again in a minute." }, { status: 502 });
    }
    if (routed === "missing") {
        return NextResponse.json({
            verified: false,
            error: "CNAME / A record not found. DNS changes can take up to 48 hours to propagate.",
        });
    }
    if (routed === "elsewhere") {
        return NextResponse.json({
            verified: false,
            error: "The domain's DNS record does not point to Scheniders yet.",
        });
    }

    // Another store may hold an unverified claim on the same name; only one store
    // can own it once verified (partial unique index on verified domains).
    const { count: takenBy, error: takenError } = await supabase
        .from("tenant_domains")
        .select("id", { count: "exact", head: true })
        .eq("domain", domain.domain)
        .eq("verified", true)
        .neq("tenant_id", caller.tenantId);
    if (takenError) {
        console.error("[domains/verify] ownership check failed:", takenError);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    if (takenBy) {
        return NextResponse.json({
            verified: false,
            error: "This domain is already connected to another store.",
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

/** The TXT ownership proof: true, false (no matching record yet), or a resolver failure. */
async function ownershipProved(domain: string, token: string): Promise<boolean | "dns_error"> {
    try {
        return txtRecordsProve(await dns.resolveTxt(domainTxtName(domain)), token);
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code && NO_RECORD_CODES.has(code)) return false;
        console.error("[domains/verify] TXT lookup failed:", err);
        return "dns_error";
    }
}

/**
 * Whether the domain's DNS sends shoppers to Scheniders: a CNAME into Vercel's
 * DNS (subdomains), or, where there is no CNAME, an A record on a Vercel IP
 * (an apex cannot hold a CNAME, so a CNAME-only check never let one verify).
 */
async function pointsAtScheniders(domain: string): Promise<"ok" | "missing" | "elsewhere" | "dns_error"> {
    const cnames = await lookup(() => dns.resolveCname(domain));
    if (cnames === "dns_error") return "dns_error";
    if (cnames.length > 0) return cnames.some(isAcceptedCnameTarget) ? "ok" : "elsewhere";

    const ips = await lookup(() => dns.resolve4(domain));
    if (ips === "dns_error") return "dns_error";
    if (ips.length === 0) return "missing";
    return ips.some(isAcceptedApexIp) ? "ok" : "elsewhere";
}

/** A DNS answer, `[]` when the name has no such record yet, or a resolver failure. */
async function lookup(query: () => Promise<string[]>): Promise<string[] | "dns_error"> {
    try {
        return await query();
    } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code && NO_RECORD_CODES.has(code)) return [];
        console.error("[domains/verify] DNS lookup failed:", err);
        return "dns_error";
    }
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
