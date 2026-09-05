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

      <header className="sticky top-0 z-40 bg-bk-surface border-b-4 border-bk-ink h-16 flex justify-between items-center px-4 w-full shadow-bk-card">
        {showBack ? (
          <StoreLink
            href="/"
            aria-label="Go back"
            className="w-10 h-10 flex items-center justify-center bento-card-sm bg-bk-surface-alt hover:scale-105 active:scale-95 transition-transform rounded-full"
          >
            <MaterialIcon name="arrow_back" className="text-bk-ink font-bold" />
          </StoreLink>
        ) : (
          <button
            type="button"
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
            className="w-10 h-10 flex items-center justify-center bento-card-sm bg-bk-surface-alt hover:scale-105 active:scale-95 transition-transform rounded-full"
          >
            <MaterialIcon name={open ? "close" : "menu"} className="text-bk-ink font-bold" />
          </button>
        )}

        <StoreLink
          href="/"
          aria-label={tenant.business_name || "Schneiders"}
          className="min-w-0 max-w-[60%] flex justify-center"
        >
          <span className="inline-flex items-center -rotate-2 px-3 py-1 bento-card-sm bg-bk-accent font-display font-black text-xl sm:text-2xl text-bk-ink tracking-tight uppercase truncate text-bk-on-accent">
            {tenant.business_name || "Schneiders"}
          </span>
        </StoreLink>

        <StoreLink
          href="/cart"
          aria-label="View cart"
          className="bento-card-sm bg-bk-mint text-bk-ink font-bold px-3 py-1.5 flex items-center gap-1 hover:scale-105 active:scale-95 transition-transform rounded-full"
        >
          <span className="text-sm">🛍</span>
          <span className="font-label">{cartCount}</span>
        </StoreLink>
      </header>

      {/* Mobile drawer for category navigation */}
      {open && categories.length > 0 && (
        <div className="bg-bk-surface border-b-4 border-bk-ink shadow-bk-card">
          <nav className="px-4 py-3 grid grid-cols-2 gap-2">
            <StoreLink
              href="/"
              onClick={() => setOpen(false)}
              className={cn(
                "bento-card-sm bg-bk-surface-alt px-3 py-2 font-display font-bold text-sm uppercase",
              )}
            >
              🏠 Home
            </StoreLink>
            {categories.slice(0, 7).map((cat, i) => {
              const tint = ["bg-bk-mint", "bg-bk-accent", "bg-bk-lilac", "bg-bk-sky", "bg-bk-primary text-white", "bg-bk-surface-alt", "bg-bk-surface"][i % 7];
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
