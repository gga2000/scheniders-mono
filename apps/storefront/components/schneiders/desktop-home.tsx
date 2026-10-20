"use client";

import Image from "next/image";
import { resolveSchneidersConfig } from "@scheniders/shared";
import { StoreLink } from "@/lib/store-context";
import type { Tenant, Product, Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MaterialIcon, WhatsAppIcon } from "./primitives";
import { formatPrice } from "./format";

type ResolvedSchneiders = ReturnType<typeof resolveSchneidersConfig>;

interface Props {
  tenant: Tenant;
  products: Product[];
  categories: Category[];
}

/**
 * Schneiders DESKTOP home — bold "Bento Wedge" layout that matches
 * the approved Stitch design (schneiders_refined_desktop_layout).
 *
 * Differs from the mobile sibling:
 *  - 4px chunky borders + 6px hard offset shadows (bento-card-bold)
 *  - Wedge-clipped hero image (clip-path)
 *  - Rotated italic yellow wordmark in the header & footer
 *  - Dark trust banner (black bg, mint stat)
 *  - 3-col gift-guide + customer-love grid below the hero
 *  - Floating round WhatsApp pill bottom-right
 *  - Dark bold footer
 *
 * Rendered ONLY at md+ breakpoints. The mobile layout lives in
 * SchneidersHome and is hidden at md+.
 */
