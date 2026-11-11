"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Plus, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useBilling, useTrialOrderCount } from "@/hooks/use-billing";
import { useTenant } from "@/hooks/use-tenant";
import { useWalletTopup } from "@/hooks/use-wallet-topup";
import { isBillingExempt } from "@/lib/billing-exempt";
import { PlanCard } from "./billing/plan-card";
import { TopupForm } from "./billing/topup-form";
import { TopupRequests } from "./billing/topup-requests";
import { WalletHistory } from "./billing/wallet-history";
import { formatIQD } from "./billing/billing-format";

export function BillingSettings() {
    const { t } = useLanguage();
    const { data: tenant, isLoading: tenantLoading } = useTenant();
    const { wallet, subscription, allPlans, transactions, isLoading, refetch } = useBilling();
    const { requests } = useWalletTopup();
    const inTrial = tenant?.status === "trial";
    const { data: trialOrders } = useTrialOrderCount(inTrial);
    const [showTopUp, setShowTopUp] = useState(false);

    if (isLoading || tenantLoading) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin me-2" />
                {t("billing.loading")}
            </div>
        );
    }

    const exempt = isBillingExempt(tenant?.plan ?? null);
    const plan = allPlans.find((p) => p.plan === (subscription?.plan ?? tenant?.plan)) ?? null;
    const balance = wallet?.balance_iqd ?? 0;
    const threshold = wallet?.threshold_iqd ?? 0;
    // During the free trial nothing is charged yet, so a low balance is not a problem.
    const showLowBalance = !exempt && !inTrial && balance <= threshold;

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("billing.page.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("billing.page.subtitle")}</p>
            </div>

            {showLowBalance && (
                <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30" data-testid="low-balance-warning">
                    <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600" />
                    <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("billing.wallet.low")}</p>
                        <p className="text-xs text-amber-700 dark:text-amber-400">{t("billing.wallet.lowBody")}</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {exempt ? (
                    <div className="pastel-card p-6">
                        <p className="text-sm text-muted-foreground">{t("billing.exempt")}</p>
                    </div>
                ) : (
                    <PlanCard
                        plan={plan}
                        subscription={subscription}
                        tenantStatus={tenant?.status ?? "active"}
                        trialEndsAt={tenant?.trial_ends_at ?? null}
                        trialOrders={trialOrders ?? null}
                    />
                )}

                <div className="pastel-card p-6">
                    <div className="mb-5 flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-(--pastel-green)">
                            <Wallet className="h-4 w-4 text-green-700" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground">{t("billing.wallet.title")}</h3>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <p className="mb-1 text-xs text-muted-foreground">{t("billing.wallet.balance")}</p>
                            <p
                                className={cn("text-2xl font-bold tabular-nums", showLowBalance ? "text-amber-600" : "text-green-700 dark:text-green-400")}
                                data-testid="wallet-balance"
                            >
                                {formatIQD(balance)}
                            </p>
                            {plan && !exempt && (
                                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                    {t("billing.wallet.pays", {
                                        amount: formatIQD(plan.order_price_iqd),
                                        wa: formatIQD(plan.whatsapp_message_price_iqd),
                                        waOffer: formatIQD(plan.whatsapp_marketing_price_iqd),
                                    })}
                                </p>
                            )}
                        </div>

                        {showTopUp ? (
                            <TopupForm
                                onDone={() => {
                                    setShowTopUp(false);
                                    refetch();
                                }}
                            />
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowTopUp(true)}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-green-300 py-2.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-50 dark:hover:bg-green-950/20"
                            >
                                <Plus className="w-4 h-4" />
                                {t("billing.wallet.topUp")}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <TopupRequests requests={requests} />
            <WalletHistory transactions={transactions} />
        </div>
    );
}
