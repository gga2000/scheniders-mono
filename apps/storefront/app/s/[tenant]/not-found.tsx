import Link from "next/link";
import { headers } from "next/headers";
import { normalizeIraqiMobile, resolveI18n } from "@scheniders/shared";
import type { I18nString, LocaleCode } from "@scheniders/shared";
import { getTenantBySlug, getTenantByCustomDomain } from "@/lib/tenant";
import { listCategories, listProducts } from "@/lib/queries";
import {
  buildRuntimeContext,
  pickV2Page,
  resolveTenantKeyFromHeaders,
} from "@/lib/storefront-runtime";
import { V2Page } from "@/components/v2-page";
import type { Tenant } from "@/lib/types";

/** Same fallback chain as proxy.ts, which owns the subdomain → tenant
 *  mapping; the 404 has to undo it from the host header. */
const ROOT_DOMAIN =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ||
  process.env.NEXT_PUBLIC_DEV_ROOT_DOMAIN ||
  "localhost:3001";

/** Products a merchant-authored 404 page may draw on (a grid seeded there
 *  should not be empty), without paying for the catalogue on every miss. */
const NOT_FOUND_PRODUCT_POOL = 8;

const COPY = {
  eyebrow: { ar: "خطأ ٤٠٤", en: "Error 404" },
  title: { ar: "الصفحة غير موجودة", en: "Page not found" },
  body: {
    ar: "ربما انتقلت الصفحة أو لم تعد متاحة. تقدر ترجع للرئيسية أو تتصفح كل المنتجات.",
    en: "Maybe it moved, or it no longer exists. Head home or browse all products.",
  },
  home: { ar: "الرئيسية", en: "Home" },
  products: { ar: "كل المنتجات", en: "All products" },
  whatsapp: { ar: "تواصل معنا عبر واتساب", en: "Message us on WhatsApp" },
} satisfies Record<string, I18nString>;

function resolveTenant(tenantKey: string): Promise<Tenant | null> {
  return tenantKey.startsWith("__domain__")
    ? getTenantByCustomDomain(tenantKey.replace("__domain__", ""))
    : getTenantBySlug(tenantKey);
}

/** `wa.me` needs the international digits; anything that is not an Iraqi
 *  mobile gets no link rather than a dead one. */
function whatsappHref(raw: string | null | undefined): string | null {
  const local = normalizeIraqiMobile(raw);
  return local ? `https://wa.me/964${local.slice(1)}` : null;
}

const PILL =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 px-6 py-3 font-display text-base font-bold " +
  "transition-[transform,box-shadow,opacity] duration-150 motion-reduce:transition-none hover:opacity-90 active:scale-[0.98]";

/**
 * Localised, token-styled 404 body. Used inside the V2 chrome when the tenant
 * has no `not_found` page, and bare for pre-V2 tenants.
 */
function NotFoundFallback({
  locale,
  base,
  whatsapp,
}: {
  locale: LocaleCode;
  base: string;
  whatsapp: string | null;
}) {
  const t = (s: I18nString) => resolveI18n(s, locale);
  return (
    <main className="px-4 py-bk-section">
      <div
        className="mx-auto max-w-md p-bk-lg text-center sm:p-bk-xl"
        style={{
          backgroundColor: "var(--bk-surface-alt, #f7f4ee)",
          borderRadius: "var(--bk-radius-card, 1rem)",
          color: "var(--bk-ink, #1a1a1a)",
        }}
      >
        <p className="font-label text-[11px] font-bold bk-caps tracking-[0.2em] text-bk-ink-soft">
          {t(COPY.eyebrow)}
        </p>
        <h1
          className="mt-bk-xs font-display text-bk-h1 font-black text-balance"
          style={{ fontFamily: "var(--bk-font-display, inherit)" }}
        >
          {t(COPY.title)}
        </h1>
        <p className="mx-auto mt-bk-xs max-w-prose font-body text-base text-pretty text-bk-ink-soft">
          {t(COPY.body)}
        </p>
        <div className="mt-bk-lg flex flex-col gap-bk-xs">
          <Link
            href={`${base}/`}
            className={PILL}
            style={{
              backgroundColor: "var(--bk-primary, #ff5a8a)",
              color: "var(--bk-on-primary, #ffffff)",
              borderRadius: "var(--bk-radius-pill, 9999px)",
              boxShadow: "var(--bk-shadow-button, 2px 2px 0px 0px #1a1a1a)",
              fontFamily: "var(--bk-font-display, inherit)",
            }}
          >
            {t(COPY.home)}
          </Link>
          <Link
            href={`${base}/products`}
            className={PILL}
            style={{
              backgroundColor: "var(--bk-surface, #ffffff)",
              color: "var(--bk-ink, #1a1a1a)",
              border:
                "var(--bk-border-thickness, 3px) solid var(--bk-ink, #1a1a1a)",
              borderRadius: "var(--bk-radius-pill, 9999px)",
              fontFamily: "var(--bk-font-display, inherit)",
            }}
          >
            {t(COPY.products)}
          </Link>
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center font-label text-sm font-bold underline underline-offset-4 text-bk-ink-soft hover:text-bk-ink"
            >
              {t(COPY.whatsapp)}
            </a>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * Tenant-scoped 404 (P1-10). `not-found.tsx` gets no params, so the tenant
 * is recovered from the headers proxy.ts sets: `x-store-base` (`/s/<slug>`
 * in path mode) or the host (`<slug>.<root>` / a custom domain). Next adds
 * the `noindex` robots meta to every not-found render on its own.
 *
 * Renders the merchant's V2 `not_found` page in the brand chrome when one
 * exists; otherwise the localised fallback above — inside the chrome for V2
 * tenants, bare for legacy ones.
 */
export default async function NotFound() {
  const h = await headers();
  const storeBase = h.get("x-store-base");
  const tenantKey = resolveTenantKeyFromHeaders({
    storeBase,
    host: h.get("x-forwarded-host") ?? h.get("host"),
    rootDomain: ROOT_DOMAIN,
  });
  const tenant = tenantKey ? await resolveTenant(tenantKey) : null;
  const v2 = tenant?.store_config_v2 ?? null;
  const base = storeBase ?? (tenantKey ? `/s/${tenantKey}` : "");
  const whatsapp = whatsappHref(tenant?.store_config?.contact?.whatsapp_number);

  // No tenant (root host / unknown key) or a pre-V2 tenant: bare fallback in
  // the store's default language.
  if (!tenant || !v2) {
    return <NotFoundFallback locale="ar" base={base} whatsapp={whatsapp} />;
  }

  const [products, categories] = await Promise.all([
    listProducts(tenant.id, { limit: NOT_FOUND_PRODUCT_POOL }),
    listCategories(tenant.id),
  ]);
  const runtime = buildRuntimeContext({
    pageId: "not_found",
    locale: v2.default_locale ?? "ar",
    now: new Date(),
  });
  const page = pickV2Page(v2, "not_found");

  return (
    <V2Page
      v2={v2}
      page={page ?? { page_id: "not_found", sections: [] }}
      runtime={runtime}
      renderCtx={{ tenant, products, categories }}
      lead={
        page
          ? undefined
          : (rt) => (
              <NotFoundFallback
                locale={rt.locale}
                base={base}
                whatsapp={whatsapp}
              />
            )
      }
    />
  );
}
