// =====================================================================
// /_preview/[tenant]/[page_id]
// =====================================================================
// Editor preview route. Loaded by the platform's store-builder-v2 iframe
// (see `apps/platform/components/store-builder-v2/preview-frame.tsx`).
//
// URL shape:
//   /_preview/{tenant.slug}/{page_id}
//     ?token=dev-preview-token
//     &page={page_id}            (alias of path segment — path wins)
//     &breakpoint=mobile|tablet|desktop
//     &locale=ar|en|ku
//     &governorate=...           (optional)
//     &product_slug=...          (when page_id=product)
//     &category_slug=...         (when page_id=category)
//     &order=...                 (when page_id=checkout_success)
//
// Behavior:
//   1. Validates the preview token (hardcoded `dev-preview-token` for
//      now). Returns 401 page on mismatch.
//      TODO(prod): replace with a short-lived JWT signed with a server
//      secret, scoped to a specific `tenant_id`. Verify via a shared
//      helper from `@scheniders/shared`.
//   2. Resolves the tenant (subdomain slug OR `__domain__<host>` prefix).
//   3. Reads `tenant.store_config_v2_draft ?? tenant.store_config_v2`.
//      Falls back to the legacy template for `page=home` if neither is
//      present (with an inline banner). Other pages show a placeholder.
//   4. Builds a `RuntimeContext` from search params and renders the
//      v2 page via `<RenderPage />`.
//   5. Mounts the click-to-edit bridge unconditionally — the bridge
//      itself no-ops when `window.parent === window` so direct visits
//      still work for smoke testing.
// =====================================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  EMPTY_BRAND_KIT,
  buildBrandKitFontsUrl,
  buildBrandKitVars,
} from "@scheniders/shared";
import { verifyPreviewToken } from "@scheniders/shared/preview-token";
import type {
  BrandKit,
  Breakpoint,
  GovernorateCode,
  LocaleCode,
  PageConfig,
  PageId,
  RuntimeContext,
  StoreConfigV2,
} from "@scheniders/shared";
import { getTenantForPreview, getTenantByCustomDomainForPreview } from "@/lib/tenant";
import {
  listProducts,
  listCategories,
  getProductBySlug,
  getCategoryBySlug,
  listCategoryProductIds,
  getTenantPublicStats,
  getMaxDiscountPercent,
} from "@/lib/queries";
import { StoreBaseProvider } from "@/lib/store-context";
// Import from the barrel (not RenderSection directly) so the section
// registry's side-effect registrations execute on this route.
// (We render via SchneidersPreviewLiveRenderer, which uses RenderSection
// internally and supports postMessage updates from the editor; the
// barrel import below also runs the side-effect registry registrations.)
import { toSectionTenant } from "@scheniders/sections"; // also registers all built-in sections (barrel side effect)
import { SchneidersPreviewBridge } from "@/components/schneiders-preview-bridge";
import { SchneidersPreviewLiveRenderer } from "@/components/schneiders-preview-live-renderer";
import { getTemplate } from "@/templates/registry";
import type { Tenant, Product, Category } from "@/lib/types";

/* ─────────────────────────────────────────────────────────────────── */
/* Constants                                                            */
/* ─────────────────────────────────────────────────────────────────── */

// Dev-only fallback token. In production the route requires a real
// HMAC-signed token minted by the platform editor using the same
// `PREVIEW_TOKEN_SECRET`. We keep this constant so a local-dev flow
// (running the storefront without the platform) continues to work
// when `PREVIEW_TOKEN_SECRET` is unset.
const DEV_PREVIEW_TOKEN = "dev-preview-token";

const VALID_PAGE_IDS = new Set<PageId>([
  "home",
  "category",
  "product",
  "search",
  "cart",
  "checkout",
  "checkout_success",
  "track",
  "about",
  "faq",
  "contact",
  "policy_shipping",
  "policy_returns",
  "policy_privacy",
  "policy_terms",
  "not_found",
]);

const VALID_BREAKPOINTS = new Set<Breakpoint>(["mobile", "tablet", "desktop"]);
const VALID_LOCALES = new Set<LocaleCode>(["ar", "en", "ku"]);

/* ─────────────────────────────────────────────────────────────────── */
/* Param helpers                                                        */
/* ─────────────────────────────────────────────────────────────────── */

function asPageId(v: string | undefined, fallback: PageId): PageId {
  return v && VALID_PAGE_IDS.has(v as PageId) ? (v as PageId) : fallback;
}

function asBreakpoint(v: string | undefined): Breakpoint {
  return v && VALID_BREAKPOINTS.has(v as Breakpoint)
    ? (v as Breakpoint)
    : "mobile";
}

function asLocale(v: string | undefined): LocaleCode {
  return v && VALID_LOCALES.has(v as LocaleCode) ? (v as LocaleCode) : "en";
}

