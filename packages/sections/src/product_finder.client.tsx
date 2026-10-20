"use client";

import { useMemo, useState } from "react";
import {
  rankByAnswers,
  resolveI18n,
  type FinderAnswer,
  type LocaleCode,
} from "@scheniders/shared";
import type { Props } from "./product_finder";
import type { SectionRenderContext } from "./_types";
import type { Product } from "./types";
import { Section, SectionHeader, ChunkyButton } from "./helpers/primitives";
import { PricePillCard } from "./product_grid";
import { cn, PRESSABLE } from "./helpers/utils";

export function ProductFinderRender({
  props,
  ctx,
}: {
  props: Props;
  ctx: SectionRenderContext;
}) {
  const locale = ctx.runtime.locale;

  // Only ask about attributes the catalogue can actually answer. A question
  // no product can respond to wastes a step and makes the result look
  // arbitrary.
  const questions = useMemo(() => {
    const answerable = new Set(
      ctx.products.flatMap((p) => (p.attributes ?? []).map((a) => a.def.key)),
    );
    return props.questions.filter(
      (q) => q.answers.length > 0 && answerable.has(q.attribute_key),
    );
  }, [props.questions, ctx.products]);

  const [step, setStep] = useState(-1); // -1 = intro, questions.length = results
  const [answers, setAnswers] = useState<FinderAnswer[]>([]);

  const results = useMemo(() => {
    if (step < questions.length) return [];
    return rankByAnswers(ctx.products, (p: Product) => p.attributes ?? [], answers)
      .slice(0, props.result_limit)
      .map((m) => m.item);
  }, [step, questions.length, ctx.products, answers, props.result_limit]);

  // Nothing to ask, so nothing to render — better than an empty quiz.
  if (questions.length === 0) return null;

  const heading = resolveI18n(props.heading_i18n, locale);
  const t = (s: Parameters<typeof resolveI18n>[0]) => resolveI18n(s, locale);

  const answer = (attributeKey: string, value: string | null, weight?: number) => {
    setAnswers((prev) => {
      const without = prev.filter((a) => a.attribute_key !== attributeKey);
      return value === null ? without : [...without, { attribute_key: attributeKey, value, weight }];
    });
    setStep((s) => s + 1);
  };

  const restart = () => {
    setAnswers([]);
    setStep(-1);
  };

  return (
    <Section>
      <div className="mx-auto max-w-2xl">
        <SectionHeader title={heading} subtitle={step === -1 ? t(props.intro_i18n) : undefined} />

        {step === -1 && (
          <ChunkyButton type="button" bg="butter" size="lg" onClick={() => setStep(0)}>
            {t(props.start_label_i18n)}
          </ChunkyButton>
        )}

        {step >= 0 && step < questions.length && (
          <div>
            {/* Progress reads as "2 / 3", which tells the shopper how much
                is left — the single biggest reason people abandon a quiz. */}
            <p className="mb-bk-xs font-label text-xs uppercase tracking-[0.15em] text-bk-ink-soft tabular-nums">
              {step + 1} / {questions.length}
            </p>
            <div
              className="mb-bk-md h-1 w-full overflow-hidden rounded-bk-pill bg-bk-surface-alt"
              role="progressbar"
              aria-valuenow={step + 1}
              aria-valuemin={1}
              aria-valuemax={questions.length}
            >
              <div
                className="h-full rounded-bk-pill bg-bk-primary transition-[width] duration-bk-base motion-reduce:transition-none"
                style={{ width: `${((step + 1) / questions.length) * 100}%` }}
              />
            </div>

            <fieldset>
              <legend className="mb-bk-sm font-display text-xl font-black text-bk-ink text-balance">
                {t(questions[step].prompt_i18n)}
              </legend>
              {questions[step].help_i18n && (
                <p className="mb-bk-sm font-body text-sm text-bk-ink-soft">
                  {t(questions[step].help_i18n)}
                </p>
              )}
              <div className="flex flex-col gap-bk-xs">
                {questions[step].answers.map((a, i) => (
                  <button
                    key={`${a.value}-${i}`}
                    type="button"
                    onClick={() => answer(questions[step].attribute_key, a.value, a.weight)}
                    className={cn(
                      "w-full rounded-bk-input border border-bk-divider bg-bk-surface px-bk-md py-bk-sm text-start font-body text-base text-bk-ink hover:border-bk-ink min-h-11",
                      PRESSABLE,
                    )}
                  >
                    {t(a.label_i18n)}
                  </button>
                ))}
                {/* Skipping is a real answer — forcing a choice on a question
                    the shopper has no opinion about corrupts the ranking. */}
                <button
                  type="button"
                  onClick={() => answer(questions[step].attribute_key, null)}
                  className="mt-bk-2xs self-start px-1 font-label text-sm text-bk-ink-soft underline hover:text-bk-ink min-h-11"
                >
                  {t(props.skip_label_i18n)}
                </button>
              </div>
            </fieldset>
          </div>
        )}

        {step >= questions.length && (
          <div>
            <h3 className="mb-bk-md font-display text-xl font-black text-bk-ink">
              {t(props.result_heading_i18n)}
            </h3>
            {results.length > 0 ? (
              <div className="grid grid-cols-2 gap-bk-sm sm:gap-bk-md md:grid-cols-4">
                {results.map((product, i) => (
                  <PricePillCard
                    key={product.id}
                    product={product}
                    locale={locale as LocaleCode}
                    priority={i < 2}
                  />
                ))}
              </div>
            ) : null}
            <button
              type="button"
              onClick={restart}
              className="mt-bk-md px-1 font-label text-sm text-bk-ink-soft underline hover:text-bk-ink min-h-11"
            >
              {t(props.restart_label_i18n)}
            </button>
          </div>
        )}
      </div>
    </Section>
  );
}
