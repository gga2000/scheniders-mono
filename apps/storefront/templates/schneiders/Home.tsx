import Image from "next/image";
import { resolveSchneidersConfig } from "@scheniders/shared";
import { StoreLink } from "@/lib/store-context";
import TestimonialsSection from "@/components/sections/TestimonialsSection";
import FeaturedCarousel from "@/components/sections/FeaturedCarousel";
import NewsletterSection from "@/components/sections/NewsletterSection";
import PromotionBanner from "@/components/sections/PromotionBanner";
import GallerySection from "@/components/sections/GallerySection";
import FAQSection from "@/components/sections/FAQSection";
import PoliciesSection from "@/components/sections/PoliciesSection";
import {
  BentoCard,
  ChunkyLink,
  MaterialIcon,
  ScribbleHeading,
  SectionEyebrow,
  Sticker,
  TrustPill,
  WhatsAppIcon,
} from "@/components/schneiders/primitives";
import { SchneidersPageShell } from "@/components/schneiders/page-shell";
import { SchneidersProductCard } from "@/components/schneiders/product-card";
import { SchneidersDesktopHome } from "@/components/schneiders/desktop-home";
import { formatPrice } from "@/components/schneiders/format";
import type { TemplateHomeProps } from "../registry";

const DEFAULT_SECTIONS_ORDER = ["hero", "trust", "categories", "forYou", "newArrivals", "about"];

const TILE_BG = ["bg-bk-decor-a", "bg-bk-decor-b", "bg-bk-accent", "bg-bk-decor-c"];

