import type { Viewport } from "next";
import { headers, cookies } from "next/headers";
import {
  resolveSchneidersConfig,
  EMPTY_BRAND_KIT,
  buildBrandKitFontsUrl,
  buildBrandKitVars,
  sanitizeCustomCss,
  resolveVisitorLocale,
  LOCALE_COOKIE,
} from "@scheniders/shared";
import type { BrandKit, StoreConfigV2 } from "@scheniders/shared";
import { resolveStoreTenant, requireStoreTenant } from "@/lib/route-guards";
import { getRequestOrigin, htmlLangFor, ogLocaleFor, getStorefrontBase } from "@/lib/seo";
import { StoreBaseProvider } from "@/lib/store-context";
import { CartHydrator } from "@/components/cart-hydrator";
import { HtmlLang } from "@/components/html-lang";
import { SchneidersAnalyticsPixels } from "@/components/schneiders/analytics-pixels";
import { SchneidersNewsletterPopup } from "@/components/schneiders/newsletter-popup";
import type { Tenant } from "@/lib/types";

interface Props {
  params: Promise<{ tenant: string }>;
  children: React.ReactNode;
}

export default async function TenantLayout({ params, children }: Props) {
  const { tenant: tenantParam } = await params;
  // Unknown and cancelled stores 404 here, above every loading boundary, so
  // the status is set before anything streams.
  const tenant = await requireStoreTenant(tenantParam);

  // Determine store base path from proxy header
  // "" = subdomain mode (links are root-relative), "/s/slug" = path-based mode
  const headerList = await headers();
  const storeBase = headerList.get("x-store-base") ?? `/s/${tenantParam}`;

  if (tenant.status === "suspended") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-center px-6 max-w-md">
          <h1 className="text-2xl font-bold mb-2 text-zinc-900">
            المتجر غير متاح
          </h1>
          <p className="text-zinc-600">
            هذا المتجر متوقف مؤقتاً. يرجى المحاولة لاحقاً.
          </p>
        </div>
      </main>
    );
  }

  // Resolve design tokens from store_config, falling back to branding fields
  const dt = tenant.store_config?.design_tokens;
  const radiusMap = { none: "0px", sm: "0.25rem", md: "0.5rem", lg: "1rem", full: "9999px" } as const;
  const spacingMap = { compact: "0.75rem", comfortable: "1rem", spacious: "1.5rem" } as const;
  const shadowMap = {
    flat: "none",
    subtle: "0 1px 3px 0 rgb(0 0 0 / 0.1)",
    elevated: "0 10px 25px -5px rgb(0 0 0 / 0.1), 0 4px 6px -2px rgb(0 0 0 / 0.05)",
  } as const;

  const brandVars: React.CSSProperties = {
    ["--brand-primary" as string]: dt?.colors?.primary || tenant.branding?.primary_color || "#3b82f6",
    ["--brand-secondary" as string]: dt?.colors?.secondary || tenant.branding?.secondary_color || "#8b5cf6",
    ["--brand-accent" as string]: dt?.colors?.accent || tenant.branding?.accent_color || "#f59e0b",
    ["--brand-background" as string]: dt?.colors?.background || "#ffffff",
    ["--brand-text" as string]: dt?.colors?.text || "#111827",
    ["--brand-font" as string]: tenant.branding?.font || "system-ui, sans-serif",
    ["--brand-font-heading" as string]: dt?.fonts?.heading ? `'${dt.fonts.heading}', sans-serif` : "inherit",
    ["--brand-font-body" as string]: dt?.fonts?.body ? `'${dt.fonts.body}', sans-serif` : "inherit",
    ["--brand-radius" as string]: radiusMap[dt?.radius || "md"],
    ["--brand-spacing" as string]: spacingMap[dt?.spacing || "comfortable"],
    ["--brand-shadow" as string]: shadowMap[dt?.shadows || "subtle"],
  };

  const schn = resolveSchneidersConfig(tenant.store_config?.schneiders);

  /* ─────────────────────────────────────────────────────────────────
   * Brand kit v2 — single source of truth for visual identity.
   * Fallback chain:
   *   1. tenant.store_config_v2.brand_kit  (post-migration field)
   *   2. derive from legacy design_tokens + schneiders
   *   3. EMPTY_BRAND_KIT
   * The derived path keeps pre-migration tenants visually consistent
   * with what they already shipped. New tokens are additive — legacy
   * candy tokens still emit below.
   * ───────────────────────────────────────────────────────────────── */
  const v2 = (tenant as Tenant & { store_config_v2?: StoreConfigV2 | null })
    .store_config_v2 ?? null;

  // EC13: the locale this visitor sees — same resolution V2Page uses to render,
  // so `<html lang>` and the switcher highlight match the body. Constrained to
  // the store's enabled_locales.
  const localeCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const currentLocale = resolveVisitorLocale({
    enabledLocales: v2?.enabled_locales,
    defaultLocale: v2?.default_locale,
    cookieLocale: localeCookie,
    acceptLanguage: headerList.get("accept-language"),
  });

  const RADIUS_V2: Record<string, BrandKit["shape"]["radius"]> = {
    none: "none",
    sm: "soft",
    md: "soft",
    lg: "round",
    full: "pill",
  };
  const SHADOWS_V2: Record<string, BrandKit["shape"]["shadow_style"]> = {
    flat: "flat",
    subtle: "soft",
    elevated: "elevated",
  };
  const legacyColors = dt?.colors;
  const derivedBrandKit: BrandKit = {
    identity: {
      ...EMPTY_BRAND_KIT.identity,
      logo_url:
        tenant.store_config?.logo_url ?? tenant.branding?.logo_url ?? undefined,
      og_image_url: tenant.store_config?.seo?.og_image_url,
      name: tenant.business_name,
    },
    colors: {
      primary:
        legacyColors?.primary ??
        tenant.branding?.primary_color ??
        EMPTY_BRAND_KIT.colors.primary,
      secondary:
        legacyColors?.secondary ??
        tenant.branding?.secondary_color ??
        EMPTY_BRAND_KIT.colors.secondary,
      accent:
        legacyColors?.accent ??
        tenant.branding?.accent_color ??
        EMPTY_BRAND_KIT.colors.accent,
      surface: legacyColors?.background ?? EMPTY_BRAND_KIT.colors.surface,
      surface_alt: EMPTY_BRAND_KIT.colors.surface_alt,
      ink: legacyColors?.text ?? EMPTY_BRAND_KIT.colors.ink,
      success: EMPTY_BRAND_KIT.colors.success,
      danger: EMPTY_BRAND_KIT.colors.danger,
    },
    typography: {
      display: dt?.fonts?.heading ?? EMPTY_BRAND_KIT.typography.display,
      body: dt?.fonts?.body ?? EMPTY_BRAND_KIT.typography.body,
      scale: dt?.spacing ?? EMPTY_BRAND_KIT.typography.scale,
    },
    shape: {
      radius: dt?.radius
        ? RADIUS_V2[dt.radius] ?? EMPTY_BRAND_KIT.shape.radius
        : EMPTY_BRAND_KIT.shape.radius,
      border_thickness: EMPTY_BRAND_KIT.shape.border_thickness,
      shadow_style: dt?.shadows
        ? SHADOWS_V2[dt.shadows] ?? EMPTY_BRAND_KIT.shape.shadow_style
        : EMPTY_BRAND_KIT.shape.shadow_style,
      rotation_intensity:
        schn.wedge_intensity ?? EMPTY_BRAND_KIT.shape.rotation_intensity,
    },
    motion: { ...EMPTY_BRAND_KIT.motion },
    voice: { ...EMPTY_BRAND_KIT.voice },
  };

  const brandKit: BrandKit = v2?.brand_kit ?? derivedBrandKit;
  // Locale-aware: Arabic/Kurdish visitors get the kit's Arabic font
  // pairing as the MAIN font vars ([D3]).
  const bkVars = buildBrandKitVars(brandKit, { locale: currentLocale });
  const bkMotion: "auto" | "reduce" = brandKit.motion?.enabled === false ? "reduce" : "auto";
  // Calm kits (no rotation) drop the Candy uppercase treatment — see
  // `.bk-caps` in globals.css.
  const bkExpressive = brandKit.shape?.rotation_intensity !== "none";
  const bkFontsUrl = buildBrandKitFontsUrl(brandKit);

  // Schneiders-specific CSS vars (accent pair + wedge intensity) emitted on
  // the brand container so primitives + per-component reads can pick them up.
  // The merchant picks an accent PAIR by candy name; those names now resolve
  // to brand-kit tokens rather than the fixed pastels they used to be, so a
  // tenant who recolours their kit recolours these too. The fallbacks are the
  // original hexes, which are also the default kit's values — a tenant on the
  // default kit renders exactly as before.
  const ACCENT_TOKEN: Record<string, string> = {
    pink: "var(--bk-primary, #ff5a8a)",
    mint: "var(--bk-secondary, #7cf0bd)",
    butter: "var(--bk-accent, #ffd84a)",
    lilac: "var(--bk-decor-b, #c5b6ff)",
    sky: "var(--bk-decor-c, #9ad8ff)",
    cream: "var(--bk-surface, #fff7ed)",
    ink: "var(--bk-ink, #1a1a1a)",
  };
  /** The one readable foreground for each accent surface. */
  const ACCENT_ON: Record<string, string> = {
    pink: "var(--bk-on-primary, #ffffff)",
    mint: "var(--bk-on-secondary, #1a1a1a)",
    butter: "var(--bk-on-accent, #1a1a1a)",
    lilac: "var(--bk-on-decor, #1a1a1a)",
    sky: "var(--bk-on-decor, #1a1a1a)",
    cream: "var(--bk-ink, #1a1a1a)",
    ink: "#ffffff",
  };
  const primaryName = schn.accent_pair.primary ?? "pink";
  const secondaryName = schn.accent_pair.secondary ?? "mint";
  const accentPrimary = ACCENT_TOKEN[primaryName] ?? ACCENT_TOKEN.pink;
  const accentPrimaryOn = ACCENT_ON[primaryName] ?? ACCENT_ON.pink;
  const accentSecondary = ACCENT_TOKEN[secondaryName] ?? ACCENT_TOKEN.mint;

  const schnVars: React.CSSProperties = {
    ["--schn-accent-primary" as string]: accentPrimary,
    ["--schn-accent-primary-on" as string]: accentPrimaryOn,
    ["--schn-accent-secondary" as string]: accentSecondary,
  };

  return (
    <StoreBaseProvider base={storeBase}>
      <CartHydrator />
      {/* Single Google Fonts request for the kit's non-self-hosted faces.
          The legacy design_tokens fonts already flow into the derived kit
          (typography.display/body), so a second URL for them was a duplicate
          render-blocking stylesheet (RC3). Cairo / Noto Sans Arabic /
          Bricolage / DM Sans come from next/font in the root layout. */}
      {bkFontsUrl && <link rel="stylesheet" href={bkFontsUrl} />}
      {(() => {
        const rawCustomCss = v2?.custom_css ?? tenant.store_config?.custom_css;
        return rawCustomCss ? (
          <style dangerouslySetInnerHTML={{ __html: sanitizeCustomCss(rawCustomCss) }} />
        ) : null;
      })()}
      <HtmlLang lang={htmlLangFor(currentLocale)} />
      {/* Draft view is the merchant previewing unpublished changes, not a
          shopper: no pixel init means no PageView here and no ViewContent /
          Purchase later (the section trackers no-op without fbq/ttq). */}
      {!tenant.is_draft_view && (
        <SchneidersAnalyticsPixels
          analytics={{
            // V2 takes precedence — the globals.analytics_pixels section is
            // the single source of truth post-migration. Falls back to the
            // legacy `schneiders.analytics` field so pre-migration tenants
            // still ship their pixels.
            ...schn.analytics,
            ...((v2?.globals?.analytics_pixels?.base as
              | Record<string, string | undefined>
              | undefined) ?? {}),
          }}
        />
      )}
      <div
        data-bk-motion={bkMotion}
        data-bk-expressive={bkExpressive ? "true" : "false"}
        style={{
          ...brandVars,
          ...schnVars,
          ...bkVars,
          // Cascade the brand-kit body font to ALL inherited text in the
          // tenant subtree (not only primitives that read the var explicitly),
          // so plain prose/labels render in DM Sans / the tenant body face
          // rather than system-ui.
          // EC14: 'Noto Sans Arabic' last so Arabic/Kurdish glyphs render in a
          // real Arabic face when --bk-font-body is unset (Latin brand fonts
          // carry no Arabic). --bk-font-body already includes it via fontStack.
          fontFamily:
            "var(--bk-font-body, var(--font-dm-sans), 'DM Sans', 'Noto Sans Arabic', sans-serif)",
        }}
      >
        {/* The language switcher lives inside the global `site_header`
            section (P1-6) — it reads `store_config_v2.enabled_locales` off
            the tenant in the section ctx and `runtime.locale`, so nothing
            floats over page content any more. */}
        {children}
      </div>
      <SchneidersNewsletterPopup config={schn.newsletter_popup} />
    </StoreBaseProvider>
  );
}

