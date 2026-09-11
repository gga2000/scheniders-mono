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
  const pageName = locale === "en" ? "Terms of service" : "الشروط والأحكام";
  const fallbackTitle = tenant
    ? `${pageName} — ${tenant.business_name}`
    : pageName;
  return {
    title: fallbackTitle,
    ...resolveV2PageMetadata(v2, "policy_terms", locale),
  };
}

export default async function TermsPage({
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
  const v2Page = pickV2Page(v2, "policy_terms");
  if (v2 && v2Page) {
    const categories = await listCategories(tenant.id);
    const runtime = buildRuntimeContext({
      pageId: "policy_terms",
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
      promo="📜 The fine print, in plain English"
      eyebrow="Policies"
      title="Terms of Service"
      subtitle="What we agree on when you shop with us 🤝"
      color="pink"
      lastUpdated={lastUpdated}
      tldr={{
        bg: "lilac",
        bullets: [
          "You order, we deliver. Pay cash on delivery.",
          "Inspect before paying. If broken or wrong, return it free.",
          "Be kind to our delivery team — they're heroes.",
        ],
      }}
      sections={[
        {
          bg: "mint",
          heading: "Ordering",
          body: (
            <p>
              Add to cart → Checkout → We call to confirm → We deliver. Orders
              are final when you accept our confirmation call.
            </p>
          ),
        },
        {
          bg: "butter",
          heading: "Pricing",
          body: (
            <p>
              Prices are in IQD and include any applicable taxes. We may change
              prices but never on your active order.
            </p>
          ),
        },
        {
          bg: "pink",
          heading: "Payment",
          body: (
            <p className="text-white">
              Cash on Delivery is our default. Card and wallet payments are
              coming soon. You can refuse to pay if the product isn't as
              described.
            </p>
          ),
        },
        {
          bg: "sky",
          heading: "Delivery",
          body: (
            <p>
              24h in Baghdad, 48–72h elsewhere. If we're going to be late, we'll
              WhatsApp you first.
            </p>
          ),
        },
        {
          bg: "lilac",
          heading: "Returns",
          body: (
            <p>
              7 days, free pickup. See our{" "}
              <a className="font-bold underline" href="../returns">
                Returns Policy
              </a>{" "}
              for the full list.
            </p>
          ),
        },
        {
          bg: "white",
          heading: "Acceptable use",
          body: (
            <p>
              Don't try to abuse the system. No fake addresses, no harassment of
              staff. We reserve the right to refuse service.
            </p>
          ),
        },
        {
          bg: "butter",
          heading: "Warranty",
          body: <p>Manufacturer warranty + our 7-day guarantee = covered.</p>,
        },
        {
          bg: "white",
          heading: "Accounts",
          body: (
            <p>
              You don't need an account to order. If you sign up for our
              newsletter, you can unsubscribe anytime.
            </p>
          ),
        },
        {
          bg: "mint",
          heading: "Disputes",
          body: (
            <p>
              Disagreement? WhatsApp us first. If we can't resolve it, Iraqi law
              applies.
            </p>
          ),
        },
      ]}
    />
  );
}
