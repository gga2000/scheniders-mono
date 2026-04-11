import { StoreLink } from "@/lib/store-context";
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

const DEFAULT_SECTIONS_ORDER = ["hero", "categories", "products", "about"];

export default function GeneralHome({ tenant, products, categories }: TemplateHomeProps) {
  const hero = tenant.store_config?.hero;
  const about = tenant.store_config?.about;
  const sectionsOrder = tenant.store_config?.sections_order ?? DEFAULT_SECTIONS_ORDER;
  const sectionConfigs = tenant.store_config?.sections;

  // Built-in sections
  const sections: Record<string, React.ReactNode> = {
    hero: (
      <section key="hero" className="relative bg-gradient-to-br from-brand-primary to-brand-secondary text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-4">
            {hero?.title ?? `أهلاً بك في ${tenant.business_name}`}
          </h1>
          <p className="text-lg md:text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            {hero?.subtitle ?? "تسوّق أحدث المنتجات بأفضل الأسعار"}
          </p>
          <a
            href="#products"
            className="inline-block bg-white text-brand-primary px-8 py-3 rounded-lg font-bold hover:scale-105 transition"
          >
            {hero?.cta_text ?? "تسوّق الآن"}
          </a>
        </div>
      </section>
    ),

    categories: categories.length > 0 ? (
      <section key="categories" className="py-12 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold mb-6 text-zinc-900">الأقسام</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {categories.map((cat) => (
              <StoreLink
                key={cat.id}
                href={`/categories/${cat.slug}`}
                className="aspect-square bg-zinc-100 rounded-lg flex items-center justify-center text-center px-2 hover:bg-brand-primary hover:text-white transition"
              >
                <span className="font-medium">{cat.name}</span>
              </StoreLink>
            ))}
          </div>
        </div>
      </section>
    ) : null,

    products: (
      <section key="products" id="products" className="py-12 flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold mb-6 text-zinc-900">منتجاتنا</h2>
          {products.length === 0 ? (
            <div className="text-center py-12 text-zinc-500">
              لا توجد منتجات متاحة حالياً
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </section>
    ),

    about: about?.enabled ? (
      <section key="about" className="py-12 px-4 max-w-4xl mx-auto text-center">
        <h2 className="text-2xl font-bold mb-4">{about.title || "من نحن"}</h2>
        <div className="text-zinc-600 leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: about.body || "" }} />
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
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <StoreHeader tenant={tenant} categories={categories} />

      {sectionsOrder.map((id) => sections[id] ?? null)}

      <StoreFooter tenant={tenant} />
    </div>
  );
}
