import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
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

  if (tenant.status === "suspended" || tenant.status === "cancelled") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="text-center px-6 max-w-md">
          <h1 className="text-2xl font-bold mb-2 text-zinc-900">
            {tenant.business_name}
          </h1>
          <p className="text-zinc-600">
            هذا المتجر متوقف مؤقتاً. يرجى التواصل مع المالك.
          </p>
        </div>
      </main>
    );
  }

  // Inject brand CSS variables
  const brandVars: React.CSSProperties = {
    ["--brand-primary" as string]: tenant.branding?.primary_color || "#3b82f6",
    ["--brand-secondary" as string]: tenant.branding?.secondary_color || "#8b5cf6",
    ["--brand-accent" as string]: tenant.branding?.accent_color || "#f59e0b",
    ["--brand-font" as string]: tenant.branding?.font || "system-ui, sans-serif",
  };

  return <div style={brandVars}>{children}</div>;
}

export async function generateMetadata({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantParam } = await params;
  const tenant = await resolveTenant(tenantParam);

  if (!tenant) return { title: "Store not found" };

  return {
    title: tenant.business_name,
    description: `${tenant.business_name} — اطلب الآن من أفضل المنتجات`,
    icons: tenant.branding?.logo_url ? [{ url: tenant.branding.logo_url }] : undefined,
  };
}
