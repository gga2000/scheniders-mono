"use client";

// =====================================================================
// pdp_direct_order — express layout
// =====================================================================
// The compact first-screen funnel: hero stage → identity label → price
// plate → offer clock → progressive form → quantity/payment line → total
// + CTA. Opt-in via `layout: "express"`; it renders from the same model
// as classic (one submit path, one validation, one pixel flow) and only
// changes the markup.
// =====================================================================

import { useState } from "react";
import { cn, resolveI18n } from "@scheniders/shared";
import { formatPrice } from "../helpers/format";
import { MaterialIcon } from "../helpers/primitives";
import { stockLeftFor } from "../helpers/variant-store";
import { DEFAULT_DECK_ROTATE_MS } from "../pdp_direct_order";
import { DIRECT_ORDER_FORM_ID } from "../pdp_direct_order.client";
import { CheckoutRow } from "./checkout-row";
import { ExpressForm } from "./express-form";
import { HeroStage } from "./hero-stage";
import { IdentityLabel, displayNameOf } from "./identity-label";
import type { ExpressModel } from "./model";
import { OfferClock } from "./offer-clock";
import { OrderLine } from "./order-line";
import { phoneDigits, phoneIssue } from "./phone";
import { PricePlate } from "./price-plate";

export function PdpExpress({ model: m }: { model: ExpressModel }) {
  const { props, product, locale } = m;
  const [landmark, setLandmark] = useState("");
  const showGallery = props.show_gallery !== false;
  const clock = props.offer_clock;

  return (
    <section className="pb-bk-md" data-pdp-layout="express">
      {showGallery && (
        <HeroStage
          images={m.galleryImages}
          alt={displayNameOf(product)}
          locale={locale}
          intervalMs={props.deck_rotate_ms ?? DEFAULT_DECK_ROTATE_MS}
        />
      )}

      <div className="mx-auto max-w-2xl space-y-bk-sm px-4 pt-bk-sm">
        <IdentityLabel
          product={product}
          locale={locale}
          reviewCount={m.reviewCount}
          avgRating={m.avgRating}
          showRating={!!resolveI18n(props.rating_chip_i18n, locale)}
        />

        {props.show_price_row && (
          <div className="space-y-2">
            <PricePlate
              price={m.price}
              compareAt={m.compareAt}
              discountPct={m.discountPct}
              qty={m.qty}
              showSavings={props.show_savings === true}
              compareLabel={resolveI18n(props.compare_label_i18n, locale)}
              priceLabel={resolveI18n(props.price_label_i18n, locale)}
              locale={locale}
              flash={m.priceFlashAt !== null}
              plateRef={m.priceRowRef}
            />
            {clock && m.onSale && m.discountPct !== null && (
              <OfferClock clock={clock} locale={locale} />
            )}
          </div>
        )}

        <form
          id={DIRECT_ORDER_FORM_ID}
          noValidate
          onSubmit={(e) => {
            // The express phone check is stricter than the shared one (it
            // also knows the operator ranges): a number it rejects never
            // posts, and focus goes back to the field showing why.
            const issue = phoneIssue(phoneDigits(m.form.phone), true);
            if (m.form.phone.trim() !== "" && issue && issue !== "short") {
              e.preventDefault();
              document.getElementById(m.fieldA11yCore("phone").id)?.focus();
              return;
            }
            void m.onSubmit(e, { addressSuffix: landmark });
          }}
          onFocusCapture={m.onFormFocus}
          className="scroll-mt-24 space-y-bk-md pt-bk-xs"
        >
          {m.oos ? null : <ExpressForm m={m} landmark={landmark} setLandmark={setLandmark} />}

          {m.chosen.variants.length > 1 && !m.chosen.pickerMounted && (
            <div
              ref={m.variantPillsRef}
              data-layer="variants"
              data-layer-label="Options"
              role="group"
              aria-label={m.s("chooseVariant")}
              className="space-y-bk-xs"
            >
              <div className="flex flex-wrap gap-bk-xs">
                {m.chosen.variants.map((v) => {
                  const left = stockLeftFor(product, v);
                  const active = m.chosen.variant?.id === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={active}
                      disabled={left <= 0}
                      onClick={() => {
                        m.chosen.select(v.id);
                        m.setVariantError(false);
                      }}
                      className={cn(
                        "min-h-11 rounded-bk-pill border-bk-bold px-4 font-bk-display text-sm font-black transition-colors duration-bk-fast",
                        active
                          ? "border-bk-ink bg-bk-ink text-bk-surface"
                          : "border-bk-ink bg-bk-surface text-bk-ink",
                        left <= 0 && "opacity-50 line-through",
                      )}
                    >
                      {v.name}
                      {v.price !== product.price && (
                        <span className="ms-1.5 font-bk-body text-xs font-bold tabular-nums">
                          <bdi>{formatPrice(v.price, locale)}</bdi>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              {m.variantError && (
                <p role="alert" className="font-bk-body text-xs font-bold text-bk-danger">
                  {m.s("chooseVariantFirst")}
                </p>
              )}
            </div>
          )}

          {!m.oos && (
            <OrderLine
              locale={locale}
              qty={m.qty}
              setQty={m.setQty}
              maxQty={m.maxQty}
              atMinQty={m.atMinQty}
              atMaxQty={m.atMaxQty}
              decreaseLabel={m.s("decrease")}
              increaseLabel={m.s("increase")}
              soon={props.payment_soon ?? []}
              idBase={m.submitErrorId}
            />
          )}

          <CheckoutRow m={m} locale={locale} />
        </form>

        {props.show_description && product.description && (
          <div className="border-t border-bk-divider pt-bk-md">
            <p className="whitespace-pre-line font-bk-body text-sm leading-relaxed text-bk-ink-soft">
              {product.description}
            </p>
          </div>
        )}

        {m.featureCards.length > 0 && (
          <div className="space-y-bk-sm border-t border-bk-divider pt-bk-md">
            {m.featureCardsTitle && (
              <h2
                className="text-center font-bk-display text-lg font-black"
                data-i18n-field="feature_cards_title_i18n"
              >
                {m.featureCardsTitle}
              </h2>
            )}
            <div className="grid grid-cols-1 gap-bk-sm sm:grid-cols-2">
              {m.featureCards.map((c, i) => (
                <div
                  key={`${c.title}-${i}`}
                  className="flex items-start gap-3 rounded-bk-card border-bk border-bk-divider bg-bk-surface-alt p-3"
                >
                  {c.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element -- arbitrary tenant-hosted note art, small fixed size (same as classic)
                    <img
                      src={c.image_url}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-bk-input object-cover"
                      loading="lazy"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="font-bk-body text-sm font-bold text-bk-ink">{c.title}</p>
                    <p className="font-bk-body text-xs leading-relaxed text-bk-ink-soft">
                      {c.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {m.trustChips.length > 0 && (
          <div className="flex flex-wrap items-start justify-center gap-bk-md border-t border-bk-divider pt-bk-md">
            {m.trustChips.map((c, i) => (
              <div key={`${c.icon}-${i}`} className="flex w-20 flex-col items-center gap-1 text-center">
                <span aria-hidden="true" className="text-bk-ink">
                  <MaterialIcon name={c.icon} className="text-2xl" />
                </span>
                <span
                  className="font-bk-body text-[11px] font-bold leading-tight text-bk-ink-soft"
                  data-i18n-field="trust_chips.label_i18n"
                >
                  {resolveI18n(c.label_i18n, locale)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
