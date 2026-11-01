"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { loadAfterSalePickups } from "@/lib/after-sale/label-pickups";
import { getQueueFlags, hasBlockingFlag } from "@/lib/dispatch-queue";
import { shippingLabelsDocument } from "@/lib/shipping-labels";
import { useLanguage } from "@/hooks/use-language";
import type { Order } from "@/lib/supabase";

interface LabelPreviewRailProps {
    order: Order | null;
    /** 1-based place of `order` in the visible queue. */
    position: number;
    total: number;
    onStep: (delta: -1 | 1) => void;
}

// 80x120 mm at the CSS 96 dpi, shown at 90%.
const LABEL_PX = { width: 302, height: 454 };
const SCALE = 0.9;

/** The focused order's label, rendered by the same document the PDF and the printer get. */
export function LabelPreviewRail({ order, position, total, onStep }: LabelPreviewRailProps) {
    const { t } = useLanguage();
    const afterSale = Boolean(order?.is_return || order?.is_replacement);
    const pickups = useQuery({
        queryKey: ["label-pickups", order?.id],
        enabled: afterSale,
        queryFn: () => loadAfterSalePickups(order ? [order] : []),
    });

    if (!order) {
        return (
            <aside className="sticky top-6 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-6 text-center text-sm text-muted">
                {t("printing.previewEmpty")}
            </aside>
        );
    }

    const blocked = hasBlockingFlag(getQueueFlags(order));
    const ready = !afterSale || pickups.isSuccess || pickups.isError;

    return (
        <aside className="sticky top-6 flex flex-col items-center gap-3 rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-5">
            <div className="flex items-center gap-2 text-xs text-muted">
                <button
                    type="button"
                    onClick={() => onStep(-1)}
                    aria-label={t("printing.previewPrev")}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--card-border)] hover:bg-[var(--background)]"
                >
                    <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-12 text-center font-mono tabular-nums">
                    {position} / {total}
                </span>
                <button
                    type="button"
                    onClick={() => onStep(1)}
                    aria-label={t("printing.previewNext")}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--card-border)] hover:bg-[var(--background)]"
                >
                    <ChevronRight className="h-4 w-4" />
                </button>
            </div>

            <div
                className="relative overflow-hidden rounded-md bg-white shadow-[0_18px_40px_-18px_rgba(40,30,10,0.35)]"
                style={{ width: LABEL_PX.width * SCALE, height: LABEL_PX.height * SCALE }}
            >
                {blocked ? (
                    <div className="grid h-full place-items-center bg-[var(--background)] p-6 text-center">
                        <div>
                            <p className="font-semibold text-rose-700 dark:text-rose-300">{t("printing.previewBlocked")}</p>
                            <p className="mt-1 text-xs text-muted">{t("printing.blockedBody")}</p>
                        </div>
                    </div>
                ) : (
                    ready && (
                        <iframe
                            title={t("printing.previewTitle", { name: order.customer_name })}
                            srcDoc={shippingLabelsDocument([order], pickups.data ?? {})}
                            sandbox=""
                            className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
                            style={{ width: LABEL_PX.width, height: LABEL_PX.height, transform: `scale(${SCALE})` }}
                        />
                    )
                )}
            </div>

            <p className="text-center text-xs text-muted">
                <span className="font-semibold text-foreground">{order.customer_name}</span> · {t("printing.previewCaption")}
            </p>
        </aside>
    );
}