function firstParam(
  v: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

async function resolveTenant(tenantParam: string): Promise<Tenant | null> {
  if (tenantParam.startsWith("__domain__")) {
    return getTenantByCustomDomainForPreview(tenantParam.replace("__domain__", ""));
  }
  // Use the draft-inclusive loader so the editor can render unpublished changes.
  return getTenantForPreview(tenantParam);
}

/* ─────────────────────────────────────────────────────────────────── */
/* 401 page                                                             */
/* ─────────────────────────────────────────────────────────────────── */

function UnauthorizedPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f4f4f5",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", padding: "1.5rem", maxWidth: 360 }}>
        <h1
          style={{
            margin: 0,
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "#18181b",
          }}
        >
          Unauthorized
        </h1>
        <p
          style={{
            marginTop: "0.5rem",
            color: "#52525b",
            fontSize: "0.875rem",
          }}
        >
          A valid preview token is required to view this page.
        </p>
      </div>
    </main>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Placeholder when no v2 config exists                                 */
/* ─────────────────────────────────────────────────────────────────── */

function NoV2Placeholder({
  pageId,
  reason,
}: {
  pageId: PageId;
  reason: string;
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fafaf9",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "2rem",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        <h1
          style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: 700,
            color: "#27272a",
          }}
        >
          No v2 config for “{pageId}”
        </h1>
        <p
          style={{
            marginTop: "0.5rem",
            color: "#71717a",
            fontSize: "0.875rem",
            lineHeight: 1.5,
          }}
        >
          {reason}
        </p>
      </div>
    </main>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Legacy fallback banner                                               */
/* ─────────────────────────────────────────────────────────────────── */

