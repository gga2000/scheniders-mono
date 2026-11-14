import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireRequestCaller } from "@/lib/auth/require-request-caller";
import { normalizeIraqiPhone, STAFF_ALERT_SETTINGS_KEY, type StaffNumberEntry, type StaffAlertSettings } from "@/lib/staff-alerts";
import { withFailureReport } from "@/lib/job-monitor";

export const dynamic = "force-dynamic";

function getDefault(): StaffAlertSettings {
    return { enabled: false, numbers: [] };
}

/**
 * Any active member may read the list; only a store admin may change it. The
 * write goes through the service role, so this check is the only thing
 * standing in for the admin-only RLS policy on app_settings.
 */
async function resolveTenant(
    request: NextRequest,
    mode: "member" | "tenant-admin",
): Promise<{ tenantId: string } | { error: NextResponse }> {
    const caller = await requireRequestCaller(request, mode);
    if (!caller.ok) return { error: caller.response };
    return { tenantId: caller.tenantId };
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

async function handleGET(request: NextRequest) {
    const r = await resolveTenant(request, "member");
    if ("error" in r) return r.error;
    try {
        return NextResponse.json(await readSettings(r.tenantId));
    } catch {
        return NextResponse.json(getDefault());
    }
}

async function handlePUT(request: NextRequest) {
    const r = await resolveTenant(request, "tenant-admin");
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

async function handlePOST(request: NextRequest) {
    const r = await resolveTenant(request, "tenant-admin");
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

async function handleDELETE(request: NextRequest) {
    const r = await resolveTenant(request, "tenant-admin");
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

export const GET = withFailureReport("api/settings/staff-alert GET", handleGET);
export const PUT = withFailureReport("api/settings/staff-alert PUT", handlePUT);
export const POST = withFailureReport("api/settings/staff-alert POST", handlePOST);
export const DELETE = withFailureReport("api/settings/staff-alert DELETE", handleDELETE);
