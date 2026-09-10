import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listCategories } from "@/lib/queries";
import { pickV2Page, buildRuntimeContext, resolveV2PageMetadata } from "@/lib/storefront-runtime";
import { V2Page } from "@/components/v2-page";
import { JsonLd } from "@/components/json-ld";
import { faqItemsFromPage, faqPageJsonLd } from "@/lib/seo";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { PageHeader } from "@/components/schneiders/content-page";
import { FaqAccordion } from "@/components/schneiders/faq-accordion";
import { BentoCard, ChunkyLink, WhatsAppIcon } from "@/components/schneiders/primitives";

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
  return { title: "FAQ — Schneiders", ...resolveV2PageMetadata(v2, "faq", v2?.default_locale ?? "ar") };
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "How long does delivery take?",
    a: "24 hours to Baghdad, 48–72 hours to other governorates. Express same-day delivery is available in Baghdad for an extra fee.",
  },
  {
    q: "Is Cash on Delivery available?",
    a: "Yes. COD is our default payment method. You inspect the order at the door before paying — no upfront payment is ever required.",
  },
  {
    q: "Can I return or exchange items?",
    a: "Yes — within 7 days of delivery. Free pickup from your address. See our Returns Policy for the full list of what's returnable.",
  },
  {
    q: "Are the products original?",
    a: "100% original — every product is sourced from verified suppliers. If you suspect anything, we replace it immediately + full refund.",
  },
  {
    q: "Which governorates do you deliver to?",
    a: "All 18 Iraqi governorates: Baghdad, Basra, Erbil, Mosul, Najaf, Karbala, Sulaymaniyah, Kirkuk, Anbar, Babil, Diwaniyah, Diyala, Dhi Qar, Maysan, Muthanna, Salah ad-Din, Wasit, and Dohuk.",
  },
  {
    q: "How do I track my order?",
    a: "After ordering, you'll get a call within 30 minutes. You can also track on WhatsApp anytime — we'll send live updates.",
  },
  {
    q: "Can I order on WhatsApp instead?",
    a: "Absolutely. Tap any WhatsApp button on the site and message us with the product + size + your address. We'll handle the rest.",
  },
  {
    q: "Do you offer gift wrapping?",
    a: "Yes — free gift wrap on any order. Add a note at checkout with the recipient's name and your message.",
  },
];

export default async function FaqPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantParam } = await params;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);
  if (!tenant) notFound();

  const v2 = tenant.store_config_v2 ?? null;
  const v2Page = pickV2Page(v2, "faq");
  if (v2 && v2Page) {
    const categories = await listCategories(tenant.id);
    const locale = v2.default_locale ?? "ar";
    const runtime = buildRuntimeContext({ pageId: "faq", locale, now: new Date() });
    // FAQ rich results, built from the questions this page actually renders —
    // undefined (and so not emitted) when the merchant placed none.
    const faq = faqPageJsonLd(faqItemsFromPage(v2Page, locale));
    return (
      <>
        {faq && <JsonLd data={faq} />}
        <V2Page v2={v2} page={v2Page} runtime={runtime} renderCtx={{ tenant, products: [], categories }} />
      </>
    );
  }

  const categories = await listCategories(tenant.id);
  const wa = tenant.store_config?.contact?.whatsapp_number ?? null;

  return (
    <SchneidersPageShell tenant={tenant} categories={categories} showBack promo="Got questions? We've got answers ✨">
      <PageHeader
        title="Quick Answers"
        subtitle="Everything you need to know, fast."
        color="butter"
      />

      <FaqAccordion items={FAQ} />

      <BentoCard bg="mint" rotate={-1} className="p-5 text-center">
        <h3 className="font-display font-black text-xl uppercase mb-2">Still need help?</h3>
        <p className="font-body text-sm mb-4">Our team replies in under 15 minutes ⚡</p>
        {wa ? (
          <a
            href={`https://wa.me/${wa.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="bento-card bg-white text-bk-ink font-display font-black text-base px-5 py-3 inline-flex items-center gap-2 hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all rounded-xl uppercase tracking-tight"
          >
            <WhatsAppIcon className="w-5 h-5 text-bk-success" />
            Chat with us
          </a>
        ) : (
          <ChunkyLink href="/contact" bg="pink" size="md">
            Contact us
          </ChunkyLink>
        )}
      </BentoCard>
    </SchneidersPageShell>
  );
}
