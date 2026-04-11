"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  ShoppingBag,
  Grid3X3,
  Phone,
  Mail,
  MapPin,
  Star,
  ChevronDown,
  Send,
  Clock,
  Image as ImageIcon,
} from "lucide-react";
import type { StoreConfig, SectionConfig } from "@scheniders/shared";

interface StorePreviewRendererProps {
  config: StoreConfig;
  businessName: string;
}

const DEFAULT_SECTIONS_ORDER = ["hero", "products", "categories", "about"];

function StorePreviewRendererInner({
  config,
  businessName,
}: StorePreviewRendererProps) {
  const brandColor = config.design_tokens?.colors?.primary ?? "#3b82f6";
  const sectionsOrder = config.sections_order ?? DEFAULT_SECTIONS_ORDER;

  const sectionRenderers: Record<string, () => React.ReactNode> = {
    hero: () => <HeroSection key="hero" config={config} businessName={businessName} brandColor={brandColor} />,
    products: () => <ProductsSection key="products" brandColor={brandColor} />,
    categories: () => <CategoriesSection key="categories" brandColor={brandColor} />,
    about: () => <AboutSection key="about" config={config} />,
  };

  // Add dynamic sections from config.sections
  if (config.sections) {
    for (const sc of config.sections) {
      if (!sc.enabled) continue;
      sectionRenderers[sc.id] = () => <DynamicSectionPreview key={sc.id} section={sc} brandColor={brandColor} />;
    }
  }

  return (
    <div
      className="flex min-h-full flex-col bg-white text-gray-900"
      dir="auto"
      style={{ fontFamily: "'Inter', 'Noto Sans Arabic', sans-serif" }}
    >
      {/* Header */}
      <Header config={config} businessName={businessName} brandColor={brandColor} />

      {/* Sections rendered in config order */}
      <main className="flex-1">
        {sectionsOrder.map((section) => {
          const renderer = sectionRenderers[section];
          return renderer ? renderer() : null;
        })}
      </main>

      {/* Footer */}
      <Footer businessName={businessName} brandColor={brandColor} />
    </div>
  );
}

/* ---------- Header ---------- */

