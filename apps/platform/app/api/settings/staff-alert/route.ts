import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient, verifyAccessToken } from "@/lib/supabase-server";
import { resolveActiveTenant } from "@/lib/auth/resolve-active-tenant";
import { normalizeIraqiPhone, STAFF_ALERT_SETTINGS_KEY, type StaffNumberEntry, type StaffAlertSettings } from "@/lib/staff-alerts";

export const dynamic = "force-dynamic";

function getDefault(): StaffAlertSettings {
    return { enabled: false, numbers: [] };
}

/**
 * Resolve the caller's tenant_id from the Authorization bearer token.
 * Returns { error: Response } if the token is missing/invalid; otherwise { tenantId }.
 */
async function resolveTenant(request: NextRequest): Promise<{ tenantId: string } | { error: NextResponse }> {
    const auth = request.headers.get("Authorization");
    const token = auth?.replace("Bearer ", "");
    if (!token) {
        return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    const { user, error } = await verifyAccessToken(token);
    if (error || !user) {
        return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    // current_tenant_id is accepted only while the caller is an active member
    // of it with an active profile (resolveActiveTenant; F-087).
    const active = await resolveActiveTenant(user.id);
    if (!active.ok) {
        return { error: NextResponse.json({ error: active.error }, { status: active.status }) };
    }
    return { tenantId: active.tenantId };
}

async function readSettings(tenantId: string): Promise<StaffAlertSettings> {
    const supabase = createSupabaseServiceClient();
    const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", STAFF_ALERT_SETTINGS_KEY)
        .eq("tenant_id", tenantId)
        .maybeSingle();

    const raw = data?.value as Partial<StaffAlertSettings> | undefined;
    return {
        enabled: raw?.enabled === true,
        numbers: Array.isArray(raw?.numbers) ? (raw!.numbers as StaffNumberEntry[]) : [],
    };
}

async function writeSettings(tenantId: string, value: StaffAlertSettings) {
    const supabase = createSupabaseServiceClient();
    const { error } = await supabase
        .from("app_settings")
        .upsert({
            key: STAFF_ALERT_SETTINGS_KEY,
            tenant_id: tenantId,
            value,
            updated_at: new Date().toISOString(),
        }, { onConflict: "key,tenant_id" });
    if (error) throw new Error(error.message);
}

export async function GET(request: NextRequest) {
    const r = await resolveTenant(request);
    if ("error" in r) return r.error;
    try {
        return NextResponse.json(await readSettings(r.tenantId));
    } catch {
        return NextResponse.json(getDefault());
    }
}

export async function PUT(request: NextRequest) {
    const r = await resolveTenant(request);
    if ("error" in r) return r.error;
    try {
        const body = await request.json();
        const next = await readSettings(r.tenantId);

        if (typeof body.enabled === "boolean") next.enabled = body.enabled;

        if (Array.isArray(body.numbers)) {
            const normalized: StaffNumberEntry[] = [];
            for (const entry of body.numbers) {
                const phone = String(entry?.phone || "");
                const norm = normalizeIraqiPhone(phone);
                if (!norm) {
                    return NextResponse.json({ error: `Invalid Iraqi phone: ${phone}` }, { status: 400 });
                }
                normalized.push({
                    phone: norm,
                    name: typeof entry?.name === "string" ? entry.name : undefined,
                    added_at: typeof entry?.added_at === "string" ? entry.added_at : new Date().toISOString(),
                });
            }
            const seen = new Set<string>();
            next.numbers = normalized.filter((n) => {
                if (seen.has(n.phone)) return false;
                seen.add(n.phone);
                return true;
            });
        }

        await writeSettings(r.tenantId, next);
        return NextResponse.json(next);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Internal error" },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    const r = await resolveTenant(request);
    if ("error" in r) return r.error;
    try {
        const body = await request.json();
        const phone = String(body?.phone || "");
        const norm = normalizeIraqiPhone(phone);
        if (!norm) return NextResponse.json({ error: `Invalid Iraqi phone: ${phone}` }, { status: 400 });

        const current = await readSettings(r.tenantId);
        if (current.numbers.some((n) => normalizeIraqiPhone(n.phone) === norm)) {
            return NextResponse.json(current);
        }

        current.numbers.push({
            phone: norm,
            name: typeof body?.name === "string" ? body.name : undefined,
            added_at: new Date().toISOString(),
        });
        await writeSettings(r.tenantId, current);
        return NextResponse.json(current);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Internal error" },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    const r = await resolveTenant(request);
    if ("error" in r) return r.error;
    try {
        const phone = new URL(request.url).searchParams.get("phone") || "";
        const norm = normalizeIraqiPhone(phone);
        if (!norm) return NextResponse.json({ error: "Invalid phone" }, { status: 400 });

        const current = await readSettings(r.tenantId);
        current.numbers = current.numbers.filter((n) => normalizeIraqiPhone(n.phone) !== norm);
        await writeSettings(r.tenantId, current);
        return NextResponse.json(current);
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Internal error" },
            { status: 500 },
        );
    }
}
