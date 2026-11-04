"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { formatIraqiPhoneDisplay } from "@scheniders/shared";
import type { DeliveryChance, OwnHistory } from "@/lib/shield/delivery-chance";
import type { ShieldNetwork } from "@/lib/shield/types";
import { SHIELD_TONE } from "./shield-tone";
import { ShieldNetworkRecord } from "./shield-network-record";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customerName: string;
    phone: string;
    result: DeliveryChance;
    network: ShieldNetwork | null;
    networkFailed: boolean;
    own: OwnHistory | null;
}

const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

/** The Shield review: why this order's ring reads what it reads. */
export function ShieldReviewDialog({ open, onOpenChange, customerName, phone, result, network, networkFailed, own }: Props) {
    const { t } = useLanguage();
    const tone = SHIELD_TONE[result.band];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl p-0 gap-0" onClick={(e) => e.stopPropagation()}>
                <DialogHeader className="flex-row items-center gap-4 border-b border-(--card-border) px-6 py-5 text-left space-y-0">
                    <div className={cn("grid h-16 w-16 flex-none place-items-center rounded-full border-4 font-mono text-xl font-bold tabular-nums", tone.ring)}>
                        {result.risk}
                    </div>
                    <div className="min-w-0">
                        <DialogTitle className={cn("text-lg", tone.text)}>{t(`shield.band.${result.band}`)}</DialogTitle>
                        <DialogDescription className="text-xs">
                            {t("shield.reviewSubtitle", { name: customerName, phone: formatIraqiPhoneDisplay(phone) })}
                            {" · "}
                            <span className="font-semibold text-foreground">{t("shield.chance", { chance: result.chance })}</span>
                        </DialogDescription>
                    </div>
                </DialogHeader>

                <div className="grid gap-5 px-6 py-5 max-h-[70vh] overflow-y-auto">
                    <ShieldNetworkRecord network={network} failed={networkFailed} phone={phone} />

                    <section>
                        <div className={LABEL}>{t("shield.section.whyOrder")}</div>
                        <ul className="mt-2 grid gap-1 text-sm">
                            {result.reasons.map((r) => (
                                <li key={r.key} className="flex items-center gap-2">
                                    <span className={cn("h-2 w-2 flex-none rounded-full", r.effect === "risk" ? "bg-rose-500" : "bg-emerald-500")} />
                                    {t(`shield.reason.${r.key}`)}
                                </li>
                            ))}
                        </ul>
                    </section>

                    <section className="rounded-lg bg-(--background) px-4 py-3 text-sm">
                        <span className="font-semibold">{t("shield.section.own")}</span>
                        {" · "}
                        {own && own.delivered + own.refused + own.noAnswer > 0
                            ? t("shield.own.summary", { delivered: own.delivered, refused: own.refused, noAnswer: own.noAnswer })
                            : t("shield.own.none")}
                    </section>
                </div>

                <p className="border-t border-(--card-border) px-6 py-3 text-xs text-muted-foreground">{t("shield.footer")}</p>
            </DialogContent>
        </Dialog>
    );
}