function Header({
  config,
  businessName,
  brandColor,
}: {
  config: StoreConfig;
  businessName: string;
  brandColor: string;
}) {
  return (
    <header
      className="flex items-center justify-between border-b border-gray-100 px-5 py-3"
      style={{ backgroundColor: "white" }}
    >
      <div className="flex items-center gap-2">
        {config.logo_url ? (
          <img
            src={config.logo_url}
            alt={businessName}
            className="h-8 w-8 rounded-md object-contain"
          />
        ) : (
          <div
            className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold text-white"
            style={{ backgroundColor: brandColor }}
          >
            {businessName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-sm font-semibold text-gray-900">
          {businessName}
        </span>
      </div>

      <nav className="flex items-center gap-4">
        <span className="text-xs text-gray-400">Shop</span>
        <span className="text-xs text-gray-400">About</span>
        <span className="text-xs text-gray-400">Contact</span>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{ backgroundColor: `${brandColor}15` }}
        >
          <ShoppingBag className="h-3.5 w-3.5" style={{ color: brandColor }} />
        </div>
      </nav>
    </header>
  );
}

/* ---------- Hero Section ---------- */

function HeroSection({
  config,
  businessName,
  brandColor,
}: {
  config: StoreConfig;
  businessName: string;
  brandColor: string;
}) {
  const title = config.hero?.title || `Welcome to ${businessName}`;
  const subtitle = config.hero?.subtitle || "Discover our latest collection";
  const ctaText = config.hero?.cta_text || "Shop Now";
  const hasImage = !!config.hero?.image_url;

  return (
    <section
      className="relative flex min-h-[260px] flex-col items-center justify-center overflow-hidden px-6 py-14 text-center"
      style={
        hasImage
          ? undefined
          : {
              background: `linear-gradient(135deg, ${brandColor}, ${adjustBrightness(brandColor, -30)})`,
            }
      }
    >
      {/* Background image with overlay */}
      {hasImage && (
        <>
          <img
            src={config.hero!.image_url!}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${brandColor}cc, ${adjustBrightness(brandColor, -30)}99)`,
            }}
          />
        </>
      )}

      <div className="relative z-10 max-w-lg">
        <h1 className="mb-3 text-2xl font-bold leading-tight text-white sm:text-3xl">
          {title}
        </h1>
        <p className="mb-6 text-sm text-white/80">{subtitle}</p>
        <button
          className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold shadow-md transition-transform hover:scale-105"
          style={{ color: brandColor }}
        >
          {ctaText}
        </button>
      </div>
    </section>
  );
}

/* ---------- Products Section ---------- */

function ProductsSection({ brandColor }: { brandColor: string }) {
  return (
    <section className="px-5 py-10">
      <h2 className="mb-6 text-lg font-bold text-gray-900">Products</h2>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-gray-100">
            {/* Placeholder image */}
            <div className="relative aspect-square overflow-hidden bg-gray-100">
              <div className="absolute inset-0 animate-pulse bg-linear-to-r from-gray-100 via-gray-200 to-gray-100" />
            </div>
            <div className="space-y-2 p-3">
              <div className="h-3 w-3/4 rounded bg-gray-100" />
              <div className="h-3 w-1/2 rounded" style={{ backgroundColor: `${brandColor}20` }} />
            </div>
          </div>
        ))}
      </div>

    </section>
  );
}

/* ---------- Categories Section ---------- */

function CategoriesSection({ brandColor }: { brandColor: string }) {
  const placeholderCategories = ["New Arrivals", "Best Sellers", "Featured", "On Sale"];

  return (
    <section className="px-5 py-8">
      <h2 className="mb-5 text-lg font-bold text-gray-900">Categories</h2>
      <div className="flex flex-wrap gap-2">
        {placeholderCategories.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-medium transition-colors"
            style={{
              borderColor: `${brandColor}30`,
              color: brandColor,
              backgroundColor: `${brandColor}08`,
            }}
          >
            <Grid3X3 className="h-3 w-3" />
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ---------- About Section ---------- */

function AboutSection({ config }: { config: StoreConfig }) {
  if (!config.about?.enabled) return null;

  return (
    <section className="border-t border-gray-100 px-5 py-10">
      <h2 className="mb-4 text-lg font-bold text-gray-900">
        {config.about.title || "About Us"}
      </h2>
      <div className="max-w-xl text-sm leading-relaxed text-gray-600 prose prose-sm" dangerouslySetInnerHTML={{ __html: config.about.body || "Learn more about our story and mission." }} />
    </section>
  );
}

/* ---------- Footer ---------- */

function Footer({
  businessName,
  brandColor,
}: {
  businessName: string;
  brandColor: string;
}) {
  return (
    <footer className="border-t border-gray-100 bg-gray-50 px-5 py-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-sm font-semibold text-gray-700">{businessName}</span>
        <div className="flex items-center gap-4 text-gray-400">
          <Phone className="h-3.5 w-3.5" />
          <Mail className="h-3.5 w-3.5" />
          <MapPin className="h-3.5 w-3.5" />
        </div>
        <span className="text-[10px] text-gray-400">
          Powered by{" "}
          <span className="font-medium" style={{ color: brandColor }}>
            Scheniders
          </span>
        </span>
      </div>
    </footer>
  );
}

/* ---------- Dynamic Section Preview ---------- */

function DynamicSectionPreview({ section, brandColor }: { section: SectionConfig; brandColor: string }) {
  const data = section.data as Record<string, unknown> | undefined;

  switch (section.type) {
    case "testimonials":
      return <TestimonialsPreview data={data} brandColor={brandColor} />;
    case "featured_carousel":
      return <FeaturedCarouselPreview brandColor={brandColor} />;
    case "newsletter":
      return <NewsletterPreview data={data} brandColor={brandColor} />;
    case "promotions":
      return <PromotionsPreview data={data} />;
    case "gallery":
      return <GalleryPreview data={data} />;
    case "faq":
      return <FAQPreview data={data} />;
    case "policies":
      return <PoliciesPreview />;
    default:
      return null;
  }
}

function TestimonialsPreview({ data, brandColor }: { data?: Record<string, unknown>; brandColor: string }) {
  const testimonials = (data?.testimonials as Array<{ name?: string; quote?: string; rating?: number }>) ?? [];
  const filled = testimonials.filter((t) => t.name || t.quote);

  return (
    <section className="border-t border-gray-100 px-5 py-8">
      <h2 className="mb-5 text-lg font-bold text-gray-900">What Our Customers Say</h2>
      <div className="grid grid-cols-1 gap-3">
        {(filled.length > 0 ? filled.slice(0, 3) : [{ name: "Customer", quote: "Great products!", rating: 5 }]).map((t, i) => (
          <div key={i} className="rounded-xl border border-gray-100 p-4">
            <div className="mb-2 flex items-center gap-1">
              {Array.from({ length: t.rating ?? 5 }).map((_, j) => (
                <Star key={j} className="h-3 w-3 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <p className="mb-2 text-xs text-gray-600 italic">&ldquo;{t.quote}&rdquo;</p>
            <p className="text-xs font-semibold" style={{ color: brandColor }}>{t.name}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeaturedCarouselPreview({ brandColor }: { brandColor: string }) {
  return (
    <section className="border-t border-gray-100 px-5 py-8">
      <h2 className="mb-5 text-lg font-bold text-gray-900">Featured Products</h2>
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="w-32 shrink-0 overflow-hidden rounded-xl border border-gray-100">
            <div className="aspect-square bg-gray-100" />
            <div className="space-y-1.5 p-2">
              <div className="h-2.5 w-3/4 rounded bg-gray-100" />
              <div className="h-2.5 w-1/2 rounded" style={{ backgroundColor: `${brandColor}20` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NewsletterPreview({ data, brandColor }: { data?: Record<string, unknown>; brandColor: string }) {
  const title = (data?.title as string) || "Stay Updated";
  const description = (data?.description as string) || "Subscribe to our newsletter";
  const buttonText = (data?.button_text as string) || "Subscribe";

  return (
    <section className="border-t border-gray-100 px-5 py-8 text-center" style={{ backgroundColor: `${brandColor}08` }}>
      <h2 className="mb-2 text-lg font-bold text-gray-900">{title}</h2>
      <p className="mb-4 text-xs text-gray-500">{description}</p>
      <div className="mx-auto flex max-w-xs items-center gap-2">
        <div className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-[10px] text-gray-400">
          email@example.com
        </div>
        <button
          className="flex items-center gap-1 rounded-lg px-3 py-2 text-[10px] font-semibold text-white"
          style={{ backgroundColor: brandColor }}
        >
          <Send className="h-2.5 w-2.5" />
          {buttonText}
        </button>
      </div>
    </section>
  );
}

function PromotionsPreview({ data }: { data?: Record<string, unknown> }) {
  const text = (data?.banner_text as string) || "Special Offer!";
  const bgColor = (data?.background_color as string) || "#ef4444";
  const hasCountdown = !!(data?.countdown_end as string);

  return (
    <section className="px-5 py-4 text-center text-white" style={{ backgroundColor: bgColor }}>
      <p className="text-sm font-bold">{text}</p>
      {hasCountdown && (
        <div className="mt-1 flex items-center justify-center gap-1 text-[10px] opacity-80">
          <Clock className="h-3 w-3" />
          <span>Limited time offer</span>
        </div>
      )}
    </section>
  );
}

function GalleryPreview({ data }: { data?: Record<string, unknown> }) {
  const images = (data?.images as string[]) ?? [];
  const hasImages = images.length > 0;

  return (
    <section className="border-t border-gray-100 px-5 py-8">
      <h2 className="mb-4 text-lg font-bold text-gray-900">Gallery</h2>
      <div className="grid grid-cols-3 gap-2">
        {(hasImages ? images.slice(0, 6) : Array.from({ length: 6 })).map((img, i) => (
          <div key={i} className="aspect-square overflow-hidden rounded-lg bg-gray-100">
            {typeof img === "string" ? (
              <img src={img} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <ImageIcon className="h-4 w-4 text-gray-300" />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function FAQPreview({ data }: { data?: Record<string, unknown> }) {
  const items = (data?.items as Array<{ question?: string; answer?: string }>) ?? [];
  const filled = items.filter((q) => q.question);
  const display = filled.length > 0 ? filled.slice(0, 3) : [
    { question: "What is your return policy?", answer: "..." },
    { question: "How long does shipping take?", answer: "..." },
  ];

  return (
    <section className="border-t border-gray-100 px-5 py-8">
      <h2 className="mb-4 text-lg font-bold text-gray-900">FAQ</h2>
      <div className="space-y-2">
        {display.map((item, i) => (
          <div key={i} className="rounded-lg border border-gray-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-800">{item.question}</span>
              <ChevronDown className="h-3 w-3 text-gray-400" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PoliciesPreview() {
  return (
    <section className="border-t border-gray-100 px-5 py-8">
      <h2 className="mb-4 text-lg font-bold text-gray-900">Store Policies</h2>
      <div className="flex gap-3 text-[10px]">
        <span className="rounded-full border border-gray-200 px-3 py-1 font-medium text-gray-600">Shipping</span>
        <span className="rounded-full border border-gray-200 px-3 py-1 font-medium text-gray-600">Returns</span>
        <span className="rounded-full border border-gray-200 px-3 py-1 font-medium text-gray-600">Privacy</span>
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="h-2 w-full rounded bg-gray-100" />
        <div className="h-2 w-5/6 rounded bg-gray-100" />
        <div className="h-2 w-4/6 rounded bg-gray-100" />
      </div>
    </section>
  );
}

/* ---------- Utility ---------- */

function adjustBrightness(hex: string, amount: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const cleaned = hex.replace("#", "");
  const r = clamp(parseInt(cleaned.substring(0, 2), 16) + amount);
  const g = clamp(parseInt(cleaned.substring(2, 4), 16) + amount);
  const b = clamp(parseInt(cleaned.substring(4, 6), 16) + amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export const StorePreviewRenderer = React.memo(StorePreviewRendererInner);
