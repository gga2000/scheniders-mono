import { StoreHeader } from "@/components/storefront/StoreHeader";
import { StoreFooter } from "@/components/storefront/StoreFooter";
import { ProductCard } from "@/components/storefront/ProductCard";
import { Zap, Shield, Truck } from "lucide-react";
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

export default function ElectronicsHome({ tenant, products, categories }: TemplateHomeProps) {
  const hero = tenant.store_config?.hero;
  const about = tenant.store_config?.about;
  const sectionsOrder = tenant.store_config?.sections_order ?? DEFAULT_SECTIONS_ORDER;
  const sectionConfigs = tenant.store_config?.sections;

  // Built-in sections
  const sections: Record<string, React.ReactNode> = {
    hero: (
      <section key="hero" className="relative py-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-transparent to-purple-600/20" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-5xl md:text-6xl font-bold mb-4 leading-tight">
              {hero?.title ?? "أحدث التقنيات بين يديك"}
            </h1>
            <p className="text-xl text-zinc-300 mb-8">
              {hero?.subtitle ?? "إلكترونيات أصلية وضمان موثوق"}
            </p>
            <a
              href="#products"
              className="inline-block bg-blue-500 text-white px-8 py-4 rounded font-bold hover:bg-blue-600 transition"
            >
              {hero?.cta_text ?? "تسوّق الآن"}
            </a>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FeatureCard icon={<Zap />} label="شحن سريع" />
            <FeatureCard icon={<Shield />} label="ضمان أصلي" />
            <FeatureCard icon={<Truck />} label="توصيل مجاني" />
          </div>
        </div>
      </section>
    ),

    products: (
      <section key="products" id="products" className="py-16 flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold mb-8">المنتجات المميزة</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>
    ),

    about: about?.enabled ? (
      <section key="about" className="py-16 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-6">{about.title || "من نحن"}</h2>
          <div className="text-zinc-400 leading-relaxed text-lg prose prose-sm max-w-none prose-invert" dangerouslySetInnerHTML={{ __html: about.body || "" }} />
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
    <div className="min-h-screen flex flex-col bg-zinc-950 text-white">
      <StoreHeader tenant={tenant} categories={categories} />

      {sectionsOrder.map((id) => sections[id] ?? null)}

      <StoreFooter tenant={tenant} />
    </div>
  );
}

function FeatureCard({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-center">
      <div className="text-blue-500 mb-2 flex justify-center">{icon}</div>
      <div className="text-sm font-medium">{label}</div>
    </div>
  );
}
