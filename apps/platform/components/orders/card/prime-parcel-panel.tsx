"use client";

import { MessageSquareText } from "lucide-react";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeCustomerRecord } from "@/hooks/use-prime-shipments";
import type { PrimeShipmentView } from "@/lib/prime/chip-state";
import { primeMessageLink } from "@/lib/prime/message-link";
import { computeCodAmount } from "@/lib/order-money";
import { cn } from "@/lib/utils";
import type { Order } from "@/types/order";
import { PrimeJourneyList } from "./prime-journey-list";
import { PrimeResendForm, type PrimeResendOrder } from "./prime-resend-form";

/** Which part of the panel the band opened it for. */
export type PrimePanelFocus = "journey" | "resend";

type PanelOrder = PrimeResendOrder & Pick<Order, "order_id">;

const amount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * The parcel opened in place under its card: every step Prime recorded, the
 * money in the parcel (what Prime collects, its fee, what reaches the store),
 * the customer's record with Prime, and — for a parcel coming back — the form
 * that asks Prime for one more attempt with a fixed phone, address or amount.
 */
export function PrimeParcelPanel({
    order,
    view,
    focus,
    returning,
    canResend,
}: {
    order: PanelOrder;
    view: PrimeShipmentView;
    focus: PrimePanelFocus;
    returning: boolean;
    canResend: boolean;
}) {
    const { t } = useLanguage();
    const record = usePrimeCustomerRecord(order.id, order.phone, true);
    const collect = view.receiptAmountIqd ?? computeCodAmount(order);
    const fee = view.shipmentCharge;

    return (
        <div data-prime-panel={focus} className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-5 border-t border-[#EFECE6] px-6 pb-6 pt-5 dark:border-white/10">
            <PrimeJourneyList orderId={order.id} caseId={view.caseId} />

            <div className="flex min-w-0 flex-col gap-4">
                <section className="flex flex-col gap-2.5 rounded-[18px] border border-[#EFECE6] bg-white p-[18px] dark:border-white/10 dark:bg-white/[0.03]">
                    <h3 className="text-sm font-bold text-foreground">{t("orders.prime.panel.money")}</h3>
                    <MoneyLine label={t("orders.prime.panel.collect")} value={amount.format(collect)} />
                    <MoneyLine label={t("orders.prime.panel.fee")} value={fee === null ? "—" : amount.format(fee)} />
                    <div className="border-t border-dashed border-[#E7E2D9] pt-2.5 dark:border-white/10">
                        <MoneyLine
                            strong
                            label={t("orders.prime.panel.net")}
                            value={returning ? t("orders.prime.panel.netReturned") : fee === null ? "—" : amount.format(Math.max(0, collect - fee))}
                            tone={returning ? "red" : "green"}
                        />
                    </div>
                </section>

                <section className="flex flex-col gap-2.5 rounded-[18px] border border-[#EFECE6] bg-white p-[18px] dark:border-white/10 dark:bg-white/[0.03]">
                    <h3 className="text-sm font-bold text-foreground">{t("orders.prime.panel.customer")}</h3>
                    {record.isPending ? (
                        <p className="text-xs text-muted">{t("orders.prime.panel.loading")}</p>
                    ) : record.isError ? (
                        <p className="text-xs text-muted">{t("orders.prime.panel.customerFailed")}</p>
                    ) : (
                        <>
                            <MoneyLine label={t("orders.prime.panel.previous")} value={String(record.data.parcels)} />
                            <MoneyLine label={t("orders.prime.panel.delivered")} value={String(record.data.delivered)} />
                            <MoneyLine label={t("orders.prime.panel.refusedBefore")} value={String(record.data.returned)} tone={record.data.returned > 0 ? "red" : undefined} />
                        </>
                    )}
                </section>

                {canResend && <PrimeResendForm order={order} autoFocus={focus === "resend"} />}

                <div className="flex flex-wrap gap-2">
                    <a
                        href={primeMessageLink(t, view.caseId, order.order_id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-11 items-center gap-2 rounded-full border border-[#E7E5E4] bg-white px-4 text-sm font-semibold text-[#1E1E1E] transition-colors hover:bg-[#F5F3EF] dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                    >
                        <MessageSquareText className="h-4 w-4" aria-hidden="true" />
                        {t("orders.prime.band.messagePrime")}
                    </a>
                </div>
            </div>
        </div>
    );
}

function MoneyLine({ label, value, strong = false, tone }: { label: string; value: string; strong?: boolean; tone?: "red" | "green" }) {
    const dir = useTextDir();
    return (
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className={cn(strong ? "font-semibold text-foreground" : "text-[#6B6B6B] dark:text-white/60")}>{label}</span>
            <span
                dir={dir}
                className={cn(
                    "font-mono tabular-nums",
                    strong ? "text-base font-bold" : "font-semibold",
                    tone === "red" ? "text-[#B42318] dark:text-rose-300" : tone === "green" ? "text-[#165C39] dark:text-emerald-300" : "text-foreground",
                )}
            >
                {value}
            </span>
        </div>
    );
}
