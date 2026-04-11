import Image from "next/image";
import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { ProductCard } from "@/components/storefront/ProductCard";
import TestimonialsSection from "@/components/sections/TestimonialsSection";
import FeaturedCarousel from "@/components/sections/FeaturedCarousel";
import NewsletterSection from "@/components/sections/NewsletterSection";
import PromotionBanner from "@/components/sections/PromotionBanner";
import GallerySection from "@/components/sections/GallerySection";
import FAQSection from "@/components/sections/FAQSection";
import PoliciesSection from "@/components/sections/PoliciesSection";
import type { TemplateHomeProps } from "../registry";
import type { SectionConfig } from "@scheniders/shared";

const DEFAULT_SECTIONS_ORDER = ["hero", "featured", "products", "about"];

export default function FashionHome({ tenant, products, categories }: TemplateHomeProps) {
  const hero = tenant.store_config?.hero;
  const about = tenant.store_config?.about;
  const sectionsOrder = tenant.store_config?.sections_order ?? DEFAULT_SECTIONS_ORDER;
  const sectionConfigs = tenant.store_config?.sections;
  const featured = products.slice(0, 4);
  const rest = products.slice(4);

  // Built-in sections
  const sections: Record<string, React.ReactNode> = {
    hero: (
      <section key="hero" className="relative h-[70vh] min-h-[500px] flex items-end overflow-hidden">
        {hero?.image_url && (
          <Image
            src={hero.image_url}
            alt=""
            fill
            priority
            className="object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 text-white">
          <h1 className="text-5xl md:text-7xl font-bold mb-4 tracking-tight">
            {hero?.title ?? "مجموعة جديدة"}
          </h1>
          <p className="text-xl opacity-90 mb-6 max-w-md">
            {hero?.subtitle ?? "اكتشف أحدث صيحات الموضة"}
          </p>
          <a
            href="#products"
            className="inline-block border-2 border-white px-10 py-3 font-medium hover:bg-white hover:text-black transition"
          >
            {hero?.cta_text ?? "تسوّق المجموعة"}
          </a>
        </div>
      </section>
    ),

    featured: featured.length > 0 ? (
      <section key="featured" className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center tracking-tight">
            الأكثر طلباً
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {featured.map((p) => (
              <ProductCard key={p.id} product={p} variant="elegant" />
            ))}
          </div>
        </div>
      </section>
    ) : null,

    products: (
      <section key="products" id="products" className="py-12 bg-zinc-50 flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold mb-8 tracking-tight">جميع المنتجات</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {rest.map((p) => (
              <ProductCard key={p.id} product={p} variant="elegant" />
            ))}
          </div>
        </div>
      </section>
    ),

    about: about?.enabled ? (
      <section key="about" className="py-16 bg-zinc-900 text-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6 tracking-tight">{about.title || "من نحن"}</h2>
          <div className="text-zinc-300 leading-relaxed text-lg prose prose-sm max-w-none prose-invert" dangerouslySetInnerHTML={{ __html: about.body || "" }} />
        </div>
      </section>
    ) : null,
  };

  // Dynamic sections from store_config.sections
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
    <div className="min-h-screen flex flex-col bg-white">
      <StoreHeader tenant={tenant} categories={categories} variant="elegant" />

      {sectionsOrder.map((id) => sections[id] ?? null)}

      <StoreFooter tenant={tenant} />
    </div>
  );
}
