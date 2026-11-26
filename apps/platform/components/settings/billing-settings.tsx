"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Plus, Wallet } from "lucide-react";
import { cn, formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useBilling, useTrialOrderCount } from "@/hooks/use-billing";
import { useBillingLock } from "@/hooks/use-billing-lock";
import { useTenant } from "@/hooks/use-tenant";
import { suggestedTopup, useWalletTopup, type TopupRequest } from "@/hooks/use-wallet-topup";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { printHtmlDocument } from "@/lib/print-html";
import { fetchPaymentReceipt } from "@/lib/billing/fetch-payment-receipt";
import { paymentReceiptDocument } from "@/lib/billing/payment-receipt";
import { useQiSavedCard } from "@/hooks/use-qi-topup";
import { isBillingExempt } from "@/lib/billing-exempt";
import { walletRunway } from "@/lib/billing/wallet-runway";
import { PlanCard } from "./billing/plan-card";
import { PlanPicker, type PlanMode } from "./billing/plan-picker";
import { PlanChangeDialog } from "./billing/plan-change-dialog";
import { AddonsCard } from "./billing/addons-card";
import { hasPassed } from "./billing/billing-format";
import { TopupForm } from "./billing/topup-form";
import { WalletRunwayNote } from "./billing/wallet-runway-note";
import { QiAutoRefill } from "./billing/qi-auto-refill";
import { QiReturnCheck } from "./billing/qi-return-check";
import { TopupRequests } from "./billing/topup-requests";
import { WalletHistory } from "./billing/wallet-history";
import { MonthlyInvoices } from "./billing/monthly-invoices";
import { WhatsAppUsageCard } from "./billing/whatsapp-usage-card";

export function BillingSettings() {
    const { t } = useLanguage();
    const { data: tenant, isLoading: tenantLoading } = useTenant();
    const { wallet, subscription, allPlans, transactions, isLoading, refetch } = useBilling();
    const { requests, paymentDetails } = useWalletTopup();
    const { refresh: refreshQiCard } = useQiSavedCard();
    const inTrial = tenant?.status === "trial";
    const { data: trialOrders } = useTrialOrderCount(inTrial);
    // The lock screen and the trial chip open the page with ?pay=1: straight to the form.
    const [showTopUp, setShowTopUp] = useState(useSearchParams().get("pay") === "1");
    const [choosing, setChoosing] = useState<string | null>(null);
    // The lock read also says who may pay and change plans (the shop's admins)
    // and what the next payment takes, add-ons included.
    const { data: lock } = useBillingLock();

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
    // What the wallet pays day to day (last 7 days of fees and messages; admins only).
    const dailySpend = lock?.daily_spend_iqd ?? null;
    // As change_plan decides it: in a paid month a switch happens now (or at the
    // renewal); in the trial or a lock it picks what the next payment buys.
    const paidMonth =
        tenant?.status === "active" &&
        subscription?.status === "active" &&
        !hasPassed(subscription.current_period_end) &&
        !lock?.locked;
    const mode: PlanMode = inTrial ? "trial" : paidMonth ? "paid" : "locked";
    const canChange = lock?.can_pay ?? false;
    const addonPlanKey = subscription ? (paidMonth ? subscription.plan : (subscription.pending_plan ?? subscription.plan)) : null;
    const addonPlan = allPlans.find((p) => p.plan === addonPlanKey) ?? null;
    // Only a paying shop that is not locked hears that its wallet runs low: in
    // the trial nothing is charged, and the lock screen already says what to pay.
    const runway = !exempt && tenant?.status === "active" && !lock?.locked ? walletRunway(balance, dailySpend) : null;
    // The next plan payment, and a month of the shop's spend when it has any.
    const suggestion = exempt ? null : suggestedTopup(lock?.price_iqd ?? null, balance, dailySpend);
    const legalName = paymentDetails?.legal_name ?? null;

    async function printReceipt(request: TopupRequest) {
        if (!tenant) return;
        try {
            const receipt = await fetchPaymentReceipt(supabase, { id: tenant.id, displayId: tenant.display_id }, request, legalName);
            printHtmlDocument(paymentReceiptDocument(receipt));
        } catch {
            toast.error(t("billing.requests.printError"));
        }
    }

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">{t("billing.page.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("billing.page.subtitle")}</p>
            </div>

            <QiReturnCheck
                onSettled={() => {
                    refetch();
                    // A paid "save my card" top-up has just saved the card.
                    void refreshQiCard();
                }}
            />

            {runway && dailySpend !== null && (
                <WalletRunwayNote runway={runway} dailySpendIqd={dailySpend} onTopUp={() => setShowTopUp(true)} />
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {exempt ? (
                    <div className="pastel-card p-6" data-setting="plan">
                        <p className="text-sm text-muted-foreground"><bdi>{t("billing.exempt")}</bdi></p>
                    </div>
                ) : (
                    <div data-setting="plan" className="grid">
                    <PlanCard
                        plan={plan}
                        subscription={subscription}
                        tenantStatus={tenant?.status ?? "active"}
                        trialEndsAt={tenant?.trial_ends_at ?? null}
                        trialOrders={trialOrders ?? null}
                        nextPrice={lock?.price_iqd ?? null}
                        paidMonth={paidMonth}
                    />
                    </div>
                )}

                <div className="pastel-card p-6" data-setting="wallet">
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
                                className={cn("text-2xl font-bold tabular-nums", runway ? "text-sky-700 dark:text-sky-300" : "text-green-700 dark:text-green-400")}
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

                        {!exempt && <QiAutoRefill />}

                        {showTopUp ? (
                            <TopupForm
                                suggestion={suggestion}
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

            {!exempt && <WhatsAppUsageCard balance={balance} messagePrice={plan?.whatsapp_message_price_iqd ?? null} />}

            {!exempt && subscription && (
                <>
                    <PlanPicker
                        plans={allPlans}
                        currentPlan={subscription.plan}
                        pendingPlan={subscription.pending_plan}
                        pendingAt={subscription.plan_change_at}
                        mode={mode}
                        canChange={canChange}
                        onChoose={setChoosing}
                    />
                    {addonPlan && <AddonsCard plan={addonPlan} paidMonth={paidMonth} canChange={canChange} />}
                    <PlanChangeDialog plan={choosing} mode={mode} onClose={() => setChoosing(null)} />
                </>
            )}

            <TopupRequests requests={requests} onSendAgain={() => setShowTopUp(true)} onPrintReceipt={printReceipt} />
            {!exempt && tenant && <MonthlyInvoices tenantId={tenant.id} displayId={tenant.display_id} legalName={legalName} createdAt={tenant.created_at} />}
            <WalletHistory transactions={transactions} />
        </div>
    );
}
