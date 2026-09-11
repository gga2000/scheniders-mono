import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveSchneidersConfig } from "@scheniders/shared";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listCategories } from "@/lib/queries";
import {
  pickV2Page,
  buildRuntimeContext,
  resolveV2PageMetadata,
} from "@/lib/storefront-runtime";
import { V2Page } from "@/components/v2-page";
import { SchneidersPolicyPage } from "@/components/schneiders/policy-page";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenant: string }>;
}): Promise<Metadata> {
  const { tenant: tenantParam } = await params;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);
  const v2 = tenant?.store_config_v2 ?? null;
  const locale = v2?.default_locale ?? "ar";
  // Fallback title mirrors cart/checkout: localised page name + the
  // tenant's own name — never the platform brand.
  const pageName = locale === "en" ? "Privacy policy" : "سياسة الخصوصية";
  const fallbackTitle = tenant
    ? `${pageName} — ${tenant.business_name}`
    : pageName;
  return {
    title: fallbackTitle,
    ...resolveV2PageMetadata(v2, "policy_privacy", locale),
  };
}

export default async function PrivacyPolicy({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant: tenantParam } = await params;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);
  if (!tenant) notFound();

  const v2 = tenant.store_config_v2 ?? null;
  const v2Page = pickV2Page(v2, "policy_privacy");
  if (v2 && v2Page) {
    const categories = await listCategories(tenant.id);
    const runtime = buildRuntimeContext({
      pageId: "policy_privacy",
      locale: v2.default_locale ?? "ar",
      now: new Date(),
    });
    return (
      <V2Page
        v2={v2}
        page={v2Page}
        runtime={runtime}
        renderCtx={{ tenant, products: [], categories }}
      />
    );
  }

  const categories = await listCategories(tenant.id);
  const wa = tenant.store_config?.contact?.whatsapp_number ?? null;
  const schn = resolveSchneidersConfig(tenant.store_config?.schneiders);
  const lastUpdated = schn.policy_meta.last_updated_label ?? "May 2026";

  return (
    <SchneidersPolicyPage
      tenant={tenant}
      categories={categories}
      whatsappNumber={wa}
      promo="🛡️ Your data is safe. Pinky promise."
      eyebrow="Policies"
      title="Privacy Policy"
      subtitle="The short, friendly version 👇"
      color="sky"
      lastUpdated={lastUpdated}
      tldr={{
        bg: "mint",
        bullets: [
          "We use your name + phone + address to deliver your order. That's it.",
          "We use cookies to remember your cart and improve the site.",
          "We never sell your data to anyone.",
        ],
      }}
      sections={[
        {
          bg: "pink",
          heading: "What we collect",
          body: (
            <p className="text-white">
              Name, phone, delivery address, and (optionally) email.
            </p>
          ),
        },
        {
          bg: "butter",
          heading: "Why we collect it",
          body: (
            <p>
              To deliver your order. To call you to confirm. To improve our
              service.
            </p>
          ),
        },
        {
          bg: "lilac",
          heading: "Cookies & tracking",
          body: (
            <p>
              We use cookies to remember your cart, recognize you on return
              visits, and run ads on Meta and TikTok to people like you. You can
              disable cookies in your browser at any time.
            </p>
          ),
        },
        {
          bg: "sky",
          heading: "Who we share with",
          body: (
            <p>
              Only with our delivery team and payment processors. We never sell
              your data.
            </p>
          ),
        },
        {
          bg: "mint",
          heading: "Your rights",
          body: (
            <p>You can ask us to delete your data anytime. Just WhatsApp us.</p>
          ),
        },
        {
          bg: "white",
          heading: "Security",
          body: (
            <p>
              We use HTTPS, encrypted databases, and modern security best
              practices. No system is 100% safe, but we try hard.
            </p>
          ),
        },
        {
          bg: "butter",
          heading: "Are you under 13?",
          body: (
            <p>
              Please get a parent's help before placing an order. Our service is
              intended for 13+.
            </p>
          ),
        },
        {
          bg: "white",
          heading: "Will this change?",
          body: (
            <p>
              Sometimes. We'll update the date at the top of this page. For big
              changes, we'll WhatsApp our customers.
            </p>
          ),
        },
      ]}
    />
  );
}
