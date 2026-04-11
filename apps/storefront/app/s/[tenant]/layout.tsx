import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { StoreBaseProvider } from "@/lib/store-context";
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

  return (
    <StoreBaseProvider base={storeBase}>
      {googleFontsUrl && (
        // eslint-disable-next-line @next/next/no-page-custom-font
        <link rel="stylesheet" href={googleFontsUrl} />
      )}
      {tenant.store_config?.custom_css && (
        <style dangerouslySetInnerHTML={{ __html: tenant.store_config.custom_css }} />
      )}
      <div style={brandVars}>{children}</div>
    </StoreBaseProvider>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantParam } = await params;
  const tenant = await resolveTenant(tenantParam);

  if (!tenant) return { title: "Store not found" };

  const seo = tenant.store_config?.seo;
  const logoUrl = tenant.store_config?.logo_url || tenant.branding?.logo_url;

  return {
    title: seo?.meta_title || tenant.business_name,
    description: seo?.meta_description || `${tenant.business_name} — اطلب الآن من أفضل المنتجات`,
    icons: logoUrl ? [{ url: logoUrl }] : undefined,
    openGraph: {
      title: seo?.meta_title || tenant.business_name,
      description: seo?.meta_description || `${tenant.business_name} — اطلب الآن من أفضل المنتجات`,
      ...(seo?.og_image_url && { images: [{ url: seo.og_image_url }] }),
    },
  };
}