export function SchneidersDesktopHome({ tenant, products, categories }: Props) {
  const hero = tenant.store_config?.hero;
  const wa = tenant.store_config?.contact?.whatsapp_number ?? null;
  const cartCount = 0;
  const schn = resolveSchneidersConfig(tenant.store_config?.schneiders);

  const featuredHero = products[0];
  const featuredSide = products[1] ?? products[0];

  return (
    <div className="hidden md:block min-h-screen bg-bk-surface text-bk-ink font-body relative">
      {/* ── Floating header ── */}
      <DesktopHeader tenant={tenant} cartCount={cartCount} categories={categories} wordmarkStyle={schn.wordmark_style} />

      <main className="pt-32 pb-24 px-6 max-w-7xl mx-auto">
        {/* ── Hero headline block ── */}
        <div className="mb-12 text-left relative">
          <span className="inline-block bg-bk-accent px-4 py-1 chunky-border-bold -rotate-1 mb-6 font-display font-black uppercase text-sm shadow-bento-sm">
            ⚡ {schn.delivery_promise.baghdad_hours}h Delivery Promise
          </span>
          <h1 className="font-display font-black text-5xl md:text-7xl lg:text-8xl leading-[0.9] tracking-tighter uppercase mb-3">
            {hero?.title || (
              <>
                The New Collection
                <br />
                <span className="text-bk-primary italic">Has Arrived.</span>
              </>
            )}
          </h1>
          <p className="font-body text-xl font-medium max-w-md text-bk-ink/80">
            {hero?.subtitle ||
              "High-energy essentials for your everyday Iraqi lifestyle. From Baghdad with love."}
          </p>
        </div>

        {/* ── Main interlocking wedge grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Left: big wedge-image hero product card */}
          <DesktopHeroProductCard product={featuredHero} hero={hero?.image_url ?? null} schn={schn} />

          {/* Right: featured product + dark trust banner */}
          <div className="flex flex-col gap-8">
            <DesktopFeaturedProduct product={featuredSide} schn={schn} />
            {schn.home_sections.trust_banner !== false && <DesktopTrustBanner schn={schn} />}
          </div>
        </div>

        {/* ── Secondary bento: gift guide + customer love ── */}
        {(schn.home_sections.gift_guides !== false || schn.home_sections.customer_love !== false) && (
          <section className="mt-16">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {schn.home_sections.gift_guides !== false && <GiftGuideCard categories={categories} />}
              {schn.home_sections.customer_love !== false && <CustomerLoveCard schn={schn} />}
            </div>
          </section>
        )}

        {/* ── Category strip ── */}
        {categories.length > 0 && (
          <section className="mt-16">
            <h2 className="font-display font-black text-3xl md:text-4xl uppercase tracking-tight mb-6">
              Shop the categories
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {categories.slice(0, 4).map((cat, i) => (
                <CategoryTile key={cat.id} category={cat} index={i} />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* ── Floating WhatsApp CTA ── */}
      {wa && (
        <a
          href={`https://wa.me/${wa.replace(/\D/g, "")}`}
          target="_blank"
          rel="noreferrer"
          className="fixed bottom-8 right-8 z-[110] bg-bk-success chunky-border-bold py-4 pl-4 pr-6 rounded-full shadow-bento-lg flex items-center gap-3 hover:scale-110 active:scale-95 transition-transform"
        >
          <WhatsAppIcon className="w-7 h-7 text-bk-ink" />
          <span className="font-display font-black uppercase text-sm">Chat with us</span>
        </a>
      )}

      {/* ── Dark bold footer ── */}
      <DesktopFooter tenant={tenant} wordmarkStyle={schn.wordmark_style} />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────── */

function DesktopHeader({
  tenant,
  categories,
  cartCount,
  wordmarkStyle,
}: {
  tenant: Tenant;
  categories: Category[];
  cartCount: number;
  wordmarkStyle?: "classic" | "italic-yellow-box" | "minimal";
}) {
  const wordmarkClass =
    wordmarkStyle === "classic"
      ? "font-display text-3xl font-black bg-white px-6 py-2 chunky-border-bold inline-flex items-center justify-center shadow-bento-sm hover:scale-105 transition-transform whitespace-nowrap uppercase tracking-tight"
      : wordmarkStyle === "minimal"
        ? "font-display text-3xl font-black uppercase tracking-tight hover:opacity-80 transition-opacity"
        : "font-display text-3xl font-black italic bg-bk-accent px-6 py-2 chunky-border-bold -rotate-2 inline-flex items-center justify-center shadow-bento-sm hover:scale-105 transition-transform whitespace-nowrap uppercase tracking-tight";
  return (
    <header className="fixed top-0 left-0 w-full z-[100] bg-transparent pointer-events-none">
      <div className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center pointer-events-auto">
        {/* Menu */}
        <button
          type="button"
          aria-label="Menu"
          className="bg-white chunky-border-bold p-2.5 hover:scale-105 active:scale-95 transition-transform flex items-center justify-center shadow-bento-sm"
        >
          <MaterialIcon name="menu" className="text-2xl" />
        </button>

        {/* Centered wordmark — style depends on schn.wordmark_style */}
        <StoreLink href="/" className={wordmarkClass}>
          {tenant.business_name || "SCHNEIDERS"}
        </StoreLink>

        {/* Right: nav + cart */}
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex bg-white chunky-border-bold px-6 py-2.5 shadow-bento-sm">
            <nav className="flex gap-6">
              <StoreLink
                href="/search"
                className="font-label text-sm font-black uppercase text-bk-ink hover:text-bk-primary transition-colors"
              >
                Search
              </StoreLink>
              {categories.slice(0, 2).map((cat) => (
                <StoreLink
                  key={cat.id}
                  href={`/categories/${cat.slug}`}
                  className="font-label text-sm font-black uppercase text-bk-ink hover:text-bk-primary transition-colors"
                >
                  {cat.name}
                </StoreLink>
              ))}
              <StoreLink
                href="/about"
                className="font-label text-sm font-black uppercase text-bk-ink hover:text-bk-primary transition-colors"
              >
                About
              </StoreLink>
            </nav>
          </div>
          <StoreLink
            href="/cart"
            aria-label="Cart"
            className="bg-white chunky-border-bold p-2.5 hover:scale-105 active:scale-95 transition-transform relative shadow-bento-sm"
          >
            <MaterialIcon name="shopping_cart" className="text-2xl" />
            <span className="absolute -top-2 -right-2 bg-bk-primary text-white text-[10px] font-black h-5 w-5 rounded-full flex items-center justify-center border-2 border-bk-ink">
              {cartCount}
            </span>
          </StoreLink>
        </div>
      </div>
    </header>
  );
}

function DesktopHeroProductCard({
  product,
  hero,
  schn,
}: {
  product?: Product | null;
  hero: string | null;
  schn: ResolvedSchneiders;
}) {
  return (
    <article className="relative group">
      <div className="bento-card-bold rounded-2xl overflow-hidden transition-transform hover:-translate-y-1">
        {/* Top wedge — image */}
        <div className="relative h-96 bg-bk-decor-a wedge-mask-top overflow-hidden">
          {hero ? (
            <Image
              src={hero}
              alt={product?.name || "Hero"}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
              className="object-cover mix-blend-multiply opacity-95"
            />
          ) : product?.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
              className="object-cover mix-blend-multiply opacity-95"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-bk-ink/40 font-display font-black text-2xl uppercase">
              Hero image
            </div>
          )}
          <span className="absolute top-6 right-6 bg-white chunky-border-bold px-4 py-1 rounded-full font-display font-black text-xs uppercase shadow-bento-sm">
            {schn.best_sellers_label}
          </span>
          {product?.compare_at_price && product.compare_at_price > product.price && (() => {
            const savings = product.compare_at_price - product.price;
            const pct = Math.round((savings / product.compare_at_price) * 100);
            const label =
              schn.sale_sticker.style === "percent"
                ? `-${pct}% OFF`
                : schn.sale_sticker.style === "label"
                  ? (schn.sale_sticker.label ?? "LIMITED TIME")
                  : `Save ${formatPrice(savings)}`;
            const rotate = schn.sale_sticker.rotate_deg ?? -5;
            return (
              <span
                className="absolute bottom-14 left-6 bg-bk-primary text-white chunky-border-bold px-4 py-2 font-display font-black text-sm uppercase shadow-bento-sm"
                style={{ transform: `rotate(${rotate}deg)` }}
              >
                {label}
              </span>
            );
          })()}
        </div>

        {/* Bottom content */}
        <div className="p-8 -mt-10 relative z-10">
          <div className="flex justify-between items-end mb-6 gap-4">
            <div className="min-w-0">
              <h3 className="font-display text-3xl font-black uppercase tracking-tight truncate">
                {product?.name || "Summer Essentials"}
              </h3>
              <p className="text-sm font-bold uppercase text-bk-ink/60 mt-1 tracking-wider">
                Baghdad · Erbil · Basra
              </p>
            </div>
            <div className="text-right shrink-0">
              {product?.compare_at_price && product.compare_at_price > product.price && (
                <span className="text-sm line-through text-bk-ink/40 block">
                  {formatPrice(product.compare_at_price)}
                </span>
              )}
              <p className="text-2xl font-display font-black text-bk-primary">
                {formatPrice(product?.price ?? 85_000)}
              </p>
            </div>
          </div>
          <StoreLink
            href={product ? `/products/${product.slug ?? product.id}` : "#"}
            className="w-full bg-bk-success wobbly-button py-4 font-display font-black uppercase tracking-widest flex items-center justify-center gap-2 rounded-xl text-base"
          >
            <MaterialIcon name="shopping_basket" /> Add to bag
          </StoreLink>
        </div>
      </div>
    </article>
  );
}

function DesktopFeaturedProduct({ product, schn }: { product?: Product | null; schn: ResolvedSchneiders }) {
  if (!product) return null;
  return (
    <div className="bg-bk-primary chunky-border-bold rounded-2xl shadow-bento-lg p-1 relative overflow-hidden">
      <div className="bg-white rounded-xl p-6 flex flex-col md:flex-row gap-6 relative z-10">
        <div className="w-full md:w-1/3 bg-bk-decor-b chunky-border-bold rounded-xl h-48 overflow-hidden relative shrink-0">
          <span className="absolute -top-3 -left-3 bg-bk-accent chunky-border-bold w-16 h-16 rounded-full flex items-center justify-center font-display font-black text-center -rotate-12 z-20 text-[10px] uppercase leading-tight shadow-bento-sm">
            New
            <br />
            Arrival
          </span>
          {product.image_url ? (
            <Image
              src={product.image_url}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 100vw, 200px"
              className="object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-bk-ink/40 font-display font-bold text-xs uppercase">
              No image
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col justify-center">
          {schn.pdp.show_star_rating && (
            <div className="flex gap-0.5 mb-2 text-bk-accent">
              {Array.from({ length: 5 }).map((_, i) => (
                <MaterialIcon key={i} name="star" className="text-xl" />
              ))}
            </div>
          )}
          <h4 className="font-display text-2xl font-black uppercase mb-2 leading-tight">
            {product.name}
          </h4>
          {product.description && (
            <p className="text-sm text-bk-ink/70 mb-4 leading-tight line-clamp-2">
              {product.description}
            </p>
          )}
          <div className="flex items-center justify-between mt-auto">
            <span className="text-xl font-display font-black">{formatPrice(product.price)}</span>
            <div className="flex -space-x-2">
              <div className="h-8 w-8 rounded-full border-2 border-white bg-bk-decor-c" />
              <div className="h-8 w-8 rounded-full border-2 border-white bg-bk-decor-a" />
              <div className="h-8 w-8 rounded-full border-2 border-white bg-bk-accent flex items-center justify-center text-[10px] font-display font-black">
                +12
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute top-0 right-0 w-32 h-32 bg-bk-primary/10 rounded-full translate-x-10 -translate-y-10 pointer-events-none" />
    </div>
  );
}

function DesktopTrustBanner({ schn }: { schn: ResolvedSchneiders }) {
  const stat =
    schn.social_proof.source === "manual"
      ? (schn.social_proof.manual_number ?? 247)
      : (schn.social_proof.manual_number ?? 247);
  return (
    <div className="bg-bk-ink text-white chunky-border-bold rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-bento-lg">
      <div className="flex items-center gap-4">
        <span className="text-5xl font-display font-black text-bk-decor-a leading-none">{stat}</span>
        <span className="text-xs font-bold uppercase leading-tight text-white/80 max-w-[10ch]">
          {schn.social_proof.label}
        </span>
      </div>
      <div className="h-10 w-px bg-white/20 hidden md:block" />
      <div className="flex items-center gap-3">
        <div className="bg-bk-decor-a text-bk-ink p-2 rounded-full flex items-center justify-center border-[3px] border-bk-ink">
          <MaterialIcon name="verified" />
        </div>
        <span className="text-sm font-display font-black uppercase">COD Guaranteed</span>
      </div>
    </div>
  );
}

function GiftGuideCard({ categories }: { categories: Category[] }) {
  const first = categories[0];
  return (
    <div className="bg-bk-accent chunky-border-bold p-6 rounded-2xl relative overflow-hidden group shadow-bento-lg">
      <div className="relative z-10">
        <h3 className="font-display text-3xl font-black uppercase mb-2">Gift Guides</h3>
        <p className="text-sm font-bold mb-6">Find the perfect surprise for your loved ones.</p>
        <StoreLink
          href={first ? `/categories/${first.slug}` : "/search"}
          className="inline-flex items-center gap-2 font-display font-black uppercase border-b-4 border-bk-ink pb-1 group-hover:gap-4 transition-all"
        >
          Browse now <MaterialIcon name="arrow_forward" />
        </StoreLink>
      </div>
      <MaterialIcon
        name="redeem"
        className="absolute -bottom-6 -right-6 text-9xl text-bk-ink/10 rotate-12 pointer-events-none"
      />
    </div>
  );
}

function CustomerLoveCard({ schn }: { schn: ResolvedSchneiders }) {
  const t = schn.testimonial;
  const name = t.reviewer_name ?? "Lina K.";
  const avatarLetter = (name.trim()[0] ?? "L").toUpperCase();
  return (
    <div className="md:col-span-2 bg-white chunky-border-bold rounded-2xl p-8 flex flex-col md:flex-row gap-8 items-center shadow-bento-lg">
      <div className="w-24 h-24 rounded-full chunky-border-bold overflow-hidden shrink-0 bg-bk-decor-b flex items-center justify-center font-display font-black text-3xl">
        {t.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.avatar_url} alt={name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          avatarLetter
        )}
      </div>
      <div>
        <div className="flex gap-1 mb-2 items-center">
          <MaterialIcon name="favorite" className="text-bk-primary text-sm" />
          <span className="text-xs font-display font-black uppercase tracking-widest">
            Customer Love
          </span>
        </div>
        <p className="font-display text-xl font-bold italic mb-4 leading-tight">
          &ldquo;{t.quote}&rdquo;
        </p>
        <div className="flex items-center gap-2 text-xs font-bold opacity-60">
          <span>
            {name}
            {t.reviewer_city ? ` from ${t.reviewer_city}` : ""}
          </span>
          <span className="h-1 w-1 bg-bk-ink rounded-full" />
          <span>Verified Buyer</span>
        </div>
      </div>
    </div>
  );
}

function CategoryTile({ category, index }: { category: Category; index: number }) {
  const tints = ["bg-bk-decor-a", "bg-bk-accent", "bg-bk-decor-b", "bg-bk-decor-c"] as const;
  const rotates = ["-rotate-1", "rotate-1", "-rotate-1", "rotate-1"] as const;
  return (
    <StoreLink
      href={`/categories/${category.slug}`}
      className={cn(
        "bento-card-bold rounded-2xl p-6 hover:-translate-y-1 transition-transform block",
        tints[index % 4],
        rotates[index % 4],
      )}
    >
      <div className="aspect-square relative mb-3 bg-white/40 rounded-xl overflow-hidden border-[3px] border-bk-ink">
        {category.image_url ? (
          <Image src={category.image_url} alt={category.name} fill className="object-cover" sizes="(max-width: 768px) 50vw, 280px" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-4xl">
            <MaterialIcon name="category" className="text-5xl text-bk-ink/40" />
          </div>
        )}
      </div>
      <h3 className="font-display font-black text-xl uppercase">{category.name}</h3>
      <p className="font-label font-bold text-xs uppercase tracking-wider mt-1 inline-flex items-center gap-1">
        Shop now <MaterialIcon name="arrow_forward" className="text-sm" />
      </p>
    </StoreLink>
  );
}

function DesktopFooter({ tenant, wordmarkStyle }: { tenant: Tenant; wordmarkStyle?: "classic" | "italic-yellow-box" | "minimal" }) {
  const c = tenant.store_config?.contact;
  const footerWordmark =
    wordmarkStyle === "classic"
      ? "font-display text-4xl font-black inline-block mb-6 uppercase tracking-tight text-bk-surface"
      : wordmarkStyle === "minimal"
        ? "font-display text-4xl font-black inline-block mb-6 uppercase tracking-tight text-bk-surface"
        : "font-display text-4xl font-black italic bg-bk-accent text-bk-ink inline-block px-6 py-2 chunky-border-bold border-white -rotate-1 mb-6 uppercase tracking-tight";
  return (
    <footer className="bg-bk-ink text-bk-surface pt-20 pb-12 px-6 mt-20">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="md:col-span-2">
            <div className={footerWordmark}>
              {tenant.business_name || "SCHNEIDERS"}
            </div>
            <p className="max-w-md text-white/60 font-medium leading-relaxed">
              Iraq's most vibrant shopping destination. We blend playful design with serious service
              to bring the world's best products to your doorstep.
            </p>
          </div>
          <div>
            <h5 className="font-display font-black uppercase mb-6 tracking-widest text-bk-primary text-sm">
              Explore
            </h5>
            <ul className="space-y-4 font-bold text-sm">
              <li>
                <StoreLink href="/search" className="hover:text-bk-decor-a transition-colors">
                  Search
                </StoreLink>
              </li>
              <li>
                <StoreLink href="/about" className="hover:text-bk-decor-a transition-colors">
                  About us
                </StoreLink>
              </li>
              <li>
                <StoreLink href="/faq" className="hover:text-bk-decor-a transition-colors">
                  FAQ
                </StoreLink>
              </li>
              <li>
                <StoreLink href="/contact" className="hover:text-bk-decor-a transition-colors">
                  Contact
                </StoreLink>
              </li>
            </ul>
          </div>
          <div>
            <h5 className="font-display font-black uppercase mb-6 tracking-widest text-bk-decor-b text-sm">
              Support
            </h5>
            <ul className="space-y-4 font-bold text-sm">
              <li>
                <StoreLink href="/track" className="hover:text-bk-decor-a transition-colors">
                  Track order
                </StoreLink>
              </li>
              <li>
                <StoreLink href="/policies/returns" className="hover:text-bk-decor-a transition-colors">
                  Returns & exchange
                </StoreLink>
              </li>
              <li>
                <StoreLink href="/policies/shipping" className="hover:text-bk-decor-a transition-colors">
                  Shipping policy
                </StoreLink>
              </li>
              <li>
                <StoreLink href="/policies/privacy" className="hover:text-bk-decor-a transition-colors">
                  Privacy
                </StoreLink>
              </li>
              <li>
                <StoreLink href="/policies/terms" className="hover:text-bk-decor-a transition-colors">
                  Terms
                </StoreLink>
              </li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} {tenant.business_name || "Schneiders"} Iraq. Made with ♥ in Baghdad 🇮🇶
          </p>
          <div className="flex gap-3">
            {c?.instagram && (
              <a
                href={`https://instagram.com/${c.instagram.replace(/^@/, "")}`}
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
                className="h-10 w-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-bk-primary transition-colors"
              >
                <MaterialIcon name="photo_camera" className="text-base" />
              </a>
            )}
            {c?.tiktok && (
              <a
                href={`https://tiktok.com/@${c.tiktok.replace(/^@/, "")}`}
                target="_blank"
                rel="noreferrer"
                aria-label="TikTok"
                className="h-10 w-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-bk-decor-a transition-colors"
              >
                <MaterialIcon name="music_note" className="text-base" />
              </a>
            )}
            {c?.whatsapp_number && (
              <a
                href={`https://wa.me/${c.whatsapp_number.replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                aria-label="WhatsApp"
                className="h-10 w-10 bg-white/10 rounded-full flex items-center justify-center hover:bg-bk-accent transition-colors"
              >
                <WhatsAppIcon className="w-5 h-5" />
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
