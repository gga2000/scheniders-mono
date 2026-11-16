"use client";

import { MessageCircle } from "lucide-react";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useWhatsAppUsage } from "@/hooks/use-whatsapp-usage";
import { groupWhatsAppMonth } from "@/lib/billing/whatsapp-usage";
import { Warning } from "./plan-change-dialog";

interface WhatsAppUsageCardProps {
    /** The shop's wallet balance, to say when messages are paused. */
    balance: number;
    /** The cheapest message's price on the shop's plan (utility). */
    messagePrice: number | null;
}

/**
 * «رسائل الواتساب» (Fermi B2): the free-trial counter, or that messages are
 * paused because the wallet cannot pay one, and this month's delivered
 * messages by kind with what they cost.
 */
export function WhatsAppUsageCard({ balance, messagePrice }: WhatsAppUsageCardProps) {
    const { t } = useLanguage();
    const { data: usage } = useWhatsAppUsage();
    if (!usage) return null;

    const month = groupWhatsAppMonth(usage.month);
    const capped = usage.trial && usage.trial_sent >= usage.trial_cap;
    const paused = !usage.trial && messagePrice !== null && messagePrice > 0 && balance < messagePrice;
    const trialShare = usage.trial_cap > 0 ? Math.min(100, Math.round((usage.trial_sent / usage.trial_cap) * 100)) : 100;

    return (
        <section className="pastel-card p-6" data-testid="whatsapp-usage-card">
            <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--pastel-green)">
                    <MessageCircle className="h-4 w-4 text-green-700" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{t("whatsapp.usage.title")}</h3>
            </div>

            <div className="space-y-4">
                {usage.trial && (
                    <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground tabular-nums" data-testid="whatsapp-trial-counter">
                            {t("whatsapp.trial.counter", { sent: usage.trial_sent, cap: usage.trial_cap })}
                        </p>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                                className={capped ? "h-full bg-amber-500" : "h-full bg-green-600"}
                                style={{ width: `${trialShare}%` }}
                            />
                        </div>
                        {capped ? (
                            <Warning>{t("whatsapp.trial.capped")}</Warning>
                        ) : (
                            <p className="text-xs text-muted-foreground">{t("whatsapp.trial.free")}</p>
                        )}
                    </div>
                )}

                {paused && <Warning>{t("whatsapp.usage.paused")}</Warning>}

                <div>
                    <p className="text-sm font-semibold text-foreground tabular-nums" data-testid="whatsapp-month-total">
                        {month.count === 0
                            ? t("whatsapp.usage.none")
                            : month.iqd !== null && !usage.trial
                              ? t("whatsapp.usage.month", { count: month.count, amount: formatIQD(month.iqd) })
                              : t("whatsapp.usage.monthCount", { count: month.count })}
                    </p>
                    {month.rows.length > 0 && (
                        <ul className="mt-2 space-y-1 text-sm">
                            {month.rows.map((row) => (
                                <li key={row.purpose} className="flex items-center justify-between gap-4 text-muted-foreground">
                                    <span>{t(`whatsapp.purpose.${row.purpose}`)}</span>
                                    <span className="tabular-nums text-foreground">
                                        {row.count}
                                        {row.iqd !== null && !usage.trial && <span className="text-muted-foreground"> · {formatIQD(row.iqd)}</span>}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {!usage.trial && <p className="mt-3 text-xs text-muted-foreground">{t("whatsapp.usage.paid")}</p>}
                </div>
            </div>
        </section>
    );
}
