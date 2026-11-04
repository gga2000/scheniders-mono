"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useShield } from "@/hooks/use-shield";
import { deliveryChance, SHIELD_OPEN_STATUSES, type OwnHistory } from "@/lib/shield/delivery-chance";
import type { Order } from "@/types/order";
import type { OrderRiskData } from "@/lib/customer-trust-risk";
import { SHIELD_TONE } from "./shield-tone";
import { ShieldReviewDialog } from "./shield-review-dialog";

export function ownHistoryOf(assessment?: OrderRiskData): OwnHistory | null {
    const h = assessment?.historicalData;
    if (!h) return null;
    return {
        delivered: h.deliveredCount ?? 0,
        refused: (h.rejectedCustomerFaultCount ?? 0) + (h.rejectedAmbiguousCount ?? 0),
        noAnswer: h.noResponseCount ?? 0,
    };
}

/**
 * Shield on the order card (Ali, 2026-11-04): a score ring, plus one short
 * warning line when the order is yellow or red. Clicking either opens the
 * Shield review. Shows only while the order can still be stopped.
 */
export function OrderShield({ order, riskAssessment }: { order: Order; riskAssessment?: OrderRiskData }) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const active = SHIELD_OPEN_STATUSES.has(order.status) && !order.is_return;
    const shield = useShield(order.phone, active);

    const own = useMemo(() => ownHistoryOf(riskAssessment), [riskAssessment]);
    const result = useMemo(() => deliveryChance({
        phone: order.phone,
        status: order.status,
        createdAt: order.created_at,
        addressDetails: order.address_details,
        itemLines: Array.isArray(order.items) ? order.items.length : 0,
        adChannel: order.ad_channel,
        own,
        network: shield.data ?? null,
    }), [order.phone, order.status, order.created_at, order.address_details, order.items, order.ad_channel, own, shield.data]);

    if (!active) return null;
    const tone = SHIELD_TONE[result.band];
    const topRisk = result.reasons.find((r) => r.effect === "risk");

    return (
        <>
            <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label={t("shield.ringLabel", { risk: result.risk })}
                    title={t("shield.chance", { chance: result.chance })}
                    className={cn(
                        "inline-grid place-items-center h-7 w-7 rounded-full border-[2.5px] bg-(--background) font-mono text-[11px] font-bold tabular-nums",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
                        tone.ring,
                    )}
                >
                    {result.risk}
                </button>
                {result.band !== "green" && (
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className={cn("inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-bold", tone.pill)}
                    >
                        {t(`shield.band.${result.band}`)}
                        {topRisk && <span className="font-medium opacity-90">· {t(`shield.reason.${topRisk.key}`)}</span>}
                    </button>
                )}
            </span>
            {open && (
                <ShieldReviewDialog
                    open={open}
                    onOpenChange={setOpen}
                    customerName={order.customer_name}
                    phone={order.phone}
                    orderId={order.order_id}
                    orderedAt={order.created_at}
                    result={result}
                    network={shield.data ?? null}
                    networkFailed={shield.isError}
                    own={own}
                />
            )}
        </>
    );
}
