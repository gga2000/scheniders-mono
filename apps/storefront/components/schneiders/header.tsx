"use client";

import { useState } from "react";
import { resolveSchneidersConfig } from "@scheniders/shared";
import { StoreLink } from "@/lib/store-context";
import type { Tenant, Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MaterialIcon, PromoBar } from "./primitives";

interface Props {
  tenant: Tenant;
  categories?: Category[];
  cartCount?: number;
  /** Show a back arrow instead of the menu icon (used on sub-pages). */
  showBack?: boolean;
  /** Optional promo bar text — defaults to the first configured promo bar message. */
  promo?: string | null;
}

export function SchneidersHeader({
  tenant,
  categories = [],
  cartCount = 0,
  showBack = false,
  promo,
}: Props) {
  const [open, setOpen] = useState(false);
  const schn = resolveSchneidersConfig(tenant.store_config?.schneiders);
  const defaultPromo = schn.promo_bar.messages?.[0] ?? "";
  const promoEnabled = schn.promo_bar.enabled !== false;
  const promoText =
    promo === null
      ? null
      : (promo ?? (promoEnabled && defaultPromo ? defaultPromo : null));

  return (
    <>
      {promoText && <PromoBar>{promoText}</PromoBar>}

      <header className="sticky top-0 z-40 bg-candy-cream border-b-4 border-candy-ink h-16 flex justify-between items-center px-4 w-full shadow-bento-sm">
        {showBack ? (
          <StoreLink
            href="/"
            aria-label="Go back"
            className="w-10 h-10 flex items-center justify-center bento-card-sm bg-white hover:scale-105 active:scale-95 transition-transform rounded-full"
          >
            <MaterialIcon name="arrow_back" className="text-candy-ink font-bold" />
          </StoreLink>
        ) : (
          <button
            type="button"
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
            className="w-10 h-10 flex items-center justify-center bento-card-sm bg-white hover:scale-105 active:scale-95 transition-transform rounded-full"
          >
            <MaterialIcon name={open ? "close" : "menu"} className="text-candy-ink font-bold" />
          </button>
        )}

        <StoreLink href="/" className="font-display font-black text-2xl text-candy-ink tracking-tight uppercase truncate max-w-[60%] text-center">
          {tenant.business_name || "Schneiders"}
        </StoreLink>

        <StoreLink
          href="/cart"
          aria-label="View cart"
          className="bento-card-sm bg-candy-mint text-candy-ink font-bold px-3 py-1.5 flex items-center gap-1 hover:scale-105 active:scale-95 transition-transform rounded-full"
        >
          <span className="text-sm">🛍</span>
          <span className="font-label">{cartCount}</span>
        </StoreLink>
      </header>

      {/* Mobile drawer for category navigation */}
      {open && categories.length > 0 && (
        <div className="bg-candy-cream border-b-4 border-candy-ink shadow-bento-sm">
          <nav className="px-4 py-3 grid grid-cols-2 gap-2">
            <StoreLink
              href="/"
              onClick={() => setOpen(false)}
              className={cn(
                "bento-card-sm bg-white px-3 py-2 font-display font-bold text-sm uppercase",
              )}
            >
              🏠 Home
            </StoreLink>
            {categories.slice(0, 7).map((cat, i) => {
              const tint = ["bg-candy-mint", "bg-candy-butter", "bg-candy-lilac", "bg-candy-sky", "bg-candy-pink text-white", "bg-white", "bg-candy-cream"][i % 7];
              return (
                <StoreLink
                  key={cat.id}
                  href={`/categories/${cat.slug}`}
                  onClick={() => setOpen(false)}
                  className={cn("bento-card-sm px-3 py-2 font-display font-bold text-sm uppercase truncate", tint)}
                >
                  {cat.name}
                </StoreLink>
              );
            })}
          </nav>
        </div>
      )}
    </>
  );
}
