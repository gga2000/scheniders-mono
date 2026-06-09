import { notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  resolveSchneidersConfig,
  EMPTY_BRAND_KIT,
  buildBrandKitFontsUrl,
  buildBrandKitVars,
  sanitizeCustomCss,
} from "@scheniders/shared";
import type { BrandKit, StoreConfigV2 } from "@scheniders/shared";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { getRequestOrigin } from "@/lib/seo";
import { StoreBaseProvider } from "@/lib/store-context";
import { CartHydrator } from "@/components/cart-hydrator";
import { SchneidersAnalyticsPixels } from "@/components/schneiders/analytics-pixels";
import { SchneidersNewsletterPopup } from "@/components/schneiders/newsletter-popup";
import type { Tenant } from "@/lib/types";

interface Props {
  params: Promise<{ tenant: string }>;
  children: React.ReactNode;
}

async function resolveTenant(tenantParam: string): Promise<Tenant | null> {
  if (tenantParam.startsWith("__domain__")) {
    return getTenantByCustomDomain(tenantParam.replace("__domain__", ""));
  }
  return getTenantBySlug(tenantParam);
}

export default async function TenantLayout({ params, children }: Props) {
  const { tenant: tenantParam } = await params;
  const tenant = await resolveTenant(tenantParam);

  if (!tenant) notFound();

  // Determine store base path from proxy header
  // "" = subdomain mode (links are root-relative), "/s/slug" = path-based mode
  const headerList = await headers();
  const storeBase = headerList.get("x-store-base") ?? `/s/${tenantParam}`;

  if (tenant.status === "cancelled") {
    notFound();
  }

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

  // Build Google Fonts URL if custom fonts are set
  const fontFamilies: string[] = [];
  if (dt?.fonts?.heading) fontFamilies.push(dt.fonts.heading);
  if (dt?.fonts?.body && dt.fonts.body !== dt.fonts.heading) fontFamilies.push(dt.fonts.body);
  const googleFontsUrl = fontFamilies.length > 0
    ? `https://fonts.googleapis.com/css2?${fontFamilies.map((f) => `family=${f.replace(/\s/g, "+")}:wght@400;500;600;700`).join("&")}&display=swap`
    : null;

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
  const bkVars = buildBrandKitVars(brandKit);
  const bkMotion: "auto" | "reduce" = brandKit.motion?.enabled === false ? "reduce" : "auto";
  const bkFontsUrl = buildBrandKitFontsUrl(brandKit);

  // Schneiders-specific CSS vars (accent pair + wedge intensity) emitted on
  // the brand container so primitives + per-component reads can pick them up.
  const CANDY_HEX: Record<string, string> = {
    pink: "#ff5a8a",
    mint: "#7cf0bd",
    butter: "#ffd84a",
    lilac: "#c5b6ff",
    sky: "#9ad8ff",
    cream: "#fff7ed",
    ink: "#1a1a1a",
  };
  const WEDGE_MULTIPLIER: Record<string, number> = {
    none: 0,
    subtle: 0.35,
    playful: 1,
    wild: 1.75,
  };
  const accentPrimary = CANDY_HEX[schn.accent_pair.primary ?? "pink"] ?? CANDY_HEX.pink;
  const accentSecondary = CANDY_HEX[schn.accent_pair.secondary ?? "mint"] ?? CANDY_HEX.mint;
  const wedge = WEDGE_MULTIPLIER[schn.wedge_intensity ?? "playful"] ?? 1;

  const schnVars: React.CSSProperties = {
    ["--schn-accent-primary" as string]: accentPrimary,
    ["--schn-accent-primary-on" as string]:
      schn.accent_pair.primary === "butter" || schn.accent_pair.primary === "mint" || schn.accent_pair.primary === "sky" || schn.accent_pair.primary === "lilac" || schn.accent_pair.primary === "cream"
        ? "#1a1a1a"
        : "#ffffff",
    ["--schn-accent-secondary" as string]: accentSecondary,
    ["--schn-wedge" as string]: String(wedge),
  };

  return (
    <StoreBaseProvider base={storeBase}>
      <CartHydrator />
      {googleFontsUrl && (
         
        <link rel="stylesheet" href={googleFontsUrl} />
      )}
      {bkFontsUrl && (
         
        <link rel="stylesheet" href={bkFontsUrl} />
      )}
      {(() => {
        const rawCustomCss = v2?.custom_css ?? tenant.store_config?.custom_css;
        return rawCustomCss ? (
          <style dangerouslySetInnerHTML={{ __html: sanitizeCustomCss(rawCustomCss) }} />
        ) : null;
      })()}
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
      <div
        data-bk-motion={bkMotion}
        style={{ ...brandVars, ...schnVars, ...bkVars }}
      >
        {children}
      </div>
      <SchneidersNewsletterPopup config={schn.newsletter_popup} />
    </StoreBaseProvider>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantParam } = await params;
  const tenant = await resolveTenant(tenantParam);

  if (!tenant) return { title: "Store not found" };

  const seo = tenant.store_config?.seo;
  const logoUrl = tenant.store_config?.logo_url || tenant.branding?.logo_url;
  const title = seo?.meta_title || tenant.business_name;
  const description =
    seo?.meta_description ||
    `${tenant.business_name} — اطلب الآن من أفضل المنتجات`;
  const origin = await getRequestOrigin();
  const ogImage = seo?.og_image_url;

  return {
    // metadataBase lets Next resolve relative OG/canonical URLs to absolutes.
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    title,
    description,
    icons: logoUrl ? [{ url: logoUrl }] : undefined,
    openGraph: {
      type: "website",
      locale: "ar_IQ",
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
