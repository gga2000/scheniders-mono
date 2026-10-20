// =====================================================================
// Section — product_reviews
// =====================================================================
// PDP photo reviews: real rating summary (average + distribution), the list
// of APPROVED reviews with their photos, and a submit form. Submissions POST
// to /api/reviews (multipart) and land as `pending` until the merchant
// moderates them — so nothing user-supplied shows publicly unreviewed.
//
// Data flow (P1-13): the product page preloads approved reviews into
// `ctx.product.reviews`, so the list + true distribution are in the SSR
// HTML. The `/api/reviews` GET is only used (a) when that prop is absent
// (other templates / pages) and (b) as revalidation after a submit.
// =====================================================================
// Client half of `product_reviews` — the component (hooks / browser APIs). The
// schema, defaults and registry entry live in `./product_reviews.tsx` so the
// definition is server-safe; only this module ships to the browser.
// =====================================================================

"use client";

import * as React from "react";
import Image from "next/image";
import { resolveI18n, computeRatingSummary } from "@scheniders/shared";
import type { ProductReview, RatingSummary } from "@scheniders/shared";
import { CenteredSectionHeader, ChunkyButton, MaterialIcon, Section, Stars } from "./helpers/primitives";
import { formatCount } from "./helpers/format";
import { isOptimizableImageHost } from "./helpers/image";
import { cn } from "./helpers/utils";
import type { SectionRenderContext } from "./_types";
import type { ReviewSummaryItem } from "./types";
import type { Props } from "./product_reviews";

/** Mirrors `/api/reviews` POST's photo cap — over-picks are refused with a
 *  visible message instead of being silently sliced. */
const MAX_PHOTOS = 4;

const EMPTY_SUMMARY: RatingSummary = {
  average: 0,
  count: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

type Locale = "ar" | "en" | "ku";

function reviewCountLabel(count: number, locale: Locale): string {
  if (locale === "ku") return count === 1 ? "1 هەڵسەنگاندن" : `${count} هەڵسەنگاندن`;
  return formatCount(count, locale, {
    one: locale === "en" ? "1 review" : "تقييم واحد",
    two: "تقييمان",
    few: "{count} تقييمات",
    many: "{count} تقييماً",
    other: locale === "en" ? "{count} reviews" : "{count} تقييم",
  });
}

function photosAttachedLabel(count: number, locale: Locale): string {
  if (locale === "ku") return count === 1 ? "1 وێنە هاوپێچ کراوە" : `${count} وێنە هاوپێچ کراوە`;
  return formatCount(count, locale, {
    one: locale === "en" ? "1 photo attached" : "صورة واحدة مرفقة",
    two: "صورتان مرفقتان",
    few: "{count} صور مرفقة",
    other: locale === "en" ? "{count} photos attached" : "{count} صورة مرفقة",
  });
}

/** Summary + "is the per-star distribution real?" flag. A product row only
 *  carries count/average, so bars stay hidden until a full list is known. */
function summarise(
  list: ReviewSummaryItem[] | undefined,
  product: { review_count?: number; avg_rating?: number } | undefined,
): { summary: RatingSummary; distributionKnown: boolean } {
  if (list) {
    return { summary: computeRatingSummary(list), distributionKnown: true };
  }
  if (product?.review_count && product.review_count > 0) {
    return {
      summary: {
        average: product.avg_rating ?? 0,
        count: product.review_count,
        distribution: EMPTY_SUMMARY.distribution,
      },
      distributionKnown: false,
    };
  }
  return { summary: EMPTY_SUMMARY, distributionKnown: false };
}

type LightboxImage = { url: string; alt: string };

/**
 * Native `<dialog>` lightbox: `showModal()` gives focus trapping + Escape
 * for free; a click on the backdrop (the dialog element itself, outside its
 * child) closes it; page scroll is locked while it's open.
 */
function PhotoLightbox({
  image,
  onClose,
  closeLabel,
}: {
  image: LightboxImage | null;
  onClose: () => void;
  closeLabel: string;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (image) {
      if (!dialog.open) dialog.showModal();
      const prev = document.documentElement.style.overflow;
      document.documentElement.style.overflow = "hidden";
      return () => {
        document.documentElement.style.overflow = prev;
      };
    }
    if (dialog.open) dialog.close();
    return undefined;
  }, [image]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto max-h-[100dvh] max-w-[100vw] bg-transparent p-0 backdrop:bg-bk-ink/80 open:flex open:items-center open:justify-center"
    >
      {image && (
        <div className="relative w-[min(92vw,56rem)] h-[min(80dvh,56rem)]">
          <Image
            src={image.url}
            alt={image.alt}
            fill
            unoptimized={!isOptimizableImageHost(image.url)}
            sizes="92vw"
            className="object-contain"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="absolute end-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-full bg-bk-surface text-bk-ink shadow-md focus-visible:outline-none focus-visible:ring-2 ring-bk-focus"
          >
            <MaterialIcon name="close" />
          </button>
        </div>
      )}
    </dialog>
  );
}