function LegacyFallbackBanner() {
  return (
    <div
      style={{
        background: "#fef3c7",
        color: "#78350f",
        padding: "0.5rem 1rem",
        fontSize: "0.8125rem",
        textAlign: "center",
        fontFamily: "system-ui, sans-serif",
        borderBottom: "1px solid #fde68a",
      }}
    >
      This tenant hasn’t migrated to v2 yet — preview is showing the legacy
      template via fallback.
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Route                                                                */
/* ─────────────────────────────────────────────────────────────────── */

interface PreviewParams {
  tenant: string;
  page_id: string;
}

interface PreviewSearchParams {
  token?: string | string[];
  page?: string | string[];
  breakpoint?: string | string[];
  locale?: string | string[];
  governorate?: string | string[];
  product_slug?: string | string[];
  category_slug?: string | string[];
  order?: string | string[];
}

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<PreviewParams>;
  searchParams: Promise<PreviewSearchParams>;
}) {
  const { tenant: tenantParam, page_id: pageIdParam } = await params;
  const sp = await searchParams;

  /* ───── Tenant resolution ───── */
  //
  // We resolve the tenant BEFORE the token check so the signed token's
  // `tenant_id` claim can be compared against the resolved tenant.id.
  // Tenant resolution itself doesn't leak data — it only returns a row
  // from the public.tenants table — and matching the token to the URL
  // tenant is what closes the IDOR hole.
  const tenant = await resolveTenant(tenantParam);
  if (!tenant) notFound();

  /* ───── Token gate ───── */
  //
  // Production path: verify an HMAC-signed token using
  // `PREVIEW_TOKEN_SECRET`. The token's `tenant_id` claim MUST match the
  // resolved tenant — otherwise a token minted for tenant A would let
  // the holder preview tenant B's draft config.
  //
  // Dev fallback: if `PREVIEW_TOKEN_SECRET` is unset AND we're not in
  // production, accept the literal `dev-preview-token` so the local-dev
  // storefront keeps working without the platform running.
  const token = firstParam(sp.token);
  const secret = process.env.PREVIEW_TOKEN_SECRET;
  const isProd = process.env.NODE_ENV === "production";
  if (!token) {
    return <UnauthorizedPage />;
  }
  if (secret) {
    const result = verifyPreviewToken(token, secret);
    if (!result.ok || result.payload.tenant_id !== tenant.id) {
      return <UnauthorizedPage />;
    }
  } else {
    // No secret configured.
    if (isProd) {
      // Fail closed.
      return <UnauthorizedPage />;
    }
    if (token !== DEV_PREVIEW_TOKEN) {
      return <UnauthorizedPage />;
    }
  }

  /* ───── Param parsing ───── */

  // Path segment is the source of truth; ?page= is supported as an alias
  // so the platform can construct a single URL pattern.
  const queryPage = firstParam(sp.page);
  const pageId: PageId = asPageId(pageIdParam, asPageId(queryPage, "home"));
  const breakpoint: Breakpoint = asBreakpoint(firstParam(sp.breakpoint));
  const locale: LocaleCode = asLocale(firstParam(sp.locale));
  const governorate = firstParam(sp.governorate) as
    | GovernorateCode
    | undefined;
  const productSlug = firstParam(sp.product_slug);
  const categorySlug = firstParam(sp.category_slug);

  /* ───── Config + fallback resolution ───── */

  const v2: StoreConfigV2 | null =
    tenant.store_config_v2_draft ?? tenant.store_config_v2 ?? null;

  /* ───── Page-specific data loading ───── */

  let product: Product | undefined;
  let category: Category | undefined;
  let products: Product[] = [];
  const categories: Category[] = await listCategories(tenant.id);
  const [categoryProductIds, publicStats, maxDiscountPct] = await Promise.all([
    listCategoryProductIds(tenant.id),
    getTenantPublicStats(tenant.id),
    getMaxDiscountPercent(tenant.id),
  ]);

  switch (pageId) {
    case "product": {
      if (productSlug) {
        const p = await getProductBySlug(tenant.id, productSlug);
        if (p) product = p;
      }
      if (!product) {
        // Fall back to first available product so editor sees something.
        const list = await listProducts(tenant.id, { limit: 1 });
        if (list.length) product = list[0];
      }
      products = product ? [product] : [];
      break;
    }
    case "category": {
      if (categorySlug) {
        const c = await getCategoryBySlug(tenant.id, categorySlug);
        if (c) category = c;
      }
      products = await listProducts(tenant.id, {
        limit: 24,
        categoryId: category?.id,
      });
      break;
    }
    case "home":
    case "search":
      products = await listProducts(tenant.id, { limit: 24 });
      break;
    default:
      products = [];
      break;
  }

  /* ───── Runtime context ───── */

  const runtime: RuntimeContext = {
    page_id: pageId,
    breakpoint,
    locale,
    audience_segments: [], // TODO: full segment evaluation
    ab_test_arms: {},
    governorate,
    product_id: product?.id,
    category_id: category?.id,
    now: new Date(),
  };

  /* ───── Brand kit + CSS vars ───── */

  const brandKit: BrandKit = v2?.brand_kit ?? EMPTY_BRAND_KIT;
  // Locale-aware: previewing in ar/ku applies the Arabic font pairing.
  const bkVars = buildBrandKitVars(brandKit, { locale });
  const bkFontsUrl = buildBrandKitFontsUrl(brandKit);
  const bkMotion: "auto" | "reduce" =
    brandKit.motion?.enabled === false ? "reduce" : "auto";

  /* ───── Legacy fallback path ───── */

  if (!v2) {
    if (pageId === "home" && tenant.store_config?.template) {
      const LegacyTemplate = getTemplate(tenant.store_config.template);
      return (
        <StoreBaseProvider base={`/_preview/${tenantParam}`}>
          <LegacyFallbackBanner />
          {bkFontsUrl && (
             
            <link rel="stylesheet" href={bkFontsUrl} />
          )}
          <div
            data-preview="true"
            data-bk-motion={bkMotion}
            style={bkVars}
          >
            <LegacyTemplate
              tenant={tenant}
              products={products}
              categories={categories}
            />
          </div>
          <SchneidersPreviewBridge />
        </StoreBaseProvider>
      );
    }
    return (
      <>
        <NoV2Placeholder
          pageId={pageId}
          reason="This tenant has no v2 builder config and no legacy template fallback is available for this page."
        />
        <SchneidersPreviewBridge />
      </>
    );
  }

  /* ───── v2 render path ───── */

  const pageConfig: PageConfig | undefined = v2.pages.find(
    (p) => p.page_id === pageId,
  );

  if (!pageConfig) {
    return (
      <>
        <NoV2Placeholder
          pageId={pageId}
          reason="This page is not present in the tenant’s v2 config."
        />
        <SchneidersPreviewBridge />
      </>
    );
  }

  return (
    <StoreBaseProvider base={`/_preview/${tenantParam}`}>
      {bkFontsUrl && (
         
        <link rel="stylesheet" href={bkFontsUrl} />
      )}
      <div
        data-preview="true"
        data-bk-motion={bkMotion}
        data-tenant-slug={tenant.slug}
        data-page-id={pageId}
        data-breakpoint={breakpoint}
        data-locale={locale}
        style={bkVars}
      >
        <SchneidersPreviewLiveRenderer
          initialPageConfig={pageConfig}
          initialRuntime={runtime}
          renderCtx={{
            // Pruned: the live renderer is a client component, so this
            // whole object is serialised into the page. Sections read only
            // the fields `toSectionTenant` keeps.
            tenant: toSectionTenant(tenant),
            products,
            categories,
            product,
            category,
            category_product_ids: categoryProductIds,
            max_discount_percent: maxDiscountPct ?? undefined,
            public_stats: publicStats ?? undefined,
          }}
        />
      </div>
      <SchneidersPreviewBridge />
    </StoreBaseProvider>
  );
}

export const dynamic = "force-dynamic";

// Draft editor preview — must never be indexed even if a short-lived token
// leaks into a shared/crawled link. robots.txt is advisory; this emits an
// authoritative `noindex, nofollow` on every response from this route.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
