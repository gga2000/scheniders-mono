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
import { formatPrice } from "@/components/schneiders/format";
import { storeCanonical, storeDisplayName } from "@/lib/seo";

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
  const pageName = locale === "en" ? "Shipping & delivery" : "الشحن والتوصيل";
  const fallbackTitle = tenant
    ? `${pageName} — ${storeDisplayName(tenant)}`
    : pageName;
  return {
    title: fallbackTitle,
    ...(await storeCanonical(tenantParam, "/policies/shipping")),
    ...resolveV2PageMetadata(v2, "policy_shipping", locale),
  };
}

export default async function ShippingPolicy({
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
  const v2Page = pickV2Page(v2, "policy_shipping");
  if (v2 && v2Page) {
    const categories = await listCategories(tenant.id);
    const runtime = buildRuntimeContext({
      pageId: "policy_shipping",
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
  const baghdadHours = schn.delivery_promise.baghdad_hours ?? 24;
  const provincesHours = schn.delivery_promise.provinces_hours ?? 48;
  const baghdadThreshold = schn.shipping.baghdad_threshold_iqd ?? 75_000;
  const baghdadFee = schn.shipping.baghdad_fee_iqd ?? 5_000;
  const provincesThreshold = schn.shipping.provinces_threshold_iqd ?? 100_000;
  const provincesFee = schn.shipping.provinces_fee_iqd ?? 7_500;
  const expressFee = schn.shipping.express_fee_iqd ?? 10_000;
  const govList = (schn.delivery_promise.governorates_covered ?? []).join(", ");
  const callMin = schn.reassurance.call_within_min ?? 30;

  return (
    <SchneidersPolicyPage
      tenant={tenant}
      categories={categories}
      whatsappNumber={wa}
      promo="🚚 Fast delivery across Iraq ✨"
      eyebrow="Policies"
      title="Shipping & Delivery"
      subtitle="How and when you'll get your stuff."
      color="butter"
      tldr={{
        bg: "mint",
        bullets: [
          `${baghdadHours} hours to Baghdad. ${provincesHours}–${provincesHours + 24} hours to other governorates.`,
          `FREE delivery on orders over ${formatPrice(baghdadThreshold)}. Otherwise ${formatPrice(baghdadFee)} flat.`,
          "Pay cash on delivery — no upfront payment needed.",
        ],
      }}
      sections={[
        {
          bg: "white",
          heading: "Delivery times",
          body: (
            <>
              <p>
                <strong>Baghdad:</strong> Same-day or next-day delivery (
                {baghdadHours}h max).
              </p>
              <p>
                <strong>Other governorates:</strong> {provincesHours}–
                {provincesHours + 24} hours.
              </p>
              <p>
                Express same-day delivery is available in Baghdad for{" "}
                {formatPrice(expressFee)} extra at checkout.
              </p>
            </>
          ),
        },
        {
          bg: "sky",
          heading: "Where we deliver",
          body: (
            <p>
              All {schn.delivery_promise.governorates_covered?.length ?? 18}{" "}
              Iraqi governorates: {govList}.
            </p>
          ),
        },
        {
          bg: "butter",
          heading: "Shipping fees",
          body: (
            <ul className="space-y-2 list-disc list-inside">
              <li>
                Baghdad: FREE on orders {formatPrice(baghdadThreshold)}+;
                otherwise {formatPrice(baghdadFee)}.
              </li>
              <li>
                Other governorates: FREE on orders{" "}
                {formatPrice(provincesThreshold)}+; otherwise{" "}
                {formatPrice(provincesFee)}.
              </li>
              <li>
                Express (Baghdad only): +{formatPrice(expressFee)} for same-day
                delivery.
              </li>
            </ul>
          ),
        },
        {
          bg: "lilac",
          heading: "When do we ship?",
          body: (
            <p>
              Orders placed before 6pm Saturday–Thursday ship the same day.
              After 6pm they ship the next morning. Friday orders ship Saturday.
            </p>
          ),
        },
        {
          bg: "pink",
          heading: "How we pack",
          body: (
            <p className="text-white">
              Sturdy boxes, secure packaging, recyclable materials. Free gift
              wrap available — just leave a note at checkout.
            </p>
          ),
        },
        {
          bg: "white",
          heading: "Track your order",
          body: (
            <p>
              Once your order is placed, we&apos;ll call you within {callMin}{" "}
              minutes to confirm. After that, you can{" "}
              <a href="../../track" className="font-bold underline">
                track it here
              </a>{" "}
              or message us on WhatsApp for live updates.
            </p>
          ),
        },
      ]}
    />
  );
}
