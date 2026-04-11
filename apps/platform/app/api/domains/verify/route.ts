import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import dns from "dns/promises";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const { domain_id } = await request.json();

        if (!domain_id) {
            return NextResponse.json({ error: "domain_id is required" }, { status: 400 });
        }

        // Fetch the domain record
        const { data: domain, error: fetchError } = await supabaseAdmin
            .from("tenant_domains")
            .select("*")
            .eq("id", domain_id)
            .single();

        if (fetchError || !domain) {
            return NextResponse.json({ error: "Domain not found" }, { status: 404 });
        }

        // DNS CNAME lookup
        let verified = false;
        try {
            const records = await dns.resolveCname(domain.domain);
            verified = records.some(
                (record: string) =>
                    record.toLowerCase().includes("scheniders.com") ||
                    record.toLowerCase().includes("vercel")
            );
        } catch {
            // DNS lookup failed — not yet propagated
            verified = false;
        }

        if (verified) {
            await supabaseAdmin
                .from("tenant_domains")
                .update({
                    verified: true,
                    verified_at: new Date().toISOString(),
                })
                .eq("id", domain_id);

            return NextResponse.json({ verified: true });
        }

        return NextResponse.json(
            {
                verified: false,
                error: "CNAME record not found. DNS changes can take up to 48 hours to propagate.",
            },
            { status: 200 }
        );
    } catch {
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
