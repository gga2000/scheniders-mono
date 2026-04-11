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

const DEFAULT_SECTIONS_ORDER = ["hero", "products", "about"];

export default function BeautyHome({ tenant, products, categories }: TemplateHomeProps) {
  const hero = tenant.store_config?.hero;
  const about = tenant.store_config?.about;
  const sectionsOrder = tenant.store_config?.sections_order ?? DEFAULT_SECTIONS_ORDER;
  const sectionConfigs = tenant.store_config?.sections;

  // Built-in sections
  const sections: Record<string, React.ReactNode> = {
    hero: (
      <section key="hero" className="py-24 text-center">
        <div className="max-w-3xl mx-auto px-6">
          <p className="text-xs uppercase tracking-[0.3em] text-rose-400 mb-4">
            {tenant.business_name}
          </p>
          <h1 className="text-5xl md:text-6xl font-serif font-light text-zinc-900 mb-6">
            {hero?.title ?? "جمال طبيعي، ثقة لا متناهية"}
          </h1>
          <p className="text-lg text-zinc-600 mb-10 leading-relaxed">
            {hero?.subtitle ??
              "منتجات عناية وتجميل مختارة بعناية لكِ"}
          </p>
          <a
            href="#products"
            className="inline-block bg-zinc-900 text-white px-12 py-4 rounded-full font-medium hover:bg-rose-500 transition"
          >
            {hero?.cta_text ?? "اكتشفي المجموعة"}
          </a>
        </div>
      </section>
    ),

    products: (
      <section key="products" id="products" className="py-16 bg-white flex-1">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-serif text-zinc-900">منتجاتنا</h2>
            <div className="w-12 h-0.5 bg-rose-400 mx-auto mt-3" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>
    ),

    about: about?.enabled ? (
      <section key="about" className="py-16 bg-rose-50">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-serif text-zinc-900 mb-4">{about.title || "من نحن"}</h2>
          <div className="w-12 h-0.5 bg-rose-400 mx-auto mb-6" />
          <div className="text-zinc-600 leading-relaxed text-lg prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: about.body || "" }} />
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
    <div className="min-h-screen flex flex-col bg-rose-50">
      <StoreHeader tenant={tenant} categories={categories} />

      {sectionsOrder.map((id) => sections[id] ?? null)}

      <StoreFooter tenant={tenant} />
    </div>
  );
}
