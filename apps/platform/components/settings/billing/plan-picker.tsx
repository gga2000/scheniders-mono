"use client";

import { useState } from "react";
import { Calculator, Check, Clock, Handshake, MessageCircle, Monitor, Star, Store, UserPlus, Users } from "lucide-react";
import { formatIqdNumber } from "@scheniders/shared";
import { monthlyTotal, planName } from "@scheniders/shared/plans";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useSupportStore } from "@/store/use-support-store";
import type { PlanLimitsData } from "@/hooks/use-billing";
import { formatBillingDate } from "./billing-format";

/** Where the shop stands, which decides what choosing a plan does (change_plan). */
export type PlanMode = "trial" | "locked" | "paid";

const DEFAULT_ORDERS = 300;
const MAX_ORDERS = 100_000;

/**
 * The plans a merchant can pick (plan_limits.self_serve), side by side, with a
 * calculator for what a month costs at their number of delivered orders, and
 * Custom as "contact us". Choosing opens the confirm dialog; nothing changes
 * from here.
 */
export function PlanPicker({
    plans,
    currentPlan,
    pendingPlan,
    pendingAt,
    mode,
    canChange,
    onChoose,
}: {
    plans: PlanLimitsData[];
    /** subscriptions.plan */
    currentPlan: string | null;
    /** subscriptions.pending_plan: the trial or lock pick, or a downgrade waiting for the renewal. */
    pendingPlan: string | null;
    pendingAt: string | null;
    mode: PlanMode;
    canChange: boolean;
    onChoose: (plan: string) => void;
}) {
    const { t, language } = useLanguage();
    const [ordersText, setOrdersText] = useState(String(DEFAULT_ORDERS));
    const orders = Math.min(MAX_ORDERS, Number.parseInt(ordersText, 10) || 0);
    const selfServe = plans.filter((p) => p.self_serve);
    const custom = plans.find((p) => p.plan === "enterprise");
    // Before a payment the pick is what the next payment buys; in a paid month
    // the shop is on its plan and a smaller one may be waiting for the renewal.
    const chosen = mode === "paid" ? currentPlan : (pendingPlan ?? currentPlan);

    if (selfServe.length === 0) return null;

    return (
        <section className="pastel-card p-6" data-testid="plan-picker">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h3 className="text-base font-semibold text-foreground">{t("plans.title")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {t(mode === "paid" ? "plans.subtitle" : "plans.subtitleTrial")}
                    </p>
                </div>
                <label className="flex items-center gap-3 rounded-xl border border-(--card-border) bg-muted/20 px-3 py-2">
                    <Calculator className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{t("plans.calc.label")}</span>
                    <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={MAX_ORDERS}
                        step={50}
                        value={ordersText}
                        onChange={(e) => setOrdersText(e.target.value.replace(/[^\d]/g, ""))}
                        className="w-24 rounded-lg border border-(--card-border) bg-background px-2 py-1 text-sm font-semibold tabular-nums text-foreground"
                        data-testid="plan-calc-orders"
                    />
                </label>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {selfServe.map((plan) => {
                    const isChosen = plan.plan === chosen;
                    const startsLater = mode === "paid" && plan.plan === pendingPlan && pendingPlan !== currentPlan;
                    const name = planName(plan.plan, language);
                    return (
                        <div
                            key={plan.plan}
                            className={cn(
                                "relative flex flex-col rounded-2xl border bg-background p-5",
                                plan.recommended ? "border-purple-400 ring-1 ring-purple-300 dark:border-purple-500 dark:ring-purple-800" : "border-(--card-border)",
                            )}
                            data-testid={`plan-option-${plan.plan}`}
                        >
                            <div className="mb-3 flex items-center justify-between gap-2">
                                <h4 className="text-lg font-bold text-foreground">{name}</h4>
                                {plan.recommended && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-800 dark:bg-purple-950/50 dark:text-purple-200">
                                        <Star className="h-3.5 w-3.5" />
                                        {t("plans.recommended")}
                                    </span>
                                )}
                            </div>

                            <p className="text-2xl font-bold tabular-nums text-foreground">
                                {t("plans.month", { amount: formatIQD(plan.base_price_iqd) })}
                            </p>
                            <p className="mt-1 text-sm font-medium text-foreground">
                                {t("plans.orderFee", { n: formatIqdNumber(plan.order_price_iqd) })}
                            </p>
                            <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <MessageCircle className="h-3.5 w-3.5" />
                                {t("plans.whatsapp")}
                            </p>

                            <ul className="my-4 space-y-2 border-t border-(--card-border) pt-4 text-sm text-foreground">
                                {plan.max_team_members >= 0 && (
                                    <Feature icon={<Users className="h-4 w-4" />}>{t("plans.team", { count: plan.max_team_members })}</Feature>
                                )}
                                {plan.max_stores >= 0 && (
                                    <Feature icon={<Store className="h-4 w-4" />}>{t("plans.stores", { count: plan.max_stores })}</Feature>
                                )}
                                {plan.pos_branches_included > 0 && (
                                    <Feature icon={<Monitor className="h-4 w-4" />}>{t("plans.posIncluded", { count: plan.pos_branches_included })}</Feature>
                                )}
                                {plan.pos_branch_price_iqd !== null && (
                                    <Feature icon={<Monitor className="h-4 w-4" />}>
                                        {t("plans.posBranch", { amount: formatIQD(plan.pos_branch_price_iqd) })}
                                    </Feature>
                                )}
                                {plan.extra_member_price_iqd !== null && (
                                    <Feature icon={<UserPlus className="h-4 w-4" />}>
                                        {t("plans.extraMember", { amount: formatIQD(plan.extra_member_price_iqd) })}
                                    </Feature>
                                )}
                            </ul>

                            <div className="mt-auto space-y-3">
                                <p className="rounded-lg bg-muted/30 px-3 py-2 text-sm tabular-nums text-foreground" data-testid={`plan-calc-${plan.plan}`}>
                                    {t("plans.calc.total", { amount: formatIQD(monthlyTotal(plan, orders)) })}
                                </p>
                                <PlanAction
                                    name={name}
                                    isChosen={isChosen}
                                    startsLater={startsLater}
                                    pendingAt={pendingAt}
                                    mode={mode}
                                    hasPending={mode === "paid" && !!pendingPlan && pendingPlan !== currentPlan}
                                    canChange={canChange}
                                    onChoose={() => onChoose(plan.plan)}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">{t("plans.calc.note")}</p>
            {!canChange && <p className="mt-1 text-xs text-muted-foreground">{t("plans.askOwner")}</p>}

            {custom && <CustomPlan name={planName(custom.plan, language)} />}
        </section>
    );
}

function Feature({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return (
        <li className="flex items-center gap-2">
            <span className="text-muted-foreground">{icon}</span>
            {children}
        </li>
    );
}

function PlanAction({
    name,
    isChosen,
    startsLater,
    pendingAt,
    mode,
    hasPending,
    canChange,
    onChoose,
}: {
    name: string;
    isChosen: boolean;
    startsLater: boolean;
    pendingAt: string | null;
    mode: PlanMode;
    hasPending: boolean;
    canChange: boolean;
    onChoose: () => void;
}) {
    const { t, language } = useLanguage();
    const badge = "flex w-full items-center justify-center gap-2 rounded-xl border border-(--card-border) py-2.5 text-sm font-semibold text-muted-foreground";

    if (startsLater) {
        return (
            <p className={badge}>
                <Clock className="h-4 w-4" />
                {pendingAt ? t("plans.startsOn", { date: formatBillingDate(pendingAt, language) }) : t("plans.chosen")}
            </p>
        );
    }
    // On the plan with a smaller one waiting: the one action is to stay.
    if (isChosen && !(hasPending && canChange)) {
        return (
            <p className={badge}>
                <Check className="h-4 w-4" />
                {t(mode === "paid" ? "plans.current" : "plans.chosen")}
            </p>
        );
    }
    if (!canChange) return null;
    return (
        <button
            type="button"
            onClick={onChoose}
            className="w-full rounded-xl bg-foreground py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
        >
            {t(isChosen ? "plans.keep" : "plans.choose", { plan: name })}
        </button>
    );
}

function CustomPlan({ name }: { name: string }) {
    const { t } = useLanguage();
    const openSupport = useSupportStore((s) => s.open);
    return (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-(--card-border) p-4" data-testid="plan-option-custom">
            <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-(--pastel-yellow)">
                    <Handshake className="h-4 w-4 text-amber-700" />
                </div>
                <div>
                    <p className="text-sm font-bold text-foreground">{name}</p>
                    <p className="text-xs text-muted-foreground">{t("plans.custom.body")}</p>
                </div>
            </div>
            <button
                type="button"
                onClick={() => openSupport({ errorCode: "plans.custom.message", errorMessage: t("plans.custom.message") })}
                className="rounded-xl border border-(--card-border) px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted/40"
            >
                {t("plans.custom.contact")}
            </button>
        </div>
    );
}
