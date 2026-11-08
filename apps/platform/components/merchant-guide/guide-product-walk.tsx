"use client";

import { Check, ImageIcon } from "lucide-react";
import { formatIQD } from "@scheniders/shared";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { PRODUCT_WALK, productWalkFilled, type ProductWalkDraft } from "@/lib/merchant-guide/product-walk";
import { cn } from "@/lib/utils";

/**
 * Inside the coach card on the first product: the five stops with a tick on
 * each one that is filled, and the product drawn the way a customer sees it,
 * filling in as the merchant types.
 */
export function GuideProductWalk({ draft, stage }: { draft: ProductWalkDraft | null; stage: number }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const filled = productWalkFilled(draft);
    const name = draft?.name.trim() ?? "";

    return (
        <div className="grid gap-3">
            <ol dir={dir} className="flex flex-wrap gap-1.5" aria-label={t("guide.step.product")}>
                {PRODUCT_WALK.map((stop, i) => (
                    <li
                        key={stop}
                        aria-current={i === stage ? "step" : undefined}
                        className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
                            i === stage
                                ? "bg-[#EFFF00] text-neutral-900"
                                : filled[stop]
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : "bg-white/10 text-neutral-400",
                        )}
                    >
                        {filled[stop] && i !== stage && <Check className="h-3 w-3" aria-hidden="true" />}
                        {t(`guide.walk.${stop}`)}
                    </li>
                ))}
            </ol>
            <div data-testid="merchant-guide-product-preview" className="grid grid-cols-[56px_1fr] items-center gap-3 rounded-xl bg-white p-2.5 text-neutral-900">
                <div className="grid aspect-square place-items-center overflow-hidden rounded-lg bg-neutral-100 text-neutral-400">
                    {draft?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a merchant upload of any host, shown small
                        <img src={draft.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                        <ImageIcon className="h-5 w-5" aria-hidden="true" />
                    )}
                </div>
                <div dir={dir} className="grid min-w-0 gap-0.5 text-left">
                    <span className={cn("truncate text-sm font-bold", !name && "text-neutral-400")}>
                        {name || t("guide.walk.untitled")}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                        {(draft?.price ?? 0) > 0 ? formatIQD(draft?.price ?? 0) : "—"}
                    </span>
                    <span className="text-[11px] text-neutral-500">{t("guide.walk.preview")}</span>
                </div>
            </div>
            <p dir={dir} className="text-left text-[11px] text-neutral-400">{t("guide.walk.auto")}</p>
        </div>
    );
}