export function ProductReviewsRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}): React.ReactElement | null {
  const product = ctx.product;
  const locale = ctx.runtime.locale;
  const t = React.useCallback(
    // Kurdish UI chrome reads the Arabic line here; the review counts below
    // do carry a Kurdish shape because a number is read closely.
    (en: string, ar: string): string => (locale === "en" ? en : ar),
    [locale],
  );

  const tenantId = ctx.tenant?.id;
  const productId = product?.id;
  const ssrReviews = product?.reviews;
  const fileInputId = React.useId();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [reviews, setReviews] = React.useState<ReviewSummaryItem[]>(
    () => ssrReviews ?? [],
  );
  const [{ summary, distributionKnown }, setSummaryState] = React.useState(() =>
    summarise(ssrReviews, product),
  );
  // Bumped after a successful submit → one revalidating fetch.
  const [refresh, setRefresh] = React.useState(0);

  // Form state.
  const [rating, setRating] = React.useState(0);
  const formRef = React.useRef<HTMLFormElement>(null);

  // Arriving on #reviews means the shopper was SENT here to write one (the
  // tracker's "rate your order"). Take them to the form and put focus on
  // the first star, so the intent survives the page load. Only on the hash
  // — a normal PDP visit is never scrolled.
  React.useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#reviews") return;
    const form = formRef.current;
    if (!form) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    form.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    form.querySelector<HTMLElement>('[role="radiogroup"] button')?.focus({ preventScroll: true });
  }, []);
  const [name, setName] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [photoError, setPhotoError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lightbox, setLightbox] = React.useState<LightboxImage | null>(null);

  const needsFetch = ssrReviews === undefined || refresh > 0;

  React.useEffect(() => {
    if (!tenantId || !productId || !needsFetch) return;
    let active = true;
    const params = new URLSearchParams({
      product_id: productId,
      tenant_id: tenantId,
    });
    fetch(`/api/reviews?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (data: { reviews: ProductReview[]; summary: RatingSummary } | null) => {
          if (!active || !data) return;
          const list = data.reviews ?? [];
          setReviews(list);
          setSummaryState({
            summary: data.summary ?? computeRatingSummary(list),
            distributionKnown: true,
          });
        },
      )
      .catch(() => {
        /* network blip — section keeps whatever it already shows */
      });
    return () => {
      active = false;
    };
  }, [tenantId, productId, needsFetch, refresh]);

  if (!product || !tenantId || !productId) return null;
  // Narrowed copies for the submit closure below (a hoisted function
  // declaration would not see the guard above).
  const tid = tenantId;
  const pid = productId;

  const heading =
    resolveI18n(props.heading_i18n, locale) ||
    t("Customer reviews", "آراء العملاء");

  function handlePickPhotos(e: React.ChangeEvent<HTMLInputElement>): void {
    const picked = Array.from(e.target.files ?? []);
    // Reset so re-picking the same files fires onChange again.
    e.target.value = "";
    if (picked.length === 0) return;
    if (picked.length > MAX_PHOTOS) {
      setPhotoError(
        t(
          `You can attach up to ${MAX_PHOTOS} photos.`,
          `يمكنك إرفاق ${MAX_PHOTOS} صور كحد أقصى.`,
        ),
      );
      return;
    }
    setPhotoError(null);
    setFiles(picked);
  }

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
      fd.set("tenant_id", tid);
      fd.set("product_id", pid);
      fd.set("rating", String(rating));
      if (name.trim()) fd.set("author_name", name.trim());
      if (title.trim()) fd.set("title", title.trim());
      if (body.trim()) fd.set("body", body.trim());
      for (const f of files) fd.append("photos", f);

      const res = await fetch("/api/reviews", { method: "POST", body: fd });
      if (!res.ok) {
        setError(
          t("Could not submit. Try again.", "تعذّر الإرسال. حاول مجددًا."),
        );
        return;
      }
      setSubmitted(true);
      setRating(0);
      setName("");
      setTitle("");
      setBody("");
      setFiles([]);
      setPhotoError(null);
      setRefresh((n) => n + 1);
    } catch {
      setError(
        t("Could not submit. Try again.", "تعذّر الإرسال. حاول مجددًا."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const distRows = [5, 4, 3, 2, 1] as const;
  const maxBar = Math.max(1, summary.count);
  const hasReviews = summary.count > 0;
  const inputCls =
    "w-full rounded-bk-input border-2 border-bk-ink/15 bg-bk-surface px-3 py-2 font-body text-bk-ink focus:border-bk-primary focus-visible:outline-none focus-visible:ring-2 ring-bk-focus focus-visible:ring-offset-2";
  const reviewPhotoAlt = (n: number) =>
    t(`Review photo ${n}`, `صورة التقييم ${n}`);

  return (
    // `id="reviews"` is the landing point for "rate your order" — the
    // order tracker links a delivered order to /products/<slug>#reviews.
    // Without the anchor that link lands at the top of the page.
    <Section id="reviews">
      <CenteredSectionHeader
        title={heading}
        align="start"
        titleField="heading_i18n"
      />

      {/* Summary — only when there is something real to summarise. A
          zero-review product gets one honest line, never "0.0" + empty bars. */}
      {hasReviews ? (
        <div className="mt-bk-md flex flex-col gap-bk-md sm:flex-row sm:items-center sm:gap-bk-lg">
          <div className="flex flex-col items-center sm:items-start">
            <span className="font-display text-5xl font-black text-bk-ink tabular-nums">
              <bdi>{summary.average.toFixed(1)}</bdi>
            </span>
            <Stars
              value={summary.average}
              size={24}
              label={`${summary.average.toFixed(1)} / 5`}
            />
            <span className="font-label mt-1 text-xs bk-caps tracking-[0.2em] text-bk-ink-soft tabular-nums">
              {reviewCountLabel(summary.count, locale)}
            </span>
          </div>
          {/* Per-star bars only once real counts are known — an aggregate
              seed alone would draw five empty bars under a real average. */}
          {distributionKnown && (
            <div className="flex-1 space-y-1">
              {distRows.map((star) => (
                <div key={star} className="flex items-center gap-bk-xs">
                  <span className="w-6 text-right font-label text-xs text-bk-ink-soft tabular-nums">
                    {star}
                  </span>
                  <Stars value={1} max={1} size={14} label={`${star} / 5`} />
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-bk-ink/10">
                    <span
                      className="block h-full rounded-full bg-bk-primary"
                      style={{
                        width: `${(summary.distribution[star] / maxBar) * 100}%`,
                      }}
                    />
                  </span>
                  <span
                    className="w-6 font-label text-xs text-bk-ink-soft tabular-nums"
                    data-star-count={star}
                  >
                    {summary.distribution[star]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-bk-md font-body text-base text-bk-ink-soft text-pretty">
          {t("Be the first to review", "كن أول من يقيّم هذا المنتج")}
        </p>
      )}

      {/* Review list */}
      {reviews.length > 0 && (
        <ul className="mt-bk-lg space-y-bk-md">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-bk-card border-2 border-bk-ink/10 bg-bk-surface p-bk-md"
            >
              <div className="flex items-center justify-between gap-bk-sm">
                <span className="font-label font-bold text-bk-ink">
                  {r.author_name?.trim() || t("Verified buyer", "مشترٍ موثّق")}
                </span>
                <Stars value={r.rating} size={16} label={`${r.rating} / 5`} />
              </div>
              {r.title && (
                <h3 className="mt-1 font-display font-bold text-bk-ink">
                  {r.title}
                </h3>
              )}
              {r.body && (
                <p className="mt-1 font-body text-bk-ink-soft text-pretty">
                  {r.body}
                </p>
              )}
              {r.photo_urls.length > 0 && (
                <div className="mt-bk-sm flex flex-wrap gap-bk-xs">
                  {r.photo_urls.map((url, i) => {
                    const alt = reviewPhotoAlt(i + 1);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setLightbox({ url, alt })}
                        aria-label={t("Enlarge photo", "تكبير الصورة")}
                        className="relative h-20 w-20 overflow-hidden rounded-bk-input focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2"
                      >
                        <Image
                          src={url}
                          alt={alt}
                          fill
                          unoptimized={!isOptimizableImageHost(url)}
                          sizes="80px"
                          className="object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <PhotoLightbox
        image={lightbox}
        onClose={() => setLightbox(null)}
        closeLabel={t("Close", "إغلاق")}
      />

      {/* Submit form */}
      {props.show_form && (
        <div className="mt-bk-lg rounded-bk-card border-2 border-bk-ink/10 bg-bk-surface p-bk-md">
          {submitted ? (
            <p
              role="status"
              aria-live="polite"
              className="font-label font-bold text-bk-ink"
            >
              {t(
                "Thanks! Your review is pending approval.",
                "شكرًا! تقييمك قيد المراجعة.",
              )}
            </p>
          ) : (
            <form ref={formRef} onSubmit={handleSubmit} className="space-y-bk-sm">
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
                    aria-pressed={rating >= n}
                    onClick={() => setRating(n)}
                    className="inline-flex h-11 w-11 items-center justify-center transition-transform duration-bk-fast motion-reduce:transition-none active:scale-[0.9]"
                  >
                    <Stars
                      value={rating >= n ? 1 : 0}
                      max={1}
                      size={28}
                      label={`${n}`}
                    />
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

              {/* Photo picker — the native "Choose Files" control is
                  visually hidden (still in the DOM + labelled); the styled
                  button is the single keyboard/touch target. */}
              <div className="space-y-bk-xs">
                <input
                  ref={fileInputRef}
                  id={fileInputId}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  tabIndex={-1}
                  aria-label={t(
                    `Add photos (up to ${MAX_PHOTOS})`,
                    `أضف صور (حتى ${MAX_PHOTOS})`,
                  )}
                  onChange={handlePickPhotos}
                  className="sr-only"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-bk-ink/15 bg-bk-surface px-4 py-2 font-label text-sm font-bold text-bk-ink",
                    "transition-[opacity,transform] duration-bk-fast motion-reduce:transition-none hover:opacity-90 active:scale-[0.98]",
                    "focus-visible:outline-none focus-visible:ring-2 ring-bk-focus ring-offset-2",
                  )}
                >
                  <MaterialIcon name="add_a_photo" className="text-base" />
                  {t(
                    `Add photos (up to ${MAX_PHOTOS})`,
                    `أضف صور (حتى ${MAX_PHOTOS})`,
                  )}
                </button>
                {files.length > 0 && (
                  <ul
                    className="flex flex-wrap gap-bk-xs"
                    aria-label={photosAttachedLabel(files.length, locale)}
                  >
                    {files.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="inline-flex max-w-full items-center gap-1 rounded-full bg-bk-ink/5 py-1 pe-1 ps-3 font-label text-xs text-bk-ink"
                      >
                        <span className="truncate" dir="auto">
                          {f.name}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setFiles((prev) => prev.filter((_, j) => j !== i))
                          }
                          aria-label={t(`Remove ${f.name}`, `إزالة ${f.name}`)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-bk-ink/10"
                        >
                          <MaterialIcon name="close" className="text-sm" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {files.length > 0 && (
                  <p className="font-label text-xs text-bk-ink-soft tabular-nums">
                    {photosAttachedLabel(files.length, locale)}
                  </p>
                )}
                {photoError && (
                  <p role="alert" className="font-label text-sm text-bk-danger">
                    {photoError}
                  </p>
                )}
              </div>

              {error && (
                <p role="alert" className="font-label text-sm text-bk-danger">
                  {error}
                </p>
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
