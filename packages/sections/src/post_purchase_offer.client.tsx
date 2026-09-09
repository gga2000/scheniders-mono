"use client";

import { useEffect, useState } from "react";
import { resolveI18n, type LocaleCode } from "@scheniders/shared";
import type { Props } from "./post_purchase_offer";
import type { SectionRenderContext } from "./_types";
import { BentoCard, ChunkyButton, Section } from "./helpers/primitives";
import { formatPrice } from "./helpers/format";
import { cn, PRESSABLE } from "./helpers/utils";

/** Same stash the confirmation section reads; only the fields needed here. */
const STASH_KEY = "schn:last-order";
const STASH_TTL_MS = 60 * 60 * 1000;

interface Proof {
  order_id: string;
  phone: string;
}

function readProof(now: number): Proof | null {
  try {
    const raw = window.sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (typeof v.ts !== "number" || now - v.ts > STASH_TTL_MS) return null;
    if (typeof v.order_id !== "string" || typeof v.phone !== "string") return null;
    return { order_id: v.order_id, phone: v.phone };
  } catch {
    return null;
  }
}

interface Offer {
  product_id: string;
  name: string;
  image_url: string | null;
  base_price: number;
  offer_price: number;
  discount_percentage: number;
  headline: string | null;
  description: string | null;
}

type Phase =
  | { kind: "idle" }
  | { kind: "offering"; offers: Offer[]; index: number; busy: boolean; error: string | null }
  | { kind: "accepted"; total: number }
  | { kind: "done" };

export function PostPurchaseOfferRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale as LocaleCode;
  const tenantId = ctx.tenant.id;
  const [proof, setProof] = useState<Proof | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  // Proof lives only in this browser's session; nothing renders on the
  // server, so a shared link to the thank-you page shows no offer.
  useEffect(() => {
    setProof(readProof(Date.now()));
  }, []);

  useEffect(() => {
    if (!proof) return;
    let cancelled = false;
    const q = new URLSearchParams({ tenant_id: tenantId, phone: proof.phone });
    fetch(`/api/checkout/orders/${proof.order_id}/upsell?${q}`)
      .then((r) => (r.ok ? r.json() : { offers: [] }))
      .then((body: { offers?: Offer[] }) => {
        if (cancelled) return;
        const offers = (body.offers ?? []).slice(0, props.max_offers);
        setPhase(offers.length ? { kind: "offering", offers, index: 0, busy: false, error: null } : { kind: "done" });
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: "done" });
      });
    return () => {
      cancelled = true;
    };
  }, [proof, tenantId, props.max_offers]);

  if (!proof || phase.kind === "idle" || phase.kind === "done") return null;

  const t = (s: Parameters<typeof resolveI18n>[0]) => resolveI18n(s, locale);

  if (phase.kind === "accepted") {
    return (
      <Section density="dense">
        <BentoCard bg="mint" size="sm" className="p-bk-md text-center">
          <p className="font-display text-base font-black text-bk-ink">
            {t(props.accepted_i18n).replace("{total}", formatPrice(phase.total, locale))}
          </p>
        </BentoCard>
      </Section>
    );
  }

  const offer = phase.offers[phase.index];
  if (!offer) return null;

  const decline = () => {
    // The downsell: next-best offer, until the merchant's cap.
    const next = phase.index + 1;
    setPhase(next < phase.offers.length ? { ...phase, index: next, error: null } : { kind: "done" });
  };

  const accept = async () => {
    setPhase({ ...phase, busy: true, error: null });
    try {
      const r = await fetch(`/api/checkout/orders/${proof.order_id}/upsell`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, phone: proof.phone, product_id: offer.product_id }),
      });
      const body = (await r.json()) as { success?: boolean; total?: number };
      if (r.ok && body.success && typeof body.total === "number") {
        setPhase({ kind: "accepted", total: body.total });
        return;
      }
      // The order moved on (ops touched it, window closed, stock went).
      // Say so briefly and stop offering — retrying cannot help.
      setPhase({ kind: "done" });
    } catch {
      setPhase({ ...phase, busy: false, error: locale === "en" ? "Couldn't add it. Your order is unchanged." : "ما كدرنا نضيفها. طلبك مثل ما هو." });
    }
  };

  return (
    <Section density="dense">
      <BentoCard bg="butter" size="sm" className="p-bk-md" data-layer="post-purchase-offer">
        <p className="mb-bk-2xs font-label text-[11px] font-bold uppercase tracking-[0.15em] text-bk-ink-soft">
          {t(props.eyebrow_i18n).replace("{discount}", String(offer.discount_percentage))}
        </p>
        <h2 className="font-display text-lg font-black text-bk-ink text-balance">
          {offer.headline || t(props.heading_i18n)}
        </h2>
        <div className="mt-bk-sm flex items-center gap-bk-sm">
          {offer.image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- 64px thumbnail of merchant media
            <img src={offer.image_url} alt="" className="h-16 w-16 shrink-0 rounded-bk-input object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-body text-sm font-bold text-bk-ink">{offer.name}</p>
            {offer.description && (
              <p className="font-body text-xs text-bk-ink-soft">{offer.description}</p>
            )}
            <p className="mt-0.5 flex items-baseline gap-1.5">
              <span className="font-display text-base font-black tabular-nums text-bk-primary">
                <bdi>{formatPrice(offer.offer_price, locale)}</bdi>
              </span>
              <span className="font-body text-xs tabular-nums text-bk-ink-soft line-through">
                <bdi>{formatPrice(offer.base_price, locale)}</bdi>
              </span>
            </p>
          </div>
        </div>
        {phase.error && (
          <p role="alert" className="mt-bk-xs font-body text-sm text-bk-danger">{phase.error}</p>
        )}
        <div className="mt-bk-md flex flex-col gap-bk-xs sm:flex-row">
          <ChunkyButton type="button" bg="pink" size="lg" onClick={accept} disabled={phase.busy} aria-busy={phase.busy}>
            {t(props.accept_label_i18n)}
          </ChunkyButton>
          <button
            type="button"
            onClick={decline}
            disabled={phase.busy}
            className={cn("min-h-11 px-bk-sm font-label text-sm text-bk-ink-soft underline hover:text-bk-ink", PRESSABLE)}
          >
            {t(props.decline_label_i18n)}
          </button>
        </div>
      </BentoCard>
    </Section>
  );
}
