import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { env } from "@/lib/env";

/* ─────────────────────────────────────────────────────────────────── */
/* Field-level autosave PATCH endpoint                                  */
/* Writes now go through the apply_store_config_v2_patch atomic RPC.   */
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
 * verified inside the SECURITY DEFINER RPC (advisory-locked, atomic).
 *
 * The hook's full-config debounced autosave still runs as a safety net —
 * this endpoint is the fast path that keeps low-bandwidth (e.g. Iraqi 3G)
 * sessions responsive on a 50–100KB config.
 */

const bodySchema = z.object({
    tenant_id: z.string().uuid(),
    is_draft: z.boolean(),
    path: z.array(z.union([z.string(), z.number().int()])).min(1),
    value: z.unknown(),
});

/**
 * Immutable clone-and-set: returns a new root with the value at `path`
 * replaced. Intermediate objects/arrays are shallow-cloned along the
 * write path; siblings keep their original references. Creates
 * intermediates when missing (object if next key is a string, array if
 * next key is a number).
 *
 * Pure function — does not mutate the input root.
 *
 * NOTE: The route now applies patches via the `apply_store_config_v2_patch`
 * RPC (atomic, advisory-locked). `setByPath` is retained here for the
 * editor's optimistic in-memory updates and its associated tests.
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
    let raw: unknown;
    try {
        raw = await request.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
        return NextResponse.json({ error: "Bad payload" }, { status: 400 });
    }

    const { tenant_id, is_draft, path, value } = parsed.data;

    const supabase = await getServerSupabase();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase.rpc("apply_store_config_v2_patch", {
        p_tenant_id: tenant_id,
        p_is_draft: is_draft,
        p_path: path.map(String),
        p_value: (value ?? null) as never,
    });

    if (error) {
        const code = (error as { code?: string }).code;
        if (code === "42501") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        console.error("[patch] apply failed:", error);
        return NextResponse.json(
            { error: "Failed to apply patch" },
            { status: 500 },
        );
    }

    return NextResponse.json({ ok: true, applied: { path, value } });
}
