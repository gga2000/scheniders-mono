"use client";

import { useLanguage, useTextDir } from "@/hooks/use-language";
import { useDebounce } from "@/hooks/use-debounce";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { usePrimeQuote } from "@/hooks/use-prime-new-order";
import { computeCodAmount } from "@/lib/order-money";
import { primeDistrictOfOrder } from "@/lib/prime/district";
import { formatIQD } from "@/lib/utils";
import type { CreateOrderModel } from "./use-create-order-model";

/**
 * Prime's fee for the parcel being typed, under the new order's total: the
 * fee to its governorate (and picked area) for the amount Prime would
 * collect, and what reaches the store if it is delivered. Straight from
 * Prime; shown only for a Prime-linked store's delivery orders once a
 * governorate is chosen, and hidden where Prime has no such governorate.
 */
export function PrimeFeeLine({ m }: { m: CreateOrderModel }) {
    const { connected } = usePrimeConnection();
    if (!connected || m.orderType !== "delivery" || !m.formData.city) return null;
    return <PrimeFee m={m} city={m.formData.city} />;
}

function PrimeFee({ m, city }: { m: CreateOrderModel; city: string }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const { formData, subtotal, discount, actualDeliveryFee } = m;
    const collect = computeCodAmount({
        price: Math.max(0, subtotal - discount),
        delivery_fee: actualDeliveryFee,
        payment_status: formData.payment_status,
    });
    // One look-up once the amount settles, not one per key typed.
    const amount = useDebounce(collect, 400);
    const district = primeDistrictOfOrder(formData);
    const quote = usePrimeQuote({ city, districtId: district?.id ?? null, amount }, true);

    const answer = quote.data?.connected ? quote.data : null;
    if (quote.data && (!answer || !answer.state)) return null;
    const fee = answer?.fee ?? null;
    const place = district ? `${city} · ${district.name}` : city;

    return (
        <div data-prime-fee className="space-y-1 rounded-lg border border-[#DCE5F3] bg-[#F5F8FD] px-2.5 py-2 dark:border-sky-400/20 dark:bg-sky-400/[0.06]">
            <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 text-xs text-[#1F3F75] dark:text-sky-200">
                    <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[#315EA8]">
                        <span className="h-1.5 w-3 bg-white [mask:url(/assets/prime-mark.svg)_center/contain_no-repeat]" />
                    </span>
                    <span dir={dir} className="truncate text-left">
                        {t("orders.prime.newOrder.feeTo", { place })}
                    </span>
                </span>
                <span className="shrink-0 font-mono text-xs font-bold text-[#1F3F75] dark:text-sky-200">
                    {quote.isPending ? "…" : fee === null ? "—" : formatIQD(fee)}
                </span>
            </div>
            {fee !== null && collect > 0 && (
                <div className="flex items-center justify-between gap-3">
                    <span dir={dir} className="text-left text-xs text-muted">
                        {t("orders.prime.call.netIfDelivered")}
                    </span>
                    <span className="font-mono text-xs font-bold text-[#165C39] dark:text-emerald-300">{formatIQD(collect - fee)}</span>
                </div>
            )}
            {quote.isError ? (
                <p dir={dir} className="text-left text-[11px] text-[#8A4B00] dark:text-amber-300">
                    {t("orders.prime.newOrder.feeFailed")}
                </p>
            ) : (
                answer &&
                fee === null && (
                    <p dir={dir} className="text-left text-[11px] text-muted">
                        {t("orders.prime.newOrder.noFee")}
                    </p>
                )
            )}
        </div>
    );
}
