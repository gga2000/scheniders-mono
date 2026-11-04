"use client";

import { AlertTriangle, ArrowRight, Printer, Save } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeQuote } from "@/hooks/use-prime-new-order";
import type { PrimeEditChange, PrimeEditDiff, PrimeEditField } from "@/lib/prime/edit-diff";
import { primeTrack } from "@/lib/prime/track";
import type { PrimeShipmentView } from "@/lib/prime/chip-state";
import { formatIQD } from "@/lib/utils";

/** Fields the printed label carries: changing one before pickup needs a new label. */
const LABEL_FIELDS: ReadonlySet<PrimeEditField> = new Set(["name", "phone", "governorate", "area", "address", "amount"]);
/** Fields that move Prime's fee. */
const FEE_FIELDS: ReadonlySet<PrimeEditField> = new Set(["governorate", "area", "amount"]);

interface PrimeEditReviewProps {
    review: PrimeEditDiff;
    view: PrimeShipmentView;
    /** The governorate being saved (orders.city), for Prime's new fee. */
    city: string;
    isSaving: boolean;
    onSave: () => void;
    onBack: () => void;
}

/**
 * The order-edit save step for a parcel Prime is delivering (desktop): each
 * detail Prime holds, old struck through and new beside it, Prime's fee when
 * the edit moves it, and a reminder to reprint the label while the parcel is
 * still at the store. An edit Prime cannot take says why and saves only on a
 * second click.
 */
export function PrimeEditReview({ review, view, city, isSaving, onSave, onBack }: PrimeEditReviewProps) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const blocked = review.kind === "blocked";

    return (
        <section data-prime-edit-review={review.kind} className="w-full rounded-2xl border border-[#DCE5F3] bg-white p-4 dark:border-sky-400/20 dark:bg-white/[0.03]">
            <header className="mb-3 flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#315EA8]">
                        <span className="h-2 w-[22px] bg-white [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat]" />
                    </span>
                    <b dir={dir} className="text-sm text-foreground">
                        {t("orders.prime.edit.title")}
                    </b>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted">
                    {view.stepName && (
                        <span dir={dir} className="rounded-full bg-[#E8EEF8] px-2.5 py-0.5 font-semibold text-[#1F3F75] dark:bg-sky-400/15 dark:text-sky-200">
                            {view.stepName}
                        </span>
                    )}
                    <span dir={dir} className="font-mono">
                        {t("orders.prime.edit.case", { case: view.caseId })}
                    </span>
                </span>
            </header>

            {review.kind === "blocked" ? (
                <p dir={dir} className="flex items-start gap-2 rounded-xl bg-[#FFF6E8] px-3 py-2.5 text-left text-[13px] text-[#8A4B00] dark:bg-amber-400/10 dark:text-amber-200">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    {t("orders.prime.edit.blocked", { reason: t(`printing.primeReason.${review.reason}`) })}
                </p>
            ) : (
                <ChangeList review={review} view={view} city={city} />
            )}

            <div className="mt-3 flex items-center gap-2">
                <button
                    type="button"
                    onClick={onBack}
                    disabled={isSaving}
                    className="rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-[var(--card-border)] disabled:opacity-50"
                >
                    {t("orders.prime.edit.back")}
                </button>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={isSaving}
                    className={
                        blocked
                            ? "ml-auto rounded-xl border border-[#E7C9A0] bg-white px-5 py-2.5 text-sm font-semibold text-[#8A4B00] transition-all hover:bg-[#FFF6E8] disabled:opacity-50"
                            : "ml-auto flex items-center gap-2 rounded-xl bg-[var(--button-success)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-green-500/20 transition-all hover:bg-[var(--button-success-hover)] disabled:opacity-50"
                    }
                >
                    {!blocked && <Save aria-hidden="true" className="h-4 w-4" />}
                    {blocked ? t("orders.prime.edit.saveAnyway") : t("orders.prime.edit.save")}
                </button>
            </div>
        </section>
    );
}

function ChangeList({ review, view, city }: { review: Extract<PrimeEditDiff, { kind: "changes" }>; view: PrimeShipmentView; city: string }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const feeMoves = review.changes.some((c) => FEE_FIELDS.has(c.field));
    const atStore = primeTrack(view).stop === 0;
    const relabel = atStore && review.changes.some((c) => LABEL_FIELDS.has(c.field));

    return (
        <>
            <dl className="divide-y divide-[#F0EDE7] dark:divide-white/10">
                {review.changes.map((change) => (
                    <ChangeRow key={change.field} change={change} />
                ))}
                {feeMoves && <FeeRow before={view.shipmentCharge} city={city} districtId={review.districtAfter} amount={review.amountAfter} />}
            </dl>
            {relabel && (
                <p dir={dir} className="mt-3 flex items-start gap-2 rounded-xl bg-[#FFF6E8] px-3 py-2.5 text-left text-[13px] text-[#8A4B00] dark:bg-amber-400/10 dark:text-amber-200">
                    <Printer aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                    {t("orders.prime.edit.label")}
                </p>
            )}
            <p dir={dir} className="mt-3 text-left text-xs text-muted">
                {t("orders.prime.edit.note")}
            </p>
        </>
    );
}

const ROW = "grid grid-cols-[130px_minmax(0,1fr)_20px_minmax(0,1fr)] items-center gap-3 py-2.5 text-sm";

function ChangeRow({ change }: { change: PrimeEditChange }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    return (
        <div className={ROW}>
            <dt dir={dir} className="text-left text-xs text-muted">
                {t(`orders.prime.edit.field.${change.field}`)}
            </dt>
            <dd dir={dir} className="min-w-0 truncate text-left text-[#8A8A8A] line-through decoration-[#D9A39C]">
                {change.before || "—"}
            </dd>
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
            <dd dir={dir} className="min-w-0 justify-self-start truncate rounded-lg bg-[#EEF6F1] px-2.5 py-1 text-left font-bold text-[#165C39] dark:bg-emerald-400/10 dark:text-emerald-200">
                {change.after || "—"}
            </dd>
        </div>
    );
}

/** Prime's fee before (as Prime last reported it) and after (asked now for the new governorate, area and amount). */
function FeeRow({ before, city, districtId, amount }: { before: number | null; city: string; districtId: number | null; amount: number }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const quote = usePrimeQuote({ city, districtId, amount }, true);
    const after = quote.data?.connected ? quote.data.fee : null;
    const same = before !== null && after !== null && before === after;
    return (
        <div className={ROW}>
            <dt dir={dir} className="text-left text-xs text-muted">
                {t("orders.prime.edit.fee")}
            </dt>
            <dd className="font-mono text-[#8A8A8A]">{before === null ? "—" : formatIQD(before)}</dd>
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 text-muted" />
            <dd className="flex items-center gap-2 font-mono font-bold text-[#1F3F75] dark:text-sky-200">
                {quote.isPending ? "…" : after === null ? "—" : formatIQD(after)}
                {same && (
                    <span dir={dir} className="font-sans text-xs font-medium text-muted">
                        · {t("orders.prime.edit.feeSame")}
                    </span>
                )}
            </dd>
        </div>
    );
}
