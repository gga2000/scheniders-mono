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
  const pageName =
    locale === "en" ? "Returns & exchanges" : "الإرجاع والاستبدال";
  const fallbackTitle = tenant
    ? `${pageName} — ${tenant.business_name}`
    : pageName;
  return {
    title: fallbackTitle,
    ...resolveV2PageMetadata(v2, "policy_returns", locale),
  };
}

export default async function ReturnsPolicy({
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
  const v2Page = pickV2Page(v2, "policy_returns");
  if (v2 && v2Page) {
    const categories = await listCategories(tenant.id);
    const runtime = buildRuntimeContext({
      pageId: "policy_returns",
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
  const windowDays = schn.returns_policy.window_days ?? 7;

  return (
    <SchneidersPolicyPage
      tenant={tenant}
      categories={categories}
      whatsappNumber={wa}
      promo={`↩️ Easy returns within ${windowDays} days ✨`}
      eyebrow="Policies"
      title="Returns & Exchanges"
      subtitle="Changed your mind? No problem."
      color="lilac"
      tldr={{
        bg: "pink",
        bullets: [
          `${windowDays}-day window from the day you received the order.`,
          "FREE pickup from your address — no shipping cost.",
          "Cash refund within 3 days, or instant exchange.",
        ],
      }}
      sections={[
        {
          bg: "mint",
          heading: "How it works",
          body: (
            <ol className="space-y-2 list-decimal list-inside">
              <li>
                Message us on WhatsApp within {windowDays} days with your order
                number and photos.
              </li>
              <li>
                Our delivery hero picks up the item from your address — FREE.
              </li>
              <li>
                Choose: cash refund in 3 days, or instant exchange for a
                different size/color/product.
              </li>
            </ol>
          ),
        },
        {
          bg: "white",
          heading: "What can I return?",
          body: (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="font-display font-bold uppercase text-sm text-bk-success mb-1">
                  ✓ Yes
                </p>
                <ul className="space-y-1 list-disc list-inside text-xs">
                  <li>Clothing &amp; shoes (unworn, tags on)</li>
                  <li>Electronics (sealed, unopened)</li>
                  <li>Beauty (sealed, unused)</li>
                </ul>
              </div>
              <div>
                <p className="font-display font-bold uppercase text-sm text-bk-primary mb-1">
                  ✗ No
                </p>
                <ul className="space-y-1 list-disc list-inside text-xs">
                  <li>Underwear &amp; swimwear</li>
                  <li>Personalized gifts</li>
                  <li>Sale items &gt; 50% off</li>
                </ul>
              </div>
            </div>
          ),
        },
        {
          bg: "butter",
          heading: "Got something defective?",
          body: (
            <p>
              We replace it for free — even past the {windowDays}-day window.
              Just message us with photos. Manufacturer warranty applies for
              electronics.
            </p>
          ),
        },
        {
          bg: "lilac",
          heading: "How fast is the refund?",
          body: (
            <p>
              Cash refunds are delivered in 3 days max after we collect the
              item. We hand it to you personally on delivery — same way you
              paid.
            </p>
          ),
        },
        {
          bg: "sky",
          heading: "Prefer to exchange?",
          body: (
            <p>
              Choose a different size, color, or a totally different product.
              Pay or get refunded the difference. Instant — no waiting on
              refunds.
            </p>
          ),
        },
      ]}
    />
  );
}
