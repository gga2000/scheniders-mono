"use client";

import { AlertTriangle, ArrowLeftRight, CalendarClock, Crown, ShoppingBag } from "lucide-react";
import { planName } from "@scheniders/shared/plans";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { PlanLimitsData, SubscriptionData } from "@/hooks/use-billing";
import { daysUntil, formatBillingDate, hasPassed } from "./billing-format";

const STATUS_STYLE: Record<string, string> = {
    trial: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
    trial_ended: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    active: "bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300",
    past_due: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    suspended: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

export function PlanCard({
    plan,
    subscription,
    tenantStatus,
    trialEndsAt,
    trialOrders,
    nextPrice,
    paidMonth,
}: {
    plan: PlanLimitsData | null;
    subscription: SubscriptionData | null;
    tenantStatus: string;
    trialEndsAt: string | null;
    trialOrders: number | null;
    /** What the next payment takes: the plan it buys plus add-ons (billing_lock_status.price_iqd). */
    nextPrice: number | null;
    /** In a paid month a waiting plan starts at the renewal; otherwise it is what the payment buys. */
    paidMonth: boolean;
}) {
    const { t, language } = useLanguage();
    const inTrial = tenantStatus === "trial";
    // An ended trial stays status 'trial' until it is paid (handoff A1 lock).
    const trialEnded = inTrial && !!trialEndsAt && hasPassed(trialEndsAt);
    const status = trialEnded ? "trial_ended" : inTrial ? "trial" : subscription?.status === "past_due" ? "past_due" : tenantStatus;
    const base = plan?.base_price_iqd ?? 0;
    const next = nextPrice ?? base;
    const pending = subscription?.pending_plan && subscription.pending_plan !== subscription.plan ? subscription.pending_plan : null;
    const perOrder = plan?.order_price_iqd ?? 0;
    const trialDays = plan?.trial_days ?? 7;
    // 0 = no order cap: the trial ends on its date only (handoff A1).
    const trialCap = plan?.trial_order_cap ?? 0;

    const daysLeft = trialEndsAt ? daysUntil(trialEndsAt) : null;

    return (
        <div className="pastel-card p-6" data-testid="billing-plan-card">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-(--pastel-purple) flex items-center justify-center">
                        <Crown className="h-4 w-4 text-purple-700" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">
                        {plan ? t("billing.plan.named", { plan: planName(plan.plan, language) }) : t("billing.plan.title")}
                    </h3>
                </div>
                <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold", STATUS_STYLE[status] ?? STATUS_STYLE.active)}>
                    {t(`billing.status.${status}`, t("billing.status.active"))}
                </span>
            </div>

            <div className="space-y-4">
                <div>
                    <p className="text-2xl font-bold tabular-nums text-foreground">
                        {t("billing.plan.monthly", { amount: formatIQD(base) })}
                    </p>
                    <p className="text-sm font-medium text-foreground mt-1">
                        {t("billing.plan.perOrder", { amount: formatIQD(perOrder) })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{t("billing.plan.included")}</p>
                </div>

                {inTrial ? (
                    <div className="space-y-3 rounded-xl border border-(--card-border) bg-muted/20 p-4">
                        <TrialMeter
                            icon={<CalendarClock className="w-3.5 h-3.5" />}
                            label={t("billing.trial.days")}
                            value={trialEnded ? t("billing.trial.ended") : daysLeft === null ? "-" : t("billing.trial.daysLeft", { count: daysLeft })}
                            percent={trialEnded ? 100 : daysLeft === null ? 0 : ((trialDays - daysLeft) / trialDays) * 100}
                        />
                        {trialCap > 0 && (
                            <TrialMeter
                                icon={<ShoppingBag className="w-3.5 h-3.5" />}
                                label={t("billing.trial.orders")}
                                value={t("billing.trial.ordersUsed", { used: Math.min(trialOrders ?? 0, trialCap), count: trialCap })}
                                percent={((trialOrders ?? 0) / trialCap) * 100}
                            />
                        )}
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            {trialCap > 0
                                ? t("billing.trial.note", { days: trialDays, cap: trialCap, amount: formatIQD(next) })
                                : t("billing.trial.noteNoCap", { days: trialDays, amount: formatIQD(next) })}
                        </p>
                    </div>
                ) : subscription ? (
                    <div className="flex items-center gap-3 rounded-xl border border-(--card-border) bg-muted/20 p-4">
                        <CalendarClock className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                            <p className="text-xs text-muted-foreground">{t("billing.period.next")}</p>
                            <p className="text-sm font-medium text-foreground">
                                {t("billing.period.nextNote", {
                                    amount: formatIQD(next),
                                    date: formatBillingDate(subscription.current_period_end, language),
                                })}
                            </p>
                        </div>
                    </div>
                ) : null}

                {pending && (
                    <div className="flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 p-3 dark:border-purple-900 dark:bg-purple-950/30" data-testid="plan-pending">
                        <ArrowLeftRight className="w-4 h-4 text-purple-600 shrink-0" />
                        <p className="text-xs font-medium text-purple-800 dark:text-purple-200">
                            {paidMonth && subscription?.plan_change_at
                                ? t("billing.plan.changesOn", {
                                      date: formatBillingDate(subscription.plan_change_at, language),
                                      plan: planName(pending, language),
                                  })
                                : t(inTrial ? "billing.plan.afterTrial" : "billing.plan.whenPaid", { plan: planName(pending, language) })}
                        </p>
                    </div>
                )}

                {(status === "past_due" || status === "suspended") && (
                    <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                        <p className="text-xs text-red-700 dark:text-red-300">{t("billing.plan.unpaid")}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function TrialMeter({ icon, label, value, percent }: { icon: React.ReactNode; label: string; value: string; percent: number }) {
    const width = Math.max(0, Math.min(100, Math.round(percent)));
    return (
        <div>
            <div className="flex items-center justify-between mb-1.5 text-sm">
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    {icon}
                    {label}
                </span>
                <span className="font-semibold tabular-nums text-foreground">{value}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted/50">
                <div
                    className={cn("h-full rounded-full", width >= 80 ? "bg-amber-500" : "bg-purple-500")}
                    style={{ width: `${width}%` }}
                />
            </div>
        </div>
    );
}
