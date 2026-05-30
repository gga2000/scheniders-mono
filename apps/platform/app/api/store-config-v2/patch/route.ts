import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

/* ─────────────────────────────────────────────────────────────────── */
/* Field-level autosave PATCH endpoint                                  */
/* ─────────────────────────────────────────────────────────────────── */
/*
 * POST /api/store-config-v2/patch
 *
 * Body:
 *   {
 *     tenant_id: string,
 *     is_draft: boolean,
 *     path: (string | number)[],
 *     value: unknown
 *   }
 *
 * Applies a single field-level patch to a tenant's store_config_v2_draft
 * (or store_config_v2 when is_draft=false). Auth + tenant membership are
 * verified against the RLS-protected `tenant_members` table.
 *
 * The hook's full-config debounced autosave still runs as a safety net —
 * this endpoint is the fast path that keeps low-bandwidth (e.g. Iraqi 3G)
 * sessions responsive on a 50–100KB config.
 */

interface PatchBody {
    tenant_id: string;
    is_draft: boolean;
    path: (string | number)[];
    value: unknown;
}

/**
 * Immutable clone-and-set: returns a new root with the value at `path`
 * replaced. Intermediate objects/arrays are shallow-cloned along the
 * write path; siblings keep their original references. Creates
 * intermediates when missing (object if next key is a string, array if
 * next key is a number).
 *
 * Pure function — does not mutate the input root.
 */
export function setByPath(
    root: unknown,
    path: (string | number)[],
    value: unknown,
): unknown {
    if (path.length === 0) return value;

    const cloneContainer = (
        val: unknown,
        nextKey: string | number,
    ): Record<string, unknown> | unknown[] => {
        if (typeof nextKey === "number") {
            return Array.isArray(val) ? val.slice() : [];
        }
        if (val && typeof val === "object" && !Array.isArray(val)) {
            return { ...(val as Record<string, unknown>) };
        }
        return {};
    };

    const nextRoot = cloneContainer(root, path[0]);
    let cur: Record<string, unknown> | unknown[] = nextRoot;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        const nextKey = path[i + 1];
        const child = (cur as Record<string | number, unknown>)[key as never];
        const cloned = cloneContainer(child, nextKey);
        (cur as Record<string | number, unknown>)[key as never] = cloned;
        cur = cloned;
    }
    (cur as Record<string | number, unknown>)[path[path.length - 1] as never] =
        value;
    return nextRoot;
}

function isValidPath(p: unknown): p is (string | number)[] {
    if (!Array.isArray(p)) return false;
    if (p.length === 0) return false;
    for (const seg of p) {
        if (typeof seg !== "string" && typeof seg !== "number") return false;
        if (typeof seg === "number" && !Number.isInteger(seg)) return false;
    }
    return true;
}

async function getServerSupabase() {
    const cookieStore = await cookies();
    return createServerClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll() {
                    // Route handlers can write cookies, but the SSR
                    // client only needs reads for auth here.
                },
            },
        },
    );
}

export async function POST(request: Request): Promise<NextResponse> {
    let body: PatchBody;
    try {
        body = (await request.json()) as PatchBody;
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (
        !body ||
        typeof body.tenant_id !== "string" ||
        body.tenant_id.length === 0 ||
        typeof body.is_draft !== "boolean" ||
        !isValidPath(body.path)
    ) {
        return NextResponse.json(
            { error: "Bad payload: tenant_id, is_draft, path required" },
            { status: 400 },
        );
    }

    const supabase = await getServerSupabase();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Membership check — RLS would also block, but a 403 is friendlier
    // than a 404/empty-row leak.
    const { data: member, error: memberErr } = await supabase
        .from("tenant_members")
        .select("tenant_id")
        .eq("tenant_id", body.tenant_id)
        .eq("user_id", user.id)
        .maybeSingle();
    if (memberErr || !member) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const column = body.is_draft ? "store_config_v2_draft" : "store_config_v2";

    const { data: tenant, error: fetchErr } = await supabase
        .from("tenants")
        .select(`id, ${column}`)
        .eq("id", body.tenant_id)
        .maybeSingle();
    if (fetchErr || !tenant) {
        return NextResponse.json({ error: "Tenant not found" }, { status: 422 });
    }

    const current =
        (tenant as Record<string, unknown>)[column] ??
        (typeof body.path[0] === "number" ? [] : {});
    const next = setByPath(current, body.path, body.value);

    const { error: updateErr } = await supabase
        .from("tenants")
        .update({
            [column]: next,
            updated_at: new Date().toISOString(),
        })
        .eq("id", body.tenant_id);
    if (updateErr) {
        return NextResponse.json(
            { error: "Failed to apply patch" },
            { status: 500 },
        );
    }

    return NextResponse.json({
        ok: true,
        applied: { path: body.path, value: body.value },
    });
}
