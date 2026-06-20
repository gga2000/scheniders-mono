// =====================================================================
// Section — product_reviews
// =====================================================================
// PDP photo reviews: real rating summary (average + distribution), the list
// of APPROVED reviews with their photos, and a submit form. Submissions POST
// to /api/reviews (multipart) and land as `pending` until the merchant
// moderates them — so nothing user-supplied shows publicly unreviewed.
// =====================================================================

"use client";

import * as React from "react";
import { z } from "zod";
import { resolveI18n, computeRatingSummary } from "@scheniders/shared";
import type { ProductReview, RatingSummary } from "@scheniders/shared";
import {
  Section,
  SectionHeader,
  MaterialIcon,
  ChunkyButton,
} from "./helpers/primitives";
import { i18nStringOptional } from "./_schema";
import { registerSection } from "./_registry";
import type { SectionDefinition, SectionRenderContext } from "./_types";

const schema = z.object({
  heading_i18n: i18nStringOptional,
  show_form: z.boolean(),
});

type Props = z.infer<typeof schema>;

const defaultProps: Props = {
  heading_i18n: { en: "Customer reviews", ar: "آراء العملاء" },
  show_form: true,
};

const EMPTY_SUMMARY: RatingSummary = {
  average: 0,
  count: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

/** Single star. The Material Symbols font fills via the `FILL` axis, not a
 *  separate glyph name — so an empty star is the same "star" glyph at FILL 0. */
function Star({ filled }: { filled: boolean }): React.ReactElement {
  return (
    <span
      className="material-symbols-outlined"
      aria-hidden="true"
      style={{
        fontVariationSettings: filled ? "'FILL' 1" : "'FILL' 0",
        color: filled ? undefined : "rgb(26 26 26 / 0.25)",
      }}
    >
      star
    </span>
  );
}

function Stars({
  value,
  className,
}: {
  value: number;
  className?: string;
}): React.ReactElement {
  const filled = Math.round(value);
  return (
    <span
      className={`inline-flex items-center text-bk-primary ${className ?? ""}`}
      aria-label={`${value} / 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} filled={n <= filled} />
      ))}
    </span>
  );
}

function ProductReviewsRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}): React.ReactElement | null {
  const product = ctx.product;
  const locale = ctx.runtime.locale;
  const t = React.useCallback(
    (en: string, ar: string): string => (locale === "en" ? en : ar),
    [locale],
  );

  const tenantId = ctx.tenant?.id;
  const productId = product?.id;

  const [reviews, setReviews] = React.useState<ProductReview[]>([]);
  const [summary, setSummary] = React.useState<RatingSummary>(EMPTY_SUMMARY);

  // Form state.
  const [rating, setRating] = React.useState(0);
  const [name, setName] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!tenantId || !productId) return;
    let active = true;
    const params = new URLSearchParams({
      product_id: productId,
      tenant_id: tenantId,
    });
    fetch(`/api/reviews?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { reviews: ProductReview[]; summary: RatingSummary } | null) => {
        if (!active || !data) return;
        setReviews(data.reviews ?? []);
        setSummary(data.summary ?? computeRatingSummary(data.reviews ?? []));
      })
      .catch(() => {
        /* network blip — section just shows the empty/CTA state */
      });
    return () => {
      active = false;
    };
  }, [tenantId, productId]);

  if (!product || !tenantId || !productId) return null;

  const heading = resolveI18n(props.heading_i18n, locale) || t("Customer reviews", "آراء العملاء");

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (rating < 1) {
      setError(t("Please pick a rating.", "يرجى اختيار تقييم."));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("tenant_id", tenantId!);
      fd.set("product_id", productId!);
      fd.set("rating", String(rating));
      if (name.trim()) fd.set("author_name", name.trim());
      if (title.trim()) fd.set("title", title.trim());
      if (body.trim()) fd.set("body", body.trim());
      for (const f of files) fd.append("photos", f);

      const res = await fetch("/api/reviews", { method: "POST", body: fd });
      if (!res.ok) {
        setError(t("Could not submit. Try again.", "تعذّر الإرسال. حاول مجددًا."));
        return;
      }
      setSubmitted(true);
      setRating(0);
      setName("");
      setTitle("");
      setBody("");
      setFiles([]);
    } catch {
      setError(t("Could not submit. Try again.", "تعذّر الإرسال. حاول مجددًا."));
    } finally {
      setSubmitting(false);
    }
  }

  const distRows = [5, 4, 3, 2, 1] as const;
  const maxBar = Math.max(1, summary.count);
  const inputCls =
    "w-full rounded-xl border-2 border-bk-ink/15 bg-white px-3 py-2 font-body text-bk-ink focus:border-bk-primary focus:outline-none";

  return (
    <Section>
      <SectionHeader title={heading} />

      {/* Summary */}
      <div className="mt-bk-md flex flex-col gap-bk-md sm:flex-row sm:items-center sm:gap-bk-lg">
        <div className="flex flex-col items-center sm:items-start">
          <span className="font-display text-5xl font-black text-bk-ink">
            <bdi>{summary.average.toFixed(1)}</bdi>
          </span>
          <Stars value={summary.average} className="text-2xl" />
          <span className="font-label mt-1 text-xs uppercase tracking-[0.2em] text-bk-ink-soft">
            {summary.count === 1
              ? t("1 review", "تقييم واحد")
              : t(`${summary.count} reviews`, `${summary.count} تقييم`)}
          </span>
        </div>
        <div className="flex-1 space-y-1">
          {distRows.map((star) => (
            <div key={star} className="flex items-center gap-bk-xs">
              <span className="w-6 text-right font-label text-xs text-bk-ink-soft tabular-nums">
                {star}
              </span>
              <MaterialIcon name="star" className="text-sm text-bk-primary" />
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-bk-ink/10">
                <span
                  className="block h-full rounded-full bg-bk-primary"
                  style={{
                    width: `${(summary.distribution[star] / maxBar) * 100}%`,
                  }}
                />
              </span>
              <span className="w-6 font-label text-xs text-bk-ink-soft tabular-nums">
                {summary.distribution[star]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Review list */}
      {reviews.length > 0 && (
        <ul className="mt-bk-lg space-y-bk-md">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border-2 border-bk-ink/10 bg-white p-bk-md"
            >
              <div className="flex items-center justify-between gap-bk-sm">
                <span className="font-label font-bold text-bk-ink">
                  {r.author_name?.trim() || t("Verified buyer", "مشترٍ موثّق")}
                </span>
                <Stars value={r.rating} />
              </div>
              {r.title && (
                <p className="mt-1 font-display font-bold text-bk-ink">{r.title}</p>
              )}
              {r.body && (
                <p className="mt-1 font-body text-bk-ink-soft">{r.body}</p>
              )}
              {r.photo_urls.length > 0 && (
                <div className="mt-bk-sm flex flex-wrap gap-bk-xs">
                  {r.photo_urls.map((url, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt=""
                      loading="lazy"
                      className="h-20 w-20 rounded-lg object-cover"
                    />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Submit form */}
      {props.show_form && (
        <div className="mt-bk-lg rounded-2xl border-2 border-bk-ink/10 bg-bk-surface p-bk-md">
          {submitted ? (
            <p className="font-label font-bold text-bk-ink">
              {t(
                "Thanks! Your review is pending approval.",
                "شكرًا! تقييمك قيد المراجعة.",
              )}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-bk-sm">
              <p className="font-display font-bold text-bk-ink">
                {t("Write a review", "اكتب تقييمًا")}
              </p>
              <div
                className="flex items-center gap-1"
                role="radiogroup"
                aria-label={t("Your rating", "تقييمك")}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n}`}
                    aria-pressed={rating >= n}
                    onClick={() => setRating(n)}
                    className="text-3xl text-bk-primary"
                  >
                    <Star filled={rating >= n} />
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("Your name", "اسمك")}
                maxLength={80}
                className={inputCls}
              />
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("Title (optional)", "العنوان (اختياري)")}
                maxLength={120}
                className={inputCls}
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t("Share your experience", "شارك تجربتك")}
                maxLength={2000}
                rows={3}
                className={inputCls}
              />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) =>
                  setFiles(Array.from(e.target.files ?? []).slice(0, 4))
                }
                className="block w-full font-body text-sm text-bk-ink-soft"
              />
              {files.length > 0 && (
                <p className="font-label text-xs text-bk-ink-soft">
                  {t(`${files.length} photo(s) attached`, `${files.length} صورة مرفقة`)}
                </p>
              )}
              {error && (
                <p className="font-label text-sm text-red-600">{error}</p>
              )}
              <ChunkyButton type="submit" disabled={submitting}>
                {submitting
                  ? t("Sending…", "جارٍ الإرسال…")
                  : t("Submit review", "إرسال التقييم")}
              </ChunkyButton>
            </form>
          )}
        </div>
      )}
    </Section>
  );
}

const definition: SectionDefinition<Props> = {
  type: "product_reviews",
  category: "trust",
  name: { en: "Product reviews", ar: "تقييمات المنتج" },
  description: {
    en: "Real customer ratings, photos, and a review submission form.",
    ar: "تقييمات حقيقية للعملاء مع الصور ونموذج لإرسال تقييم.",
  },
  thumbnail: "/sections/product_reviews.svg",
  valid_on: ["product"],
  schema,
  defaultProps,
  render: ProductReviewsRender,
};

registerSection(definition);
export default definition;
