"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveSchneidersConfig } from "@scheniders/shared";
import type { SchneidersConfig } from "@scheniders/shared";
import { useStoreBase, StoreLink } from "@/lib/store-context";
import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BentoCard, ChunkyLink, MaterialIcon, ScribbleHeading, SectionEyebrow, Sticker, WhatsAppIcon } from "./primitives";
import { SchneidersProductCard } from "./product-card";

interface Props {
  products: Product[];
  whatsappNumber?: string | null;
  schneidersConfig?: SchneidersConfig | null;
}

const TRENDING = ["sneakers", "skincare", "perfume", "summer dress", "watches"];

const TILE_BG_CLASS = {
  mint: "bg-bk-mint",
  butter: "bg-bk-accent",
  pink: "bg-bk-primary text-white",
  sky: "bg-bk-sky",
  lilac: "bg-bk-lilac",
  cream: "bg-bk-surface",
  ink: "bg-bk-ink text-white",
} as const;

export function SchneidersSearchView({ products, whatsappNumber, schneidersConfig }: Props) {
  const schn = resolveSchneidersConfig(schneidersConfig);
  const fallbackCats = schn.empty_states.fallback_categories ?? [];
  const router = useRouter();
  const sp = useSearchParams();
  const storeBase = useStoreBase();
  const initialQ = sp.get("q") ?? "";
  const [query, setQuery] = useState(initialQ);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => {
      const hay = [p.name, p.description ?? "", p.sku ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [products, query]);

  function pushQuery(next: string) {
    setQuery(next);
    const params = new URLSearchParams();
    if (next) params.set("q", next);
    router.replace(`${storeBase}/search${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <BentoCard bg="white" className="p-3 flex items-center gap-2">
        <span className="bento-card-sm bg-bk-primary w-10 h-10 flex items-center justify-center rounded-xl shrink-0 text-bk-on-primary">
          <MaterialIcon name="search" className="text-white text-xl" />
        </span>
        <input
          autoFocus
          value={query}
          onChange={(e) => pushQuery(e.target.value)}
          placeholder="Search products..."
          className="flex-1 bg-transparent font-display font-black text-lg focus:outline-none placeholder:opacity-50 placeholder:font-bold"
        />
        {query && (
          <button
            type="button"
            onClick={() => pushQuery("")}
            aria-label="Clear search"
            className="bento-card-sm bg-bk-accent w-10 h-10 flex items-center justify-center rounded-xl shrink-0 text-bk-on-accent"
          >
            <MaterialIcon name="close" className="text-xl" />
          </button>
        )}
      </BentoCard>

      {query ? (
        <>
          <p className="font-display font-black text-sm uppercase tracking-wider">
            {filtered.length} result{filtered.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
          </p>
          {filtered.length === 0 ? (
            <BentoCard bg="sky" rotate={-1} className="p-6 text-center">
              <div className="text-5xl mb-2" style={{ transform: "rotate(-8deg)" }}>🔍</div>
              <h2 className="font-display font-black text-2xl uppercase mb-1">Nothing found</h2>
              <p className="font-body text-sm mb-4">Try a different search or ask us on WhatsApp.</p>
              {whatsappNumber && (
                <a
                  href={`https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(
                    `Looking for "${query}"`,
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="bento-card bg-bk-surface-alt text-bk-ink font-display font-black text-base px-5 py-3 inline-flex items-center gap-2 rounded-xl uppercase hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all"
                >
                  <WhatsAppIcon className="w-5 h-5 text-bk-mint" />
                  Ask us
                </a>
              )}
            </BentoCard>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {filtered.map((p, i) => (
                <SchneidersProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <SectionEyebrow>🔥 Trending</SectionEyebrow>
          <div className="flex flex-wrap gap-2">
            {TRENDING.map((term, i) => (
              <button
                key={term}
                type="button"
                onClick={() => pushQuery(term)}
                className="bento-card-sm bg-bk-surface-alt px-3 py-2 font-display font-bold text-sm uppercase rounded-2xl hover:scale-105 active:scale-95 transition-transform"
                style={{ transform: `rotate(${i % 2 === 0 ? -1 : 1}deg)` }}
              >
                {term}
              </button>
            ))}
          </div>

          <ScribbleHeading color="butter" as="h2">Popular categories</ScribbleHeading>
          <div className="grid grid-cols-2 gap-3">
            {fallbackCats.map((c, i) => (
              <StoreLink
                key={c.slug}
                href={`/categories/${c.slug}`}
                className={cn(
                  "bento-card p-5 hover:-translate-y-0.5 transition-transform",
                  i % 2 === 0 ? "rotate-[-1deg]" : "rotate-1",
                  TILE_BG_CLASS[c.bg ?? "mint"],
                )}
              >
                {c.emoji && <div className="text-3xl mb-1">{c.emoji}</div>}
                <p className="font-display font-black uppercase">{c.label}</p>
              </StoreLink>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
