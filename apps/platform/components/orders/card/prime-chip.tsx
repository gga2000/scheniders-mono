"use client";

import { Check } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { usePrimeShipments } from "@/hooks/use-prime-shipments";
import { toast } from "@/hooks/use-toast";
import { formatTime } from "@/lib/order-format-utils";
import { primeChipState, primeSkipReason, type PrimeChipTone, type PrimeShipmentView } from "@/lib/prime/chip-state";
import { cn } from "@/lib/utils";
import type { Order } from "@/types/order";
import { PrimeResendButton } from "./prime-resend-button";
import { usePrimeBand } from "./use-prime-band";

/** Cards that can carry the chip: out with Prime, or cancelled after it was sent. */
const CHIP_ORDER_STATUSES = new Set<string>(["confirmed", "in_transit", "cancelled"]);

const TONE: Record<PrimeChipTone, { chip: string; rule: string; dim: string }> = {
    progress: {
        chip: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-400/15 dark:text-sky-200 dark:border-sky-400/30",
        rule: "bg-sky-300 dark:bg-sky-400/40",
        dim: "text-sky-700 dark:text-sky-300",
    },
    warn: {
        chip: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-400/15 dark:text-amber-200 dark:border-amber-400/35",
        rule: "bg-amber-400 dark:bg-amber-400/40",
        dim: "text-amber-700 dark:text-amber-300",
    },
    problem: {
        chip: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-500/15 dark:text-rose-200 dark:border-rose-500/30",
        rule: "bg-rose-300 dark:bg-rose-400/40",
        dim: "text-rose-700 dark:text-rose-300",
    },
    muted: {
        chip: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-white/5 dark:text-gray-300 dark:border-white/10",
        rule: "bg-gray-300 dark:bg-white/20",
        dim: "text-gray-500 dark:text-gray-400",
    },
};

type ChipOrder = Pick<Order, "id" | "status" | "phone" | "city" | "address_details" | "price" | "delivery_fee" | "discount_amount" | "payment_status">;

/**
 * The order's Prime shipment on its card: Prime's mark, Prime's own step
 * name and the case number (a click copies it). Hover tells when Prime was
 * last checked and, when Prime refused a change, why. A returned parcel gets
 * the resend button beside it. Renders nothing for an order Prime never got.
 */
export function PrimeChip({ order }: { order: ChipOrder }) {
    // Only cards that can carry the chip subscribe to the shipments query.
    if (!CHIP_ORDER_STATUSES.has(order.status)) return null;
    return <PrimeChipFor order={order} />;
}

function PrimeChipFor({ order }: { order: ChipOrder }) {
    const { t } = useLanguage();
    const view = usePrimeShipments().get(order.id);
    // The band under the card shows the same parcel in full.
    const band = usePrimeBand(order);
    if (!view || band.shown) return null;
    const state = primeChipState(view, order.status);
    const tone = TONE[state.tone];
    const label = state.deleted ? t("orders.prime.deleted") : state.stepName;

    const copy = async (event: React.MouseEvent) => {
        event.stopPropagation();
        try {
            await navigator.clipboard.writeText(String(view.caseId));
            toast.success(t("orders.prime.copied"));
        } catch {
            toast.error(t("orders.toast.copyFailed"));
        }
    };

    return (
        <>
            <button
                type="button"
                data-prime-chip={state.tone}
                onClick={copy}
                title={tooltip(view, t)}
                className={cn(
                    "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border pl-2 pr-2.5 text-[11px] font-bold transition-colors hover:brightness-95",
                    tone.chip,
                )}
            >
                <span
                    aria-hidden="true"
                    className="h-2.5 w-[34px] shrink-0 bg-current [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat]"
                />
                <span className="sr-only">Prime</span>
                <span aria-hidden="true" className={cn("h-3 w-px", tone.rule)} />
                {label && <span>{label}</span>}
                <span className={cn("font-semibold tabular-nums", tone.dim, state.deleted && "line-through")}>{view.caseId}</span>
                {state.pending && (
                    <>
                        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-sky-500 animate-pulse" />
                        <span className={cn("font-semibold", tone.dim)}>{t("orders.prime.sending")}</span>
                    </>
                )}
            </button>
            {state.canResend && <PrimeResendButton order={order} />}
            {state.resendRequested && view.resentAt && (
                <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-[11px] font-bold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300">
                    <Check className="h-3 w-3" aria-hidden="true" />
                    {t("orders.prime.resent", { time: formatTime(view.resentAt) })}
                </span>
            )}
        </>
    );
}

function tooltip(view: PrimeShipmentView, t: (key: string, vars?: Record<string, string | number>) => string): string {
    const lines = [t("orders.prime.caseTitle", { caseId: view.caseId })];
    lines.push(view.checkedAt ? t("orders.prime.checkedAt", { time: formatTime(view.checkedAt) }) : t("orders.prime.notChecked"));
    if (view.pending) lines.push(t("orders.prime.sendingLong"));
    if (view.pushError) {
        const skip = primeSkipReason(view.pushError);
        lines.push(t("orders.prime.refused", { reason: skip ? t(`printing.primeReason.${skip}`) : view.pushError }));
    }
    if (view.cancelRefusedAt) lines.push(t("orders.prime.cancelRefused"));
    lines.push(t("orders.prime.clickToCopy"));
    return lines.join("\n");
}
