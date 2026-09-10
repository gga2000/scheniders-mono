import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { env } from "@/lib/env";

/* ─────────────────────────────────────────────────────────────────── */
/* Onboarding seed endpoint                                              */
/* ─────────────────────────────────────────────────────────────────── */
/*
 * POST /api/store-config-v2/seed
 *
 * Body: { tenant_id: string, config: StoreConfigV2 }
 *
 * Writes a full v2 config to `store_config_v2_draft` via the
 * `seed_store_config_v2_draft` SECURITY DEFINER RPC. The RPC verifies
 * tenant membership and only seeds when the store is genuinely fresh
 * (both published + draft are NULL), so a returning merchant can never
 * clobber an existing store by re-opening the wizard.
 *
 * The config is produced by our own `buildStarterStoreConfigV2` seeder
 * from code-defined templates; here we structurally validate the
 * envelope (object, schema_version=2, bounded size) before handing it
 * to the RPC, which re-checks schema_version as a second gate.
 */

// ~512KB cap, matching the patch endpoint. A seeded starter config is a
// few KB; this only guards against an abusive authenticated client.
const MAX_CONFIG_BYTES = 524_288;

const i18n = z.record(z.string(), z.string());
const categorySchema = z.object({
    slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
    name: z.string().min(1).max(120),
    name_ar: z.string().max(120).nullable().optional(),
    name_en: z.string().max(120).nullable().optional(),
    display_order: z.number().int().min(0).max(999),
});
const attributeSchema = z.object({
    key: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/),
    name_i18n: i18n,
    kind: z.enum(["enum", "range", "group_list", "text", "boolean"]),
    options: z.array(z.object({ value: z.string().min(1), label_i18n: i18n })).optional(),
    group_keys: z.array(z.object({ key: z.string().min(1), label_i18n: i18n })).optional(),
    range_min: z.number().optional(),
    range_max: z.number().optional(),
    unit_i18n: i18n.optional(),
    is_filterable: z.boolean().optional(),
    is_comparable: z.boolean().optional(),
    display_order: z.number().int().optional(),
});
const bodySchema = z.object({
    tenant_id: z.string().uuid(),
    config: z
        .object({ schema_version: z.literal(2) })
        .passthrough(),
    /** Starter taxonomy from the content pack — only written on a fresh seed. */
    categories: z.array(categorySchema).max(40).optional(),
    attribute_defs: z.array(attributeSchema).max(40).optional(),
});

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
                    // Reads only — auth verification, no cookie writes here.
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

    const { tenant_id, config, categories, attribute_defs } = parsed.data;

    let configBytes: number;
    try {
        configBytes = Buffer.byteLength(JSON.stringify(config), "utf8");
    } catch {
        return NextResponse.json({ error: "Unserializable config" }, { status: 400 });
    }
    if (configBytes > MAX_CONFIG_BYTES) {
        return NextResponse.json({ error: "Config too large" }, { status: 400 });
    }

    const supabase = await getServerSupabase();

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("seed_store_config_v2_draft", {
        p_tenant_id: tenant_id,
        p_config: config as never,
    });

    if (error) {
        const code = (error as { code?: string }).code;
        if (code === "42501") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (code === "22023") {
            return NextResponse.json({ error: "Invalid config" }, { status: 400 });
        }
        console.error("[seed] apply failed:", error);
        return NextResponse.json({ error: "Failed to seed store" }, { status: 500 });
    }

    // `data` is the RPC's boolean: true = seeded, false = store already existed.
    const seeded = data === true;

    // Starter taxonomy rides along only with a genuine first seed, under the
    // member's own RLS (categories / product_attribute_defs are tenant-
    // isolated). Best-effort: a failure here leaves a valid store without
    // starter rows, which the merchant can add — never a failed onboarding.
    const taxonomy = { categories: 0, attribute_defs: 0 };
    if (seeded) {
        if (categories?.length) {
            const { error: catErr, data: rows } = await supabase
                .from("categories")
                .insert(categories.map((c) => ({ ...c, tenant_id, is_visible: true })))
                .select("id");
            if (catErr) console.error("[seed] categories failed:", catErr);
            else taxonomy.categories = rows?.length ?? 0;
        }
        if (attribute_defs?.length) {
            const { error: attrErr, data: rows } = await supabase
                .from("product_attribute_defs")
                .insert(attribute_defs.map((a) => ({ ...a, tenant_id })) as never)
                .select("id");
            if (attrErr) console.error("[seed] attribute defs failed:", attrErr);
            else taxonomy.attribute_defs = rows?.length ?? 0;
        }
    }
    return NextResponse.json({ ok: true, seeded, taxonomy });
}
