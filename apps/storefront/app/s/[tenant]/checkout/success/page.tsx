import type { Metadata } from "next";
import { resolveSchneidersConfig } from "@scheniders/shared";
import { notFound } from "next/navigation";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listProducts, listCategories } from "@/lib/queries";
import { resolveV2PageMetadata } from "@/lib/storefront-runtime";

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
  return resolveV2PageMetadata(v2, "checkout_success", v2?.default_locale ?? "ar");
}
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import {
  BentoCard,
  ChunkyLink,
  MaterialIcon,
  ScribbleHeading,
  SectionEyebrow,
  Sticker,
  WhatsAppIcon,
} from "@/components/schneiders/primitives";
import { SchneidersProductCard } from "@/components/schneiders/product-card";

interface Props {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ order?: string }>;
}

export default async function CheckoutSuccessPage({ params, searchParams }: Props) {
  const { tenant: tenantParam } = await params;
  const { order } = await searchParams;
  const tenant = tenantParam.startsWith("__domain__")
    ? await getTenantByCustomDomain(tenantParam.replace("__domain__", ""))
    : await getTenantBySlug(tenantParam);

  if (!tenant) notFound();

  // NB: checkout_success deliberately bypasses the generic V2 page composition.
  // The default V2 "checkout_success" config is a generic cta_banner +
  // feature_grid + product_grid that lacks the celebratory hero, order number,
  // the "we'll call you" reassurance and the what-happens-next steps. The rich
  // confirmation below (a tenant-agnostic confirmation flow) is the faithful
  // Candy Bento thank-you, so we always render it.
  {
    const [related, categories] = await Promise.all([
      listProducts(tenant.id, { limit: 4 }),
      listCategories(tenant.id),
    ]);
    const wa = tenant.store_config?.contact?.whatsapp_number ?? null;
    const schn = resolveSchneidersConfig(tenant.store_config?.schneiders);
    const callWithin = schn.order_confirm.call_within_min ?? 30;
    const locale = tenant.store_config_v2?.default_locale ?? "ar";
    const t = locale === "ar";
    const thankYouSubheadline =
      schn.order_confirm.thank_you_subheadline ??
      (t
        ? `سنتصل بك خلال ${callWithin} دقيقة لتأكيد عنوانك ووقت التوصيل.`
        : `We'll call you within ${callWithin} minutes to confirm your address and delivery time.`);

    return (
      <SchneidersPageShell
        tenant={tenant}
        categories={categories}
        hideBottomBar
        promo={
          t
            ? `🎉 تم استلام طلبك! سنتصل بك خلال ${callWithin} دقيقة ✨`
            : `🎉 Order placed! We'll call you within ${callWithin} minutes ✨`
        }
      >
        {/* Celebration */}
        <BentoCard bg="mint" rotate={-1} className="p-8 text-center relative">
          <div className="absolute top-3 left-3">
            <Sticker bg="butter" rotate={-8} size="xs">🎉</Sticker>
          </div>
          <div className="text-6xl mb-3" style={{ transform: "rotate(-6deg)" }}>🎉</div>
          <ScribbleHeading color="butter" as="h1">
            {t ? "تم الطلب!" : "Order Placed!"}
          </ScribbleHeading>
          {order && (
            <p className="mt-3 inline-block bg-white border-[3px] border-candy-ink rounded-full px-4 py-1 font-display font-black uppercase text-sm">
              # {order}
            </p>
          )}
        </BentoCard>

        {/* Reassurance */}
        <BentoCard bg="lilac" rotate={1} className="p-5">
          <div className="flex items-start gap-3">
            <MaterialIcon name="call" className="text-3xl drop-shadow-[2px_2px_0px_#1a1a1a]" />
            <div>
              <h2 className="font-display font-black text-xl uppercase">
                {t
                  ? `سنتصل بك خلال ${callWithin} دقيقة`
                  : `We'll call you within ${callWithin} minutes`}
              </h2>
              <p className="font-body text-sm mt-1">
                {thankYouSubheadline}
              </p>
            </div>
          </div>
        </BentoCard>

        {/* What happens next */}
        <section className="space-y-3">
          <ScribbleHeading color="sky" as="h2">{t ? "ما التالي" : "What's next"}</ScribbleHeading>
          {(t
            ? [
                { num: 1, bg: "mint", title: "نتصل للتأكيد", body: `عادةً خلال ${callWithin} دقيقة.` },
                { num: 2, bg: "butter", title: "نجهّز الشحن", body: "يغادر طلبك المستودع في نفس اليوم." },
                { num: 3, bg: "pink", title: "تستلم وتدفع نقداً", body: "افحص ثمّ ادفع لمندوب التوصيل." },
              ]
            : [
                { num: 1, bg: "mint", title: "We call to confirm", body: `Usually within ${callWithin} min.` },
                { num: 2, bg: "butter", title: "We dispatch", body: "Order leaves the warehouse same day." },
                { num: 3, bg: "pink", title: "You receive & pay cash", body: "Inspect, then pay the delivery hero." },
              ]
          ).map((step, i) => (
            <BentoCard key={step.num} bg={step.bg as "mint" | "butter" | "pink"} rotate={i % 2 === 0 ? 1 : -1} className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white border-[3px] border-candy-ink flex items-center justify-center font-display font-black text-lg shadow-bento-sm shrink-0">
                  {step.num}
                </div>
                <div>
                  <p className="font-display font-black uppercase text-base">{step.title}</p>
                  <p className="font-body text-sm">{step.body}</p>
                </div>
              </div>
            </BentoCard>
          ))}
        </section>

        {/* Save your order */}
        <BentoCard bg="sky" rotate={-1} className="p-5 text-center">
          <SectionEyebrow>{t ? "احفظه لوقت لاحق" : "Save it for later"}</SectionEyebrow>
          <h3 className="font-display font-black text-xl uppercase mt-1 mb-3">
            {t ? "تابع عبر واتساب" : "Track on WhatsApp"}
          </h3>
          {wa ? (
            <a
              href={`https://wa.me/${wa.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi! I'd like updates on order #${order ?? ""}`)}`}
              target="_blank"
              rel="noreferrer"
              className="bento-card bg-candy-mint text-candy-ink font-display font-black text-base px-5 py-3 inline-flex items-center gap-2 hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all rounded-xl uppercase tracking-tight"
            >
              <WhatsAppIcon className="w-5 h-5" />
              {t ? "افتح واتساب" : "Open WhatsApp"}
            </a>
          ) : (
            <ChunkyLink href={`/track${order ? `?order=${order}` : ""}`} bg="mint" size="md">
              {t ? "تتبّع الطلب" : "Track order"}
            </ChunkyLink>
          )}
        </BentoCard>

        {/* Recommended */}
        {related.length > 0 && (
          <section className="space-y-4">
            <ScribbleHeading color="butter" as="h2">{t ? "قد يعجبك أيضاً" : "You may also like"}</ScribbleHeading>
            <div className="grid grid-cols-2 gap-4">
              {related.map((p, i) => (
                <SchneidersProductCard key={p.id} product={p} index={i} saleSticker={schn.sale_sticker} />
              ))}
            </div>
          </section>
        )}

        {/* Continue shopping */}
        <ChunkyLink href="/" bg="pink" size="lg" fullWidth>
          {t ? "متابعة التسوّق" : "Continue shopping"}{" "}
          <MaterialIcon name="arrow_forward" className="text-xl" />
        </ChunkyLink>
      </SchneidersPageShell>
    );
  }
}