export default function SchneidersHome({ tenant, products, categories }: TemplateHomeProps) {
  const hero = tenant.store_config?.hero;
  const about = tenant.store_config?.about;
  const wa = tenant.store_config?.contact?.whatsapp_number ?? null;
  const schn = resolveSchneidersConfig(tenant.store_config?.schneiders);

  const featured = products[0];
  const newArrivals = products.slice(0, 6);
  const reviewProduct = products[1];

  const sectionsOrder = tenant.store_config?.sections_order ?? DEFAULT_SECTIONS_ORDER;
  const sectionConfigs = tenant.store_config?.sections;

  const heroTitle = hero?.title || "Shop with Joy.";
  const heroSubtitle = hero?.subtitle || "Hand-picked goods, delivered in 24h.";
  const heroCta = hero?.cta_text || schn.hero_ctas.primary_label || "Shop Now";
  const testimonial = schn.testimonial;
  const reviewerName = testimonial.reviewer_name ?? "Lina K.";
  const reviewerInitial = (reviewerName.trim()[0] ?? "L").toUpperCase();

  // Wedge-intensity multiplier — scales every rotation across the page so the
  // "none" / "subtle" / "playful" / "wild" config takes effect uniformly.
  const wedgeMul =
    schn.wedge_intensity === "none"
      ? 0
      : schn.wedge_intensity === "subtle"
        ? 0.35
        : schn.wedge_intensity === "wild"
          ? 1.75
          : 1;
  const rot = (deg: number) => `rotate(${(deg * wedgeMul).toFixed(2)}deg)`;
  const phone = tenant.contact_phone ?? null;
  const firstCategorySlug = categories[0]?.slug;
  const secondaryKind = schn.hero_ctas.secondary_kind ?? "whatsapp";

  const sections: Record<string, React.ReactNode> = {
    /* ─────────────── HERO ─────────────── */
    hero: (
      <section key="hero" className="relative">
        <BentoCard bg="white" size="md" className="overflow-hidden p-0 min-h-[320px] flex flex-col justify-between">
          {hero?.image_url ? (
            <Image
              src={hero.image_url}
              alt=""
              fill
              priority
              sizes="(max-width: 768px) 100vw, 480px"
              className="object-cover z-0"
            />
          ) : (
            <div className="absolute inset-0 z-0 bg-gradient-to-br from-bk-primary/80 via-bk-decor-b to-bk-decor-a" />
          )}
          <div className="absolute inset-0 bg-black/35 z-0" />

          {/* Sticker (top-right) */}
          <div className="absolute top-4 right-4 z-10">
            <Sticker bg="butter" rotate={8 * wedgeMul} size="xs">
              New • 26
            </Sticker>
          </div>

          <div className="relative z-10 pt-6 px-6">
            <h1
              className="font-display font-black text-white leading-[0.9] tracking-tighter drop-shadow-[2px_2px_0_#1a1a1a] uppercase"
              style={{ fontSize: "clamp(2.5rem, 11vw, 4.5rem)" }}
            >
              {heroTitle.split(" ").map((word, i) => (
                <span key={i} className="block" style={{ transform: i % 2 === 0 ? rot(-2) : rot(1) }}>
                  {word}
                </span>
              ))}
            </h1>
            {heroSubtitle && (
              <p className="font-body font-bold text-white/90 text-sm mt-3 max-w-[80%] drop-shadow-[1px_1px_0_#1a1a1a]">
                {heroSubtitle}
              </p>
            )}
          </div>

          <div className="relative z-10 flex items-center gap-3 px-6 pb-6 pt-10">
            <ChunkyLink href="#new-arrivals" bg="accent-secondary" size="md" className="flex-grow">
              {heroCta} <MaterialIcon name="shopping_cart" className="text-lg" />
            </ChunkyLink>
            {secondaryKind === "whatsapp" && wa && (
              <a
                href={`https://wa.me/${wa.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                aria-label="WhatsApp"
                className="bento-card-sm bg-white text-bk-ink w-14 h-14 rounded-xl flex items-center justify-center hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none active:translate-y-[2px] active:translate-x-[2px] transition-all"
              >
                <WhatsAppIcon className="w-6 h-6 text-bk-decor-a" />
              </a>
            )}
            {secondaryKind === "call" && phone && (
              <a
                href={`tel:${phone.replace(/\s/g, "")}`}
                aria-label="Call us"
                className="bento-card-sm bg-white text-bk-ink w-14 h-14 rounded-xl flex items-center justify-center hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none active:translate-y-[2px] active:translate-x-[2px] transition-all"
              >
                <MaterialIcon name="call" className="text-2xl" />
              </a>
            )}
            {secondaryKind === "category_link" && firstCategorySlug && (
              <StoreLink
                href={`/categories/${firstCategorySlug}`}
                aria-label={`Browse ${categories[0]?.name ?? "category"}`}
                className="bento-card-sm bg-white text-bk-ink w-14 h-14 rounded-xl flex items-center justify-center hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none active:translate-y-[2px] active:translate-x-[2px] transition-all"
              >
                <MaterialIcon name="grid_view" className="text-2xl" />
              </StoreLink>
            )}
          </div>
        </BentoCard>
      </section>
    ),

    /* ─────────────── TRUST STRIP ─────────────── */
    trust: schn.home_sections.trust_strip !== false ? (
      <section key="trust" className="-mx-4 overflow-hidden">
        <div className="flex gap-3 px-4 overflow-x-auto hide-scrollbar pb-2">
          {schn.trust_pills
            .filter((p) => p.enabled !== false)
            .map((p, i) => (
              <TrustPill
                key={`${p.label}-${i}`}
                bg={p.bg ?? "mint"}
                rotate={i % 2 === 0 ? 1 : -1}
                icon={p.icon ? <MaterialIcon name={p.icon} className="text-lg" /> : undefined}
              >
                {p.label}
              </TrustPill>
            ))}
        </div>
      </section>
    ) : null,

    /* ─────────────── CATEGORIES (interlocking wedges) ─────────────── */
    categories: categories.length > 0 && schn.home_sections.categories !== false ? (
      <section key="categories" className="space-y-4">
        <ScribbleHeading color="lilac">Categories</ScribbleHeading>
        <div className="flex flex-col gap-2 pt-2">
          {categories.slice(0, 4).map((cat, i) => {
            const tint = TILE_BG[i % TILE_BG.length];
            const rotate = i % 2 === 0 ? "-rotate-2" : "rotate-2";
            const overlap = i === 0 ? "" : "-mt-6";
            const isLeft = i % 2 === 0;
            return (
              <StoreLink
                key={cat.id}
                href={`/categories/${cat.slug}`}
                className={`bento-card ${tint} p-6 ${rotate} relative z-${10 - i} ${overlap} hover:-translate-y-1 transition-transform cursor-pointer block`}
              >
                <div className={`flex items-center transform ${isLeft ? "rotate-2" : "-rotate-2"} ${isLeft ? "justify-between" : "justify-between flex-row-reverse"} gap-4`}>
                  <div className={isLeft ? "" : "text-right"}>
                    <span className="bg-white text-bk-ink font-bold text-xs px-3 py-1 rounded-full border-[3px] border-bk-ink shadow-bento-sm w-fit mb-2 inline-block">
                      {i === 0 ? "Explore" : i === 1 ? "New" : i === 2 ? "Trending" : "Hot"}
                    </span>
                    <h3 className="font-display font-black text-3xl text-bk-ink uppercase leading-tight">
                      {cat.name}
                    </h3>
                  </div>
                  {cat.image_url ? (
                    <Image
                      src={cat.image_url}
                      alt={cat.name}
                      width={80}
                      height={80}
                      className="w-20 h-20 rounded-xl border-[3px] border-bk-ink object-cover bg-white shadow-bento-sm shrink-0"
                    />
                  ) : (
                    <MaterialIcon
                      name={i === 0 ? "checkroom" : i === 1 ? "spa" : i === 2 ? "redeem" : "shopping_bag"}
                      className="text-6xl text-bk-ink drop-shadow-[2px_2px_0_#1a1a1a]"
                    />
                  )}
                </div>
              </StoreLink>
            );
          })}
        </div>
      </section>
    ) : null,

    /* ─────────────── FOR YOU (review + suggested) ─────────────── */
    forYou: reviewProduct && schn.home_sections.for_you !== false ? (
      <section key="forYou" className="space-y-4">
        <ScribbleHeading color="sky">For You</ScribbleHeading>
        <div className="relative mt-4">
          {/* Review wedge (top) */}
          {testimonial.enabled !== false && (
            <BentoCard bg="mint" size="md" rotate={-3} className="p-6 z-10">
              <div className="flex items-start gap-3 transform rotate-3">
                <div className="w-12 h-12 rounded-full border-2 border-bk-ink shrink-0 bg-white overflow-hidden flex items-center justify-center font-display font-black text-lg">
                  {testimonial.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={testimonial.avatar_url} alt={reviewerName} className="w-full h-full object-cover" />
                  ) : (
                    reviewerInitial
                  )}
                </div>
                <div className="space-y-1 min-w-0">
                  <p className="font-body font-bold text-sm leading-tight italic">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-[10px] font-display font-black uppercase tracking-widest">— {reviewerName}</span>
                    {testimonial.badge_text && (
                      <Sticker bg="butter" rotate={-6} size="xs">{testimonial.badge_text}</Sticker>
                    )}
                  </div>
                </div>
              </div>
            </BentoCard>
          )}

          {/* Trending product wedge (bottom, interlocking) */}
          <StoreLink
            href={`/products/${reviewProduct.slug ?? reviewProduct.id}`}
            className="block"
          >
            <BentoCard bg="pink" size="md" rotate={3} className="p-6 -mt-8 ml-4">
              <div className="flex justify-between items-center transform -rotate-3 mt-4">
                <div className="text-white min-w-0">
                  <span className="bg-bk-ink text-white font-display font-black text-[10px] px-3 py-1 rounded-full uppercase tracking-tighter mb-1 inline-block">
                    Trending
                  </span>
                  <h4 className="font-display font-black text-xl leading-none uppercase truncate">
                    {reviewProduct.name}
                  </h4>
                  <p className="font-display font-black text-lg mt-1">{formatPrice(reviewProduct.price)}</p>
                </div>
                {reviewProduct.image_url && (
                  <Image
                    src={reviewProduct.image_url}
                    alt={reviewProduct.name}
                    width={80}
                    height={80}
                    className="w-20 h-20 bg-white rounded-xl border-[3px] border-bk-ink rotate-6 object-cover shadow-bento-sm shrink-0"
                  />
                )}
              </div>
            </BentoCard>
          </StoreLink>
        </div>
      </section>
    ) : null,

    /* ─────────────── NEW ARRIVALS ─────────────── */
    newArrivals: schn.home_sections.new_arrivals !== false ? (
      <section key="newArrivals" id="new-arrivals" className="space-y-6">
        <ScribbleHeading color="butter">New Arrivals</ScribbleHeading>

        {newArrivals.length === 0 ? (
          <BentoCard bg="white" className="p-8 text-center">
            <SectionEyebrow>Coming Soon</SectionEyebrow>
            <p className="font-display font-black text-xl mt-3">No products yet</p>
            <p className="font-body text-sm text-bk-ink/60 mt-1">
              Drop us a line on WhatsApp — we&apos;ll let you know when we go live.
            </p>
          </BentoCard>
        ) : (
          <div className="space-y-6">
            {newArrivals.map((product, i) => (
              <SchneidersProductCard
                key={product.id}
                product={product}
                index={i}
                saleSticker={tenant.store_config?.schneiders?.sale_sticker}
              />
            ))}
          </div>
        )}
      </section>
    ) : null,

    /* ─────────────── ABOUT (optional) ─────────────── */
    about: about?.enabled ? (
      <section key="about">
        <BentoCard bg="lilac" size="md" rotate={1} className="p-6">
          <SectionEyebrow className="text-bk-ink/80">{about.title ? "Our Story" : "About"}</SectionEyebrow>
          <h2 className="font-display font-black text-3xl mt-2 mb-3 uppercase leading-tight">
            {about.title || "Made with love."}
          </h2>
          <div
            className="font-body text-sm leading-relaxed prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: about.body || "" }}
          />
        </BentoCard>
      </section>
    ) : null,
  };

  // Dynamic sections (from store_config)
  if (sectionConfigs) {
    for (const sc of sectionConfigs) {
      if (!sc.enabled) continue;
      const data = sc.data;
      switch (sc.type) {
        case "testimonials":
          sections[sc.id] = <TestimonialsSection key={sc.id} data={data} />;
          break;
        case "featured_carousel":
          sections[sc.id] = <FeaturedCarousel key={sc.id} data={data} products={products} />;
          break;
        case "newsletter":
          sections[sc.id] = <NewsletterSection key={sc.id} data={data} tenantId={tenant.id} />;
          break;
        case "promotions":
          sections[sc.id] = <PromotionBanner key={sc.id} data={data} />;
          break;
        case "gallery":
          sections[sc.id] = <GallerySection key={sc.id} data={data} />;
          break;
        case "faq":
          sections[sc.id] = <FAQSection key={sc.id} data={data} />;
          break;
        case "policies":
          sections[sc.id] = <PoliciesSection key={sc.id} data={data} />;
          break;
      }
    }
  }

  return (
    <>
      {/* Mobile — bright cream candy bento, hidden at md+ */}
      <div className="md:hidden">
        <SchneidersPageShell tenant={tenant} categories={categories} cartCount={0}>
          {sectionsOrder.map((id) => sections[id] ?? null)}
        </SchneidersPageShell>
      </div>

      {/* Desktop — bold bento wedge layout, hidden below md */}
      <SchneidersDesktopHome tenant={tenant} products={products} categories={categories} />
    </>
  );
}

/* Marker for the registry to pick up the visual style label */
SchneidersHome.displayName = "SchneidersWedgesHome";
