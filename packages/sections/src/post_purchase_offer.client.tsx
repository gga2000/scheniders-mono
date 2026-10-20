"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { resolveI18n, type LocaleCode } from "@scheniders/shared";
import type { Props } from "./post_purchase_offer";
import type { SectionRenderContext } from "./_types";
import { BentoCard, ChunkyButton, Section } from "./helpers/primitives";
import { formatPrice } from "./helpers/format";
import { isOptimizableImageHost } from "./helpers/image";
import { cn, PRESSABLE } from "./helpers/utils";

/** Same stash the confirmation section reads; only the fields needed here. */
const STASH_KEY = "schn:last-order";
const STASH_TTL_MS = 60 * 60 * 1000;
const PROOF_HEADER = "x-upsell-proof";

interface Proof {
  order_id: string;
  upsell_token: string;
}

/** The proof the checkout response stashed, or null. sessionStorage throws in
 *  some privacy modes and blocked-storage browsers; that is "no proof", which
 *  renders no offer — the same outcome as a shopper who never ordered. */
function readProof(now: number): Proof | null {
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(STASH_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.ts !== "number" || now - o.ts > STASH_TTL_MS) return null;
  if (typeof o.order_id !== "string" || typeof o.upsell_token !== "string") return null;
  return { order_id: o.order_id, upsell_token: o.upsell_token };
}

/** Keep the thank-you recap honest after an accept: the stash is what the
 *  confirmation section re-reads on a reload. Storage failures leave the old
 *  recap, which the order itself (and the merchant's call) corrects. */
function recordAccepted(offer: Offer, total: number): void {
  try {
    const raw = window.sessionStorage.getItem(STASH_KEY);
    if (!raw) return;
    const stash = JSON.parse(raw) as Record<string, unknown>;
    const items = Array.isArray(stash.items) ? stash.items : [];
    window.sessionStorage.setItem(
      STASH_KEY,
      JSON.stringify({
        ...stash,
        items: [...items, { name: offer.name, variant: null, qty: 1, price: offer.offer_price }],
        total,
      }),
    );
  } catch (e) {
    console.warn("[post_purchase_offer] could not update the order recap", e);
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
  const [proof, setProof] = useState<Proof | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  // The proof lives only in this browser's session; nothing renders on the
  // server, so a shared thank-you link shows no offer to anyone else.
  useEffect(() => {
    setProof(readProof(Date.now()));
  }, []);

  useEffect(() => {
    if (!proof) return;
    let cancelled = false;
    fetch(`/api/checkout/orders/${proof.order_id}/upsell`, {
      headers: { [PROOF_HEADER]: proof.upsell_token },
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ offers?: Offer[] }>) : { offers: [] }))
      .then((body) => {
        if (cancelled) return;
        const offers = (body.offers ?? []).slice(0, props.max_offers);
        setPhase(
          offers.length
            ? { kind: "offering", offers, index: 0, busy: false, error: null }
            : { kind: "done" },
        );
      })
      .catch((e: unknown) => {
        // An offer is optional: on a network failure the thank-you page
        // simply shows none. The order is already placed and unaffected.
        console.warn("[post_purchase_offer] offers unavailable", e);
        if (!cancelled) setPhase({ kind: "done" });
      });
    return () => {
      cancelled = true;
    };
  }, [proof, props.max_offers]);

  if (!proof || phase.kind === "idle" || phase.kind === "done") return null;

  const t = (s: Parameters<typeof resolveI18n>[0]) => resolveI18n(s, locale);

  if (phase.kind === "accepted") {
    return (
      <Section density="dense">
        <BentoCard bg="mint" size="sm" className="p-bk-md text-center">
          <p className="font-display text-base font-black text-bk-ink" role="status">
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
        headers: { "content-type": "application/json", [PROOF_HEADER]: proof.upsell_token },
        body: JSON.stringify({ product_id: offer.product_id }),
      });
      const body = (await r.json()) as { success?: boolean; total?: number };
      if (r.ok && body.success && typeof body.total === "number") {
        recordAccepted(offer, body.total);
        setPhase({ kind: "accepted", total: body.total });
        return;
      }
      // The order moved on (ops touched it, the window closed, stock went).
      // Retrying cannot help, so stop offering.
      setPhase({ kind: "done" });
    } catch (e) {
      console.warn("[post_purchase_offer] accept failed", e);
      setPhase({
        ...phase,
        busy: false,
        error: t({ en: "Couldn't add it. Your order is unchanged.", ar: "ما كدرنا نضيفها. طلبك مثل ما هو." }),
      });
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
            <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-bk-input">
              <Image
                src={offer.image_url}
                alt=""
                fill
                sizes="64px"
                unoptimized={!isOptimizableImageHost(offer.image_url)}
                className="object-cover"
              />
            </span>
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
              {offer.offer_price < offer.base_price && (
                <span className="font-body text-xs tabular-nums text-bk-ink-soft line-through">
                  <bdi>{formatPrice(offer.base_price, locale)}</bdi>
                </span>
              )}
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
