"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { resolveSchneidersConfig } from "@scheniders/shared";
import { StoreLink } from "@/lib/store-context";
import { useCart } from "@/lib/cart-store";
import type { Tenant } from "@/lib/types";
import {
  BentoCard,
  ChunkyButton,
  ChunkyLink,
  MaterialIcon,
  ScribbleHeading,
  SectionEyebrow,
  Sticker,
  TrustPill,
  WhatsAppIcon,
} from "./primitives";
import { formatPrice } from "./format";
import { fillTemplate } from "./wa";
import { FreeGiftStripe } from "./free-gift-stripe";
import { cn } from "@/lib/utils";

const TINTS = ["bg-bk-decor-a/30", "bg-bk-decor-b/30", "bg-bk-accent/30", "bg-bk-decor-c/30"];
const ROTATIONS = ["rotate-0", "rotate-[0.5deg]", "-rotate-[0.5deg]", "rotate-[0.25deg]"];

interface Props {
  tenant: Tenant;
}

export function SchneidersCartView({ tenant }: Props) {
  const items = useCart((s) => s.items);
  const updateQuantity = useCart((s) => s.updateQuantity);
  const removeItem = useCart((s) => s.removeItem);
  const subtotal = useCart((s) => s.getTotal());
  const [mounted, setMounted] = useState(false);
  const [promo, setPromo] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState(0);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);

  const schn = resolveSchneidersConfig(tenant.store_config?.schneiders);
  const promoCodes = schn.cart.promo_codes ?? [];
  const firstCodeHint = promoCodes[0]?.code;

  useEffect(() => setMounted(true), []);

  function applyPromo() {
    const code = promo.trim().toUpperCase();
    if (!code) return;
    const now = Date.now();
    const match = promoCodes.find((p) => {
      if (p.code.toUpperCase() !== code) return false;
      if (p.expires_at && new Date(p.expires_at).getTime() < now) return false;
      return true;
    });
    if (match) {
      let discount = 0;
      if (match.percent_off) discount = Math.round(subtotal * (match.percent_off / 100));
      else if (match.fixed_off_iqd) discount = match.fixed_off_iqd;
      setAppliedDiscount(discount);
      setPromoMsg(
        match.percent_off
          ? `✨ ${match.percent_off}% off applied!`
          : `✨ ${formatPrice(match.fixed_off_iqd ?? 0)} off applied!`,
      );
    } else {
      setAppliedDiscount(0);
      setPromoMsg(
        firstCodeHint ? `Code not recognized. Try ${firstCodeHint}.` : "Code not recognized.",
      );
    }
  }

  if (!mounted) {
    return (
      <div className="py-16 text-center font-display font-bold text-bk-ink/60">
        Loading your cart…
      </div>
    );
  }

  if (items.length === 0) {
    return <EmptyCartState message={schn.empty_states.empty_cart_message} categories={schn.empty_states.fallback_categories} />;
  }

  const threshold = schn.shipping.baghdad_threshold_iqd ?? 75_000;
  const baseFee = schn.shipping.baghdad_fee_iqd ?? 5_000;
  const deliveryFee = subtotal >= threshold ? 0 : baseFee;
  const total = Math.max(0, subtotal - appliedDiscount + deliveryFee);
  const wa = tenant.store_config?.contact?.whatsapp_number ?? null;
  const itemsList = items
    .map((i) => `• ${i.name}${i.variant_name ? ` — ${i.variant_name}` : ""} × ${i.quantity}`)
    .join("\n");
  const waText = fillTemplate(schn.whatsapp_templates.cart_template ?? "", {
    items: itemsList,
    total: formatPrice(total),
  });
  const waHref = wa
    ? `https://wa.me/${wa.replace(/\D/g, "")}?text=${encodeURIComponent(waText)}`
    : "#";

  return (
    <div className="space-y-6">
      <header>
        <ScribbleHeading color="butter" as="h1">Your Cart</ScribbleHeading>
        <p className="font-body text-sm text-bk-ink/70 mt-2">
          {items.length} item{items.length === 1 ? "" : "s"} waiting to come home with you ✨
        </p>
      </header>

      {/* Line items */}
      <section className="space-y-4">
        {items.map((item, i) => {
          const tint = TINTS[i % TINTS.length];
          const rotate = ROTATIONS[i % ROTATIONS.length];
          return (
            <BentoCard
              key={`${item.product_id}-${item.variant_id ?? "default"}`}
              bg="white"
              className={cn("p-4", rotate)}
            >
              <div className="flex gap-3">
                <div className={cn("w-20 h-20 rounded-xl border-[3px] border-bk-ink relative overflow-hidden shrink-0", tint)}>
                  {item.image_url ? (
                    <Image src={item.image_url} alt={item.name} fill className="object-cover mix-blend-multiply" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-bk-ink/40 font-display font-bold text-xs">
                      No image
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <h3 className="font-body font-bold text-base leading-tight line-clamp-2">{item.name}</h3>
                    {item.variant_name && (
                      <p className="font-label text-xs text-bk-ink/60 mt-0.5">{item.variant_name}</p>
                    )}
                    <p className="font-display font-black text-lg mt-1">{formatPrice(item.price)}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t-2 border-dashed border-bk-ink/10">
                <div className="inline-flex items-center bento-card-sm bg-white overflow-hidden p-0.5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.product_id, item.variant_id, item.quantity - 1)}
                    aria-label="Decrease quantity"
                    className="w-8 h-8 flex items-center justify-center font-display font-black text-xl hover:bg-bk-surface rounded-lg"
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-display font-black text-base">{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.product_id, item.variant_id, item.quantity + 1)}
                    aria-label="Increase quantity"
                    className="w-8 h-8 flex items-center justify-center font-display font-black text-xl bg-bk-decor-a border-2 border-bk-ink rounded-lg"
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.product_id, item.variant_id)}
                  aria-label="Remove item"
                  className="w-10 h-10 bento-card-sm bg-bk-accent rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                >
                  <MaterialIcon name="delete" className="text-lg" />
                </button>
              </div>
            </BentoCard>
          );
        })}
      </section>

      {/* Free-gift stripe */}
      <FreeGiftStripe config={schn.free_gift} subtotal={subtotal} />

      {/* Promo code card */}
      {schn.cart.show_promo_code && promoCodes.length > 0 && (
        <BentoCard bg="sky" rotate={1} className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Sticker bg="butter" rotate={-3} size="xs">✨ Have a code?</Sticker>
            {firstCodeHint && (
              <SectionEyebrow className="text-bk-ink/70">Try {firstCodeHint}</SectionEyebrow>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={promo}
              onChange={(e) => setPromo(e.target.value)}
              placeholder="Enter promo code"
              className="flex-1 bento-card-sm bg-bk-surface rounded-xl px-4 py-3 font-body font-bold uppercase tracking-wider text-sm placeholder:opacity-50 focus:outline-none"
            />
            <ChunkyButton bg="butter" onClick={applyPromo}>
              Apply
            </ChunkyButton>
          </div>
          {promoMsg && (
            <p className={cn("font-label text-xs font-bold", appliedDiscount > 0 ? "text-bk-ink" : "text-bk-primary")}>
              {promoMsg}
            </p>
          )}
        </BentoCard>
      )}

      {/* Order summary */}
      <BentoCard bg="white" className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-black text-2xl uppercase">Order Summary</h2>
          {appliedDiscount > 0 && (
            <Sticker bg="butter" rotate={3} size="xs">Save {formatPrice(appliedDiscount)}</Sticker>
          )}
        </div>
        <div className="space-y-2 font-body text-sm">
          <Row label="Subtotal" value={formatPrice(subtotal)} />
          {appliedDiscount > 0 && (
            <Row label="Discount" value={`−${formatPrice(appliedDiscount)}`} valueClass="text-bk-primary font-bold" />
          )}
          <Row
            label="Delivery"
            value={deliveryFee === 0 ? "FREE 🎉" : formatPrice(deliveryFee)}
            valueClass={deliveryFee === 0 ? "text-bk-success font-display font-black" : ""}
          />
        </div>
        <div className="border-t-[3px] border-dashed border-bk-ink/30 mt-4 pt-4 flex items-center justify-between">
          <span className="font-display font-black text-xl uppercase">Total</span>
          <span className="font-display font-black text-3xl">{formatPrice(total)}</span>
        </div>
      </BentoCard>

      {/* Trust strip */}
      <section className="-mx-4 overflow-hidden">
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

      {/* Primary CTA */}
      <ChunkyLink href="/checkout" bg="pink" size="lg" fullWidth className="font-display font-black text-xl">
        Checkout — {formatPrice(total)} <MaterialIcon name="arrow_forward" className="text-xl" />
      </ChunkyLink>
      <p className="font-body text-xs text-center text-bk-ink/60 -mt-3">
        Cash on delivery available • No upfront payment
      </p>

      {schn.cart.show_whatsapp_alternative && wa && (
        <>
          {/* "OR" divider */}
          <div className="flex items-center gap-3 my-2">
            <div className="flex-1 h-[3px] bg-bk-ink/20" />
            <span className="font-display font-black text-sm uppercase text-bk-ink/60">OR</span>
            <div className="flex-1 h-[3px] bg-bk-ink/20" />
          </div>

          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="bento-card bg-white text-bk-ink font-display font-black text-base px-5 py-4 flex items-center justify-center gap-2 hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none active:translate-y-[2px] active:translate-x-[2px] transition-all rounded-xl uppercase tracking-tight"
          >
            <WhatsAppIcon className="w-5 h-5 text-bk-success" />
            Order on WhatsApp
          </a>
        </>
      )}
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-bk-ink/70">{label}</span>
      <span className={cn("font-bold", valueClass)}>{value}</span>
    </div>
  );
}

type FallbackCategory = {
  slug: string;
  label: string;
  emoji?: string;
  bg?: "pink" | "mint" | "butter" | "lilac" | "sky" | "cream" | "ink";
};

const TILE_BG_CLASS: Record<NonNullable<FallbackCategory["bg"]>, string> = {
  mint: "bg-bk-decor-a",
  butter: "bg-bk-accent",
  pink: "bg-bk-primary text-white",
  sky: "bg-bk-decor-c",
  lilac: "bg-bk-decor-b",
  cream: "bg-bk-surface",
  ink: "bg-bk-ink text-white",
};

export function EmptyCartState({
  message,
  categories,
}: {
  message?: string;
  categories?: FallbackCategory[];
} = {}) {
  const heading = message ?? "Your cart is empty 🛒";
  const tiles: FallbackCategory[] =
    categories && categories.length > 0
      ? categories
      : [
          { slug: "shoes", label: "Shoes", emoji: "👟", bg: "mint" },
          { slug: "skincare", label: "Skincare", emoji: "🧴", bg: "butter" },
          { slug: "fashion", label: "Fashion", emoji: "👕", bg: "pink" },
          { slug: "home", label: "Home", emoji: "🏠", bg: "sky" },
        ];
  return (
    <div className="space-y-6">
      <BentoCard bg="lilac" rotate={1} className="p-10 text-center relative overflow-hidden">
        <div className="absolute top-3 left-3">
          <Sticker bg="pink" rotate={-6} size="xs">Oops</Sticker>
        </div>
        <div className="text-7xl mb-3" style={{ transform: "rotate(-8deg)" }}>🛍️</div>
        <h1 className="font-display font-black text-3xl uppercase mb-2">
          {heading}
        </h1>
        <p className="font-body text-sm text-bk-ink/80">Let&apos;s fix that! ✨</p>
      </BentoCard>

      <ChunkyLink href="/" bg="pink" size="lg" fullWidth>
        Browse new arrivals
      </ChunkyLink>

      <div className="grid grid-cols-2 gap-3">
        {tiles.map((t, i) => (
          <StoreLink
            key={t.slug}
            href={`/categories/${t.slug}`}
            className={cn(
              "bento-card p-4 text-center hover:-translate-y-0.5 transition-transform",
              i % 2 === 0 ? "rotate-[-1deg]" : "rotate-1",
              TILE_BG_CLASS[t.bg ?? "mint"],
            )}
          >
            {t.emoji && <div className="text-3xl mb-1">{t.emoji}</div>}
            <p className="font-display font-black uppercase text-sm">{t.label}</p>
          </StoreLink>
        ))}
      </div>
    </div>
  );
}
