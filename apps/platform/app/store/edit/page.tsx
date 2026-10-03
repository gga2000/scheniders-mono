import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import { signPreviewToken } from "@scheniders/shared/preview-token";
import type { StoreConfigV2, PageId } from "@scheniders/shared";
import type {
    Product as SectionProduct,
    Category as SectionCategory,
} from "@scheniders/sections";
import { env } from "@/lib/env";
import { EditorShell } from "@/components/store-builder-v2/editor-shell";
import type { InspectorTab } from "@/components/store-builder-v2/inspector-rail";
import type { SettingsSectionId } from "@/components/store-builder-v2/page-tree";

/**
 * Settings screens reachable via a Command Center `?screen=` deep-link.
 * "health" is intentionally excluded — it's an inline inspector tab, not a
 * full-screen takeover, so it has no system_screen to open.
 */
const DEEP_LINK_SCREENS: readonly SettingsSectionId[] = [
    "brand_kit",
    "versions",
    "scheduled",
    "experiments",
    "segments",
    "i18n",
    "redirects",
];

/**
 * Inspector-rail tabs reachable via a `?tab=` deep-link (e.g. the Command
 * Center "SEO" tile). These are inline tabs alongside the canvas, not
 * full-screen `?screen=` takeovers.
 */
const DEEP_LINK_TABS: readonly InspectorTab[] = ["blocks", "style", "seo", "health"];

const PREVIEW_PRODUCTS_LIMIT = 24;

// 1-hour TTL for the editor's preview iframe. The editor session is
// kept fresh by re-minting on full reload — page navigations stay
// inside the iframe via postMessage and don't require a new token.
const PREVIEW_TOKEN_TTL_SECONDS = 60 * 60;

// Dev fallback so a developer running just the platform without
// `PREVIEW_TOKEN_SECRET` configured still gets a working preview.
// The storefront side accepts this exact string only when its own
// `PREVIEW_TOKEN_SECRET` is also unset and NODE_ENV !== "production".
const DEV_PREVIEW_TOKEN = "dev-preview-token";

interface TenantMemberRow {
    tenant_id: string;
    tenants: {
        id: string;
        slug: string;
        business_name: string;
        store_config_v2: StoreConfigV2 | null;
        store_config_v2_draft: StoreConfigV2 | null;
        updated_at: string | null;
        store_config_rev: number | null;
    } | null;
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
                    // No-op in a Server Component — Next disallows cookie writes here.
                },
            },
        },
    );
}

export default async function StoreV2Page({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const supabase = await getServerSupabase();

    // Command Center deep-links (?screen=/?page=/?section=) — open the editor
    // on the exact target the merchant clicked instead of the default state.
    const sp = await searchParams;
    const rawScreen = typeof sp.screen === "string" ? sp.screen : undefined;
    const initialSystemScreen =
        rawScreen && (DEEP_LINK_SCREENS as readonly string[]).includes(rawScreen)
            ? (rawScreen as SettingsSectionId)
            : undefined;
    const initialPageId =
        typeof sp.page === "string" ? (sp.page as PageId) : null;
    const initialSectionId =
        typeof sp.section === "string" ? sp.section : null;
    const rawTab = typeof sp.tab === "string" ? sp.tab : undefined;
    const initialInspectorTab =
        rawTab && (DEEP_LINK_TABS as readonly string[]).includes(rawTab)
            ? (rawTab as InspectorTab)
            : null;
    // Wizard handoff (?welcome=1): show the one-time Arabic welcome card.
    const initialWelcome = sp.welcome === "1";

    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: member } = await supabase
        .from("tenant_members")
        .select(
            "tenant_id, tenants(id, slug, business_name, store_config_v2, store_config_v2_draft, updated_at, store_config_rev)",
        )
        .eq("user_id", user.id)
        .single<TenantMemberRow>();

    if (!member?.tenants) redirect("/store");

    const t = member.tenants;
    const draft = t.store_config_v2_draft;
    const published = t.store_config_v2;

    const initialConfig: StoreConfigV2 = draft ?? published ?? emptyStoreConfigV2();
    const hasPublished = !!published;
    // If we started from a draft, the editor begins in a dirty state so Publish enables.
    const initiallyDirty = !!draft;
    // EC33: the DB row's last-write time, so the editor can reject a stale local
    // crash backup that predates newer saved/published work (e.g. another device).
    const initialUpdatedAt = t.updated_at ? Date.parse(t.updated_at) : null;
    // BUG25: the published "generation" counter at hydration — publish rejects
    // if the live rev has moved on (another editor published in the meantime).
    const initialRev = t.store_config_rev ?? 0;

    // Mint the preview token server-side. The client never sees the
    // secret — only the resulting short-lived token.
    const previewSecret = process.env.PREVIEW_TOKEN_SECRET;
    const previewToken = previewSecret
        ? signPreviewToken({ tenant_id: t.id }, previewSecret, PREVIEW_TOKEN_TTL_SECONDS)
        : DEV_PREVIEW_TOKEN;

    // Fetch real products + categories so the inline LivePreview renders
    // actual content (not placeholder grids). Failures degrade to empty
    // arrays — sections render their own empty states.
    const [productsRes, categoriesRes] = await Promise.all([
        supabase
            .from("products")
            .select(
                "id, tenant_id, name, slug, description, short_description, price, website_price, compare_at_price, image_url, stock_quantity, reserved_quantity, sku, is_archived, is_visible, display_order, category_id, created_at",
            )
            .eq("tenant_id", t.id)
            .eq("is_visible", true)
            .eq("is_archived", false)
            .order("display_order", { ascending: true })
            .limit(PREVIEW_PRODUCTS_LIMIT),
        supabase
            .from("categories")
            .select(
                "id, tenant_id, name, slug, description, image_url, parent_id, display_order",
            )
            .eq("tenant_id", t.id)
            .eq("is_visible", true)
            .order("display_order", { ascending: true }),
    ]);

    const previewProducts = (productsRes.data ?? []) as unknown as SectionProduct[];
    const previewCategories = (categoriesRes.data ?? []) as unknown as SectionCategory[];

    return (
        <EditorShell
            tenant={{
                id: t.id,
                slug: t.slug,
                business_name: t.business_name,
            }}
            initialConfig={initialConfig}
            publishedConfig={published ?? null}
            hasPublished={hasPublished}
            initiallyDirty={initiallyDirty}
            initialUpdatedAt={initialUpdatedAt}
            initialRev={initialRev}
            previewToken={previewToken}
            previewProducts={previewProducts}
            previewCategories={previewCategories}
            initialSystemScreen={initialSystemScreen}
            initialPageId={initialPageId}
            initialWelcome={initialWelcome}
            initialSectionId={initialSectionId}
            initialInspectorTab={initialInspectorTab}
        />
    );
}
