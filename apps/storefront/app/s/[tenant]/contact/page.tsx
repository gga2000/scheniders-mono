import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveSchneidersConfig } from "@scheniders/shared";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listCategories } from "@/lib/queries";
import { pickV2Page, buildRuntimeContext, resolveV2PageMetadata } from "@/lib/storefront-runtime";
import { V2Page } from "@/components/v2-page";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { PageHeader } from "@/components/schneiders/content-page";
import { BentoCard, ChunkyLink, MaterialIcon, WhatsAppIcon } from "@/components/schneiders/primitives";

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
  return { title: "Contact — Schneiders", ...resolveV2PageMetadata(v2, "contact", v2?.default_locale ?? "ar") };
}

export default async function ContactPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: tenantParam } = await params;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);
  if (!tenant) notFound();

  const v2 = tenant.store_config_v2 ?? null;
  const v2Page = pickV2Page(v2, "contact");
  if (v2 && v2Page) {
    const categories = await listCategories(tenant.id);
    const runtime = buildRuntimeContext({ pageId: "contact", locale: v2.default_locale ?? "ar", now: new Date() });
    return <V2Page v2={v2} page={v2Page} runtime={runtime} renderCtx={{ tenant, products: [], categories }} />;
  }

  const categories = await listCategories(tenant.id);
  const c = tenant.store_config?.contact;
  const wa = c?.whatsapp_number ?? null;
  const schn = resolveSchneidersConfig(tenant.store_config?.schneiders);

  return (
    <SchneidersPageShell tenant={tenant} categories={categories} showBack promo="We reply fast ⚡ Avg response: 12 minutes">
      <PageHeader
        title="Get in Touch 👋"
        subtitle="We're here to help, however you prefer."
        color="mint"
      />

      <BentoCard bg="mint" rotate={1} className="p-5">
        <div className="flex items-start gap-3">
          <div className="text-3xl">💬</div>
          <div className="flex-1">
            <h3 className="font-display font-black text-lg uppercase">WhatsApp</h3>
            <p className="font-body text-sm">Reply in under 15 min</p>
          </div>
          {wa && (
            <a
              href={`https://wa.me/${wa.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="bento-card-sm bg-bk-surface-alt text-bk-ink font-display font-black text-xs px-3 py-2 inline-flex items-center gap-1 rounded-xl uppercase hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
            >
              <WhatsAppIcon className="w-4 h-4 text-bk-mint" />
              Open
            </a>
          )}
        </div>
      </BentoCard>

      <BentoCard bg="butter" rotate={-1} className="p-5">
        <div className="flex items-start gap-3">
          <MaterialIcon name="call" className="text-3xl drop-shadow-[2px_2px_0_#1a1a1a]" />
          <div className="flex-1">
            <h3 className="font-display font-black text-lg uppercase">Call us</h3>
            <p className="font-body text-sm">{schn.reassurance.support_hours}</p>
          </div>
          {tenant.contact_phone && (
            <a
              href={`tel:${tenant.contact_phone}`}
              className="bento-card-sm bg-bk-primary text-white font-display font-black text-xs px-3 py-2 inline-flex items-center gap-1 rounded-xl uppercase hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all text-bk-on-primary"
            >
              Call
            </a>
          )}
        </div>
      </BentoCard>

      <BentoCard bg="sky" rotate={1} className="p-5">
        <div className="flex items-start gap-3">
          <MaterialIcon name="email" className="text-3xl" />
          <div className="flex-1">
            <h3 className="font-display font-black text-lg uppercase">Email</h3>
            <p className="font-body text-sm">{tenant.contact_email ?? "hello@schneiders.com"}</p>
          </div>
          {tenant.contact_email && (
            <a
              href={`mailto:${tenant.contact_email}`}
              className="bento-card-sm bg-bk-lilac text-bk-ink font-display font-black text-xs px-3 py-2 inline-flex items-center gap-1 rounded-xl uppercase hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
            >
              Send
            </a>
          )}
        </div>
      </BentoCard>

      <BentoCard bg="lilac" rotate={-1} className="p-5">
        <div className="flex items-start gap-3">
          <MaterialIcon name="storefront" className="text-3xl" />
          <div>
            <h3 className="font-display font-black text-lg uppercase">Visit our store</h3>
            <p className="font-body text-sm">
              {tenant.address && tenant.city
                ? `${tenant.address}, ${tenant.city}`
                : tenant.city ?? "Baghdad, Iraq 🇮🇶"}
            </p>
          </div>
        </div>
      </BentoCard>

      <BentoCard bg="pink" className="p-5 text-center text-white">
        <h3 className="font-display font-black text-xl uppercase">We reply in under 15 min ⚡</h3>
      </BentoCard>

      <ChunkyLink href="/faq" bg="white" size="md" fullWidth>
        Browse FAQ instead
      </ChunkyLink>
    </SchneidersPageShell>
  );
}
