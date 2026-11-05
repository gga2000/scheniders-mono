"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useShield } from "@/hooks/use-shield";
import { normalizeShieldPhone } from "@/lib/shield/lookup";
import { orderChecks, SHIELD_OPEN_STATUSES, trustOf, worstStep } from "@/lib/shield/trust";
import type { Order } from "@/types/order";
import { CHECK_TONE, SHIELD_TONE } from "./shield-tone";
import { ShieldReviewDialog } from "./shield-review-dialog";

/**
 * Shield on the order card (Ali, 2026-11-04, Trust score 2026-11-05): a ring
 * with the customer's Trust score out of 100, plus one short warning line when
 * the score is under 80 or the order itself needs a check. Clicking either
 * opens the Shield report. Shows only while the order can still be stopped.
 */
export function OrderShield({ order }: { order: Order }) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const active = SHIELD_OPEN_STATUSES.has(order.status) && !order.is_return;
    const shield = useShield(order.phone, active);
    const loading = shield.isPending && normalizeShieldPhone(order.phone) !== null;

    const trust = useMemo(() => trustOf(shield.data ?? null), [shield.data]);
    const checks = useMemo(
        () => orderChecks({ phone: order.phone, addressDetails: order.address_details, city: order.city }),
        [order.phone, order.address_details, order.city],
    );

    if (!active) return null;
    if (loading) return <span aria-hidden="true" className="inline-block h-7 w-7 animate-pulse rounded-full bg-(--card-border)/60" />;

    const tone = SHIELD_TONE[trust.band];
    const worst = worstStep(trust.steps);
    const check = checks[0];

    return (
        <>
            <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    aria-label={t("shield.ringLabel", { score: trust.score })}
                    title={trust.isNew ? t("shield.band.new") : t("shield.trust.label")}
                    className={cn(
                        "inline-grid place-items-center h-7 w-7 rounded-full border-[2.5px] bg-(--background) font-mono text-[10px] font-bold tabular-nums",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground",
                        trust.isNew ? "border-(--card-border) text-muted-foreground" : tone.ring,
                    )}
                >
                    {trust.score}
                </button>
                {trust.band !== "green" ? (
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className={cn("inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] font-bold", tone.pill)}
                    >
                        {t(`shield.band.${trust.band}`)}
                        {worst && <span className="font-medium opacity-90">· {t(`shield.kind.${worst.kind}`)}</span>}
                    </button>
                ) : check ? (
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className={cn("inline-flex h-6 items-center rounded-md px-2 text-[11px] font-bold", SHIELD_TONE[CHECK_TONE[check]].pill)}
                    >
                        {t(`shield.check.${check}`)}
                    </button>
                ) : null}
            </span>
            {open && (
                <ShieldReviewDialog
                    open={open}
                    onOpenChange={setOpen}
                    customerName={order.customer_name}
                    phone={order.phone}
                    orderId={order.order_id}
                    orderedAt={order.created_at}
                    trust={trust}
                    checks={checks}
                    network={shield.data ?? null}
                    networkFailed={shield.isError}
                />
            )}
        </>
    );
}
