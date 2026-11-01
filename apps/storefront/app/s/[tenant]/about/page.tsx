import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listCategories, listProducts } from "@/lib/queries";
import { pickV2Page, buildRuntimeContext, resolveV2PageMetadata } from "@/lib/storefront-runtime";
import { V2Page } from "@/components/v2-page";
import { pageNeedsProductAttributes } from "@scheniders/sections";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { PageHeader, ContentSection } from "@/components/schneiders/content-page";
import { BentoCard, ChunkyLink, MaterialIcon, ScribbleHeading, Sticker, WhatsAppIcon } from "@/components/schneiders/primitives";
import { storeCanonical } from "@/lib/seo";

/**
 * Convert merchant-authored HTML (legacy `about.body`) into plain-text
 * paragraphs. Block boundaries (</p>, <br>, blank lines) become paragraph
 * splits; all remaining tags are removed and a few common entities decoded.
 * Output is rendered as React text (escaped) — no HTML is ever interpreted,
 * which closes the stored-XSS hole. (EC4)
 */
function htmlToSafeParagraphs(html: string | null | undefined): string[] {
  if (!html) return [];
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "") // strip every remaining tag
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

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
  // Fallback title: localised page name + the tenant's own name.
  const pageName = locale === "en" ? "About" : "من نحن";
  return {
    title: tenant ? `${pageName} — ${tenant.business_name}` : pageName,
    ...(await storeCanonical(tenantParam, "/about")),
    ...resolveV2PageMetadata(v2, "about", locale),
  };
}

export default async function AboutPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantParam } = await params;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);
  if (!tenant) notFound();

  const v2 = tenant.store_config_v2 ?? null;
  const v2Page = pickV2Page(v2, "about");
  if (v2 && v2Page) {
    // The about page shows no catalogue of its own; products are loaded only
    // for a section that ranks them by attribute (the product finder).
    const [categories, products] = await Promise.all([
      listCategories(tenant.id),
      pageNeedsProductAttributes(v2Page.sections)
        ? listProducts(tenant.id, { limit: 48, withAttributes: true })
        : Promise.resolve([]),
    ]);
    const runtime = buildRuntimeContext({ pageId: "about", locale: v2.default_locale ?? "ar", now: new Date() });
    return <V2Page v2={v2} page={v2Page} runtime={runtime} renderCtx={{ tenant, products, categories }} />;
  }

  const categories = await listCategories(tenant.id);
  // EC4: `about.body` is merchant-authored config rendered on a public page.
  // It was injected via dangerouslySetInnerHTML → stored XSS (arbitrary JS on
  // the storefront/checkout origin). With no HTML sanitizer dependency, render
  // it as plain text instead: strip tags to paragraphs and let React escape it.
  // (Rich-HTML support can return later behind a real sanitizer like DOMPurify.)
  const aboutParagraphs = htmlToSafeParagraphs(tenant.store_config?.about?.body);
  const wa = tenant.store_config?.contact?.whatsapp_number ?? null;

  return (
    <SchneidersPageShell tenant={tenant} categories={categories} showBack promo="Made with love in Baghdad 🇮🇶 ✨">
      <PageHeader
        eyebrow="Our Story"
        title="Shopping should feel like JOY."
        subtitle="We started Schneiders to make online shopping in Iraq trustworthy, fast, and a little bit fun."
        color="butter"
      />

      <BentoCard bg="pink" rotate={-1} className="p-6 text-white relative overflow-hidden">
        <Sticker bg="butter" rotate={-6} size="xs" className="mb-3">Our Mission</Sticker>
        <p className="font-body text-base leading-relaxed">
          Every product, hand-picked. Every order, double-checked. Every customer, treated like family.
        </p>
      </BentoCard>

      <ContentSection bg="white">
        {aboutParagraphs.length > 0 ? (
          <div className="prose prose-sm max-w-none font-body">
            {aboutParagraphs.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        ) : (
          <>
            <p>
              We started <strong>{tenant.business_name || "Schneiders"}</strong> because online shopping in Iraq felt clumsy, anonymous, and overpriced.
            </p>
            <p>
              Every product here is chosen by a human. Every store verified. Every payment protected. No surprises at the door. No hidden fees. Just things you'll actually love, sent to you in 24 hours.
            </p>
          </>
        )}
      </ContentSection>

      <ScribbleHeading color="mint" as="h2">Our promise</ScribbleHeading>

      <div className="grid grid-cols-2 gap-3">
        <BentoCard bg="mint" rotate={-1} className="p-4">
          <div className="text-3xl mb-1">💵</div>
          <h3 className="font-display font-black uppercase text-sm">Cash on Delivery</h3>
          <p className="font-body text-xs mt-1">Pay only when you receive it.</p>
        </BentoCard>
        <BentoCard bg="butter" rotate={1} className="p-4">
          <div className="text-3xl mb-1">⚡</div>
          <h3 className="font-display font-black uppercase text-sm">24h Express</h3>
          <p className="font-body text-xs mt-1">Same-day Baghdad. 48h provinces.</p>
        </BentoCard>
        <BentoCard bg="sky" rotate={1} className="p-4">
          <div className="text-3xl mb-1">🛡️</div>
          <h3 className="font-display font-black uppercase text-sm">100% Original</h3>
          <p className="font-body text-xs mt-1">Verified at every step.</p>
        </BentoCard>
        <BentoCard bg="lilac" rotate={-1} className="p-4">
          <div className="text-3xl mb-1">↩️</div>
          <h3 className="font-display font-black uppercase text-sm">Easy Returns</h3>
          <p className="font-body text-xs mt-1">7 days, free pickup.</p>
        </BentoCard>
      </div>

      <ScribbleHeading color="sky" as="h2">By the numbers</ScribbleHeading>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Orders", value: "10K+", bg: "mint" as const },
          { label: "Governorates", value: "18", bg: "butter" as const },
          { label: "Rating", value: "4.9★", bg: "lilac" as const },
        ].map((stat, i) => (
          <BentoCard key={stat.label} bg={stat.bg} rotate={i % 2 === 0 ? 1 : -1} className="p-4 text-center">
            <div className="font-display font-black text-2xl">{stat.value}</div>
            <p className="font-label font-bold text-[10px] uppercase tracking-wider mt-1">{stat.label}</p>
          </BentoCard>
        ))}
      </div>

      <BentoCard bg="lilac" rotate={1} className="p-5">
        <ScribbleHeading color="pink" as="h3">Where we are</ScribbleHeading>
        <p className="font-body text-sm mt-2">
          {tenant.address && tenant.city
            ? `${tenant.address}, ${tenant.city}`
            : tenant.city ?? "Baghdad, Iraq 🇮🇶"}
        </p>
        {tenant.contact_phone && (
          <p className="font-body text-sm mt-1">
            <MaterialIcon name="call" className="text-sm align-middle mr-1" />
            {tenant.contact_phone}
          </p>
        )}
      </BentoCard>

      <BentoCard bg="mint" rotate={-1} className="p-5 text-center">
        <h3 className="font-display font-black text-xl uppercase mb-2">Want to chat?</h3>
        {wa && (
          <a
            href={`https://wa.me/${wa.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="bento-card bg-white text-bk-ink font-display font-black text-base px-5 py-3 inline-flex items-center gap-2 hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all rounded-xl uppercase tracking-tight"
          >
            <WhatsAppIcon className="w-5 h-5 text-bk-success" />
            WhatsApp us
          </a>
        )}
      </BentoCard>

      <ChunkyLink href="/" bg="pink" size="lg" fullWidth>
        Back to shopping
      </ChunkyLink>
    </SchneidersPageShell>
  );
}