/**
 * P2-28: without a viewport export Next emits the bare default, so
 * `env(safe-area-inset-*)` resolves to 0 (no `viewport-fit=cover`) and the
 * browser chrome never picks up the brand surface. Zoom stays enabled.
 * The tenant resolver is React-`cache`d, so this shares the layout's lookup.
 */
export async function generateViewport({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Viewport> {
  const { tenant: tenantParam } = await params;
  const tenant = await resolveStoreTenant(tenantParam);
  // Same precedence as the layout's brand-kit fallback chain: V2 kit surface,
  // then the legacy design_tokens background, then the neutral kit default.
  const v2Surface = (
    tenant as (Tenant & { store_config_v2?: StoreConfigV2 | null }) | null
  )?.store_config_v2?.brand_kit?.colors?.surface;
  const themeColor =
    v2Surface ??
    tenant?.store_config?.design_tokens?.colors?.background ??
    EMPTY_BRAND_KIT.colors.surface;
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor,
  };
}

/** Home-screen labels are clipped by the OS; keep the store's name, drop the rest. */
function shortTitle(title: string): string {
  const t = title.trim();
  return t.length <= 15 ? t : t.slice(0, 15).trim();
}

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantParam } = await params;
  const tenant = await resolveStoreTenant(tenantParam);

  if (!tenant) return { title: "Store not found" };

  const seo = tenant.store_config?.seo;
  // Prefer the V2 brand kit identity (what the store builder edits) and fall
  // back to the legacy `store_config.seo`/`logo_url`. Without this, the OG image
  // and favicon a merchant uploads in the V2 builder never render, and the
  // health check that validates `brand_kit.identity.*` reports a false pass.
  const v2Identity = (
    tenant as Tenant & { store_config_v2?: StoreConfigV2 | null }
  ).store_config_v2?.brand_kit?.identity;
  const logoUrl =
    v2Identity?.favicon_url ||
    v2Identity?.logo_url ||
    tenant.store_config?.logo_url ||
    tenant.branding?.logo_url;
  const title = seo?.meta_title || v2Identity?.name || tenant.business_name;
  const description =
    seo?.meta_description ||
    `${tenant.business_name} — اطلب الآن من أفضل المنتجات`;
  const origin = await getRequestOrigin();
  const ogImage = v2Identity?.og_image_url || seo?.og_image_url;
  // Home-screen install: the manifest is per tenant and lives under the
  // store's own root, so it resolves in both routing modes (path and
  // subdomain/custom domain).
  const { storeBase } = await getStorefrontBase(tenantParam);

  return {
    // metadataBase lets Next resolve relative OG/canonical URLs to absolutes.
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    title,
    description,
    icons: logoUrl
      ? {
          icon: [{ url: logoUrl }],
          // iOS Safari's "Add to Home Screen" reads this one, and needs no
          // manifest or service worker to do it.
          apple: [{ url: logoUrl }],
        }
      : undefined,
    manifest: `${storeBase}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      title: shortTitle(title),
      statusBarStyle: "default",
    },
    openGraph: {
      type: "website",
      locale: ogLocaleFor(
        (tenant as Tenant & { store_config_v2?: StoreConfigV2 | null })
          .store_config_v2?.default_locale,
      ),
      siteName: tenant.business_name,
      title,
      description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}
