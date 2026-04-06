"use client";

import { useState } from "react";
import {
    Wallet,
    CreditCard,
    BarChart3,
    TrendingUp,
    ArrowUpRight,
    ArrowDownRight,
    Crown,
    Zap,
    Shield,
    Clock,
    AlertTriangle,
    Loader2,
    Check,
    ChevronRight,
    Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBilling, PlanLimitsData } from "@/hooks/use-billing";
import { useAuth } from "@/components/auth/auth-provider";
import { topUpWalletAction } from "@/app/actions/wallet";
import { toast } from "@/hooks/use-toast";

function formatIQD(amount: number): string {
    return new Intl.NumberFormat("en-IQ").format(Math.round(amount)) + " IQD";
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

const PLAN_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
    starter: { bg: "bg-blue-50 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-400", icon: "text-blue-600" },
    growth: { bg: "bg-green-50 dark:bg-green-950/30", text: "text-green-700 dark:text-green-400", icon: "text-green-600" },
    professional: { bg: "bg-purple-50 dark:bg-purple-950/30", text: "text-purple-700 dark:text-purple-400", icon: "text-purple-600" },
    enterprise: { bg: "bg-amber-50 dark:bg-amber-950/30", text: "text-amber-700 dark:text-amber-400", icon: "text-amber-600" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    trialing: { label: "Trial", color: "bg-yellow-100 text-yellow-700" },
    active: { label: "Active", color: "bg-green-100 text-green-700" },
    past_due: { label: "Past Due", color: "bg-red-100 text-red-700" },
    cancelled: { label: "Cancelled", color: "bg-gray-100 text-gray-700" },
};

const FEATURE_LABELS: Record<string, string> = {
    whatsapp_automation: "WhatsApp Automation",
    custom_branding: "Custom Branding",
    api_access: "API Access",
    priority_support: "Priority Support",
    advanced_analytics: "Advanced Analytics",
    custom_storefront: "Custom Storefront",
};

const TOP_UP_PRESETS = [25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

export function BillingSettings() {
    const { tenantId } = useAuth();
    const { wallet, subscription, usage, allPlans, transactions, isLoading, refetch } = useBilling();
    const [showTopUp, setShowTopUp] = useState(false);
    const [topUpAmount, setTopUpAmount] = useState<number>(100_000);
    const [isTopping, setIsTopping] = useState(false);

    const handleTopUp = async () => {
        if (!tenantId || topUpAmount <= 0) return;
        setIsTopping(true);
        const result = await topUpWalletAction(tenantId, topUpAmount, "manual");
        setIsTopping(false);
        if (result.success) {
            toast.success(`Wallet topped up by ${formatIQD(topUpAmount)}`);
            setShowTopUp(false);
            refetch();
        } else {
            toast.error("Top-up failed", result.error);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading billing...
            </div>
        );
    }

    const currentPlan = allPlans.find((p) => p.plan === subscription?.plan) ?? null;
    const planColor = PLAN_COLORS[subscription?.plan ?? "starter"] ?? PLAN_COLORS.starter;
    const statusInfo = STATUS_LABELS[subscription?.status ?? "trialing"] ?? STATUS_LABELS.trialing;

    const ordersUsed = usage?.orders_count ?? 0;
    const ordersLimit = currentPlan?.max_orders_per_month ?? 500;
    const ordersPercent = ordersLimit === -1 ? 0 : Math.min(100, Math.round((ordersUsed / ordersLimit) * 100));

    const teamUsed = usage?.team_members_count ?? 0;
    const teamLimit = currentPlan?.max_team_members ?? 3;
    const teamPercent = teamLimit === -1 ? 0 : Math.min(100, Math.round((teamUsed / teamLimit) * 100));

    const balance = wallet?.balance_iqd ?? 0;
    const threshold = wallet?.threshold_iqd ?? 5000;
    const isLowBalance = balance <= threshold;

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-foreground">Billing & Wallet</h2>
                <p className="text-sm text-muted-foreground">Manage your subscription, wallet balance, and usage</p>
            </div>

            {/* Low Balance Warning */}
            {isLowBalance && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div className="flex-1">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Low wallet balance</p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            Your balance is {formatIQD(balance)}. Top up to avoid service interruption.
                        </p>
                    </div>
                </div>
            )}

            {/* Top Row: Wallet + Subscription */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Wallet Card */}
                <div className="pastel-card p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-(--pastel-green) flex items-center justify-center">
                            <Wallet className="h-4 w-4 text-green-700" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground">Wallet</h3>
                    </div>

                    <div className="space-y-4">
                        {/* Balance */}
                        <div className="p-4 rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 border border-green-100 dark:border-green-900">
                            <p className="text-xs text-muted-foreground mb-1">Current Balance</p>
                            <p className={cn(
                                "text-2xl font-bold tabular-nums",
                                isLowBalance ? "text-amber-600" : "text-green-700 dark:text-green-400"
                            )}>
                                {formatIQD(balance)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                                Threshold: {formatIQD(threshold)}
                            </p>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl border border-(--card-border) bg-muted/20">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <ArrowUpRight className="w-3.5 h-3.5 text-green-600" />
                                    <span className="text-[11px] text-muted-foreground">Total Topped Up</span>
                                </div>
                                <p className="text-sm font-semibold tabular-nums">{formatIQD(wallet?.total_topped_up_iqd ?? 0)}</p>
                            </div>
                            <div className="p-3 rounded-xl border border-(--card-border) bg-muted/20">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
                                    <span className="text-[11px] text-muted-foreground">Total Charged</span>
                                </div>
                                <p className="text-sm font-semibold tabular-nums">{formatIQD(wallet?.total_charged_iqd ?? 0)}</p>
                            </div>
                        </div>

                        {/* Charge Info */}
                        {currentPlan && (
                            <div className="p-3 rounded-xl border border-(--card-border) bg-muted/20">
                                <p className="text-xs text-muted-foreground mb-1">Per-order charge</p>
                                <p className="text-sm font-medium">
                                    {formatIQD(currentPlan.order_price_iqd)} per order
                                    <span className="text-xs text-muted-foreground ml-1">
                                        ({formatIQD(currentPlan.overage_price_iqd)} over limit)
                                    </span>
                                </p>
                            </div>
                        )}

                        {/* Top Up Section */}
                        {!showTopUp ? (
                            <button
                                onClick={() => setShowTopUp(true)}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-green-300 text-green-700 text-sm font-medium hover:bg-green-50 transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                                Top Up Wallet
                            </button>
                        ) : (
                            <div className="p-4 rounded-xl border border-green-200 bg-green-50/50 space-y-3">
                                <div className="flex flex-wrap gap-2">
                                    {TOP_UP_PRESETS.map((amt) => (
                                        <button
                                            key={amt}
                                            onClick={() => setTopUpAmount(amt)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                                topUpAmount === amt
                                                    ? "bg-green-600 text-white"
                                                    : "bg-white border border-green-200 text-green-700 hover:bg-green-100"
                                            )}
                                        >
                                            {formatIQD(amt)}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowTopUp(false)}
                                        className="flex-1 py-2 rounded-xl text-xs font-medium border border-(--card-border) hover:bg-muted/30 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleTopUp}
                                        disabled={isTopping}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                                    >
                                        {isTopping ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                        Add {formatIQD(topUpAmount)}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Subscription Card */}
                <div className="pastel-card p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <div className="w-8 h-8 rounded-lg bg-(--pastel-purple) flex items-center justify-center">
                            <Crown className="h-4 w-4 text-purple-700" />
                        </div>
                        <h3 className="text-base font-semibold text-foreground">Subscription</h3>
                    </div>

                    <div className="space-y-4">
                        {/* Plan + Status */}
                        <div className={cn("p-4 rounded-xl border", planColor.bg)}>
                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <span className={cn("text-lg font-bold capitalize", planColor.text)}>
                                        {subscription?.plan ?? "Starter"} Plan
                                    </span>
                                </div>
                                <span className={cn("px-2.5 py-1 rounded-full text-xs font-semibold", statusInfo.color)}>
                                    {statusInfo.label}
                                </span>
                            </div>
                            {currentPlan && (
                                <p className={cn("text-sm", planColor.text)}>
                                    {formatIQD(currentPlan.base_price_iqd)}/month base
                                </p>
                            )}
                        </div>

                        {/* Billing Period */}
                        {subscription && (
                            <div className="flex items-center gap-3 p-3 rounded-xl border border-(--card-border) bg-muted/20">
                                <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-muted-foreground">Billing Period</p>
                                    <p className="text-sm font-medium">
                                        {formatDate(subscription.current_period_start)} — {formatDate(subscription.current_period_end)}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Pending Plan Change */}
                        {subscription?.pending_plan && (
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                                <Zap className="w-4 h-4 text-blue-600 shrink-0" />
                                <p className="text-xs text-blue-700 dark:text-blue-400">
                                    Changing to <span className="font-semibold capitalize">{subscription.pending_plan}</span> on{" "}
                                    {subscription.plan_change_at ? formatDate(subscription.plan_change_at) : "next billing cycle"}
                                </p>
                            </div>
                        )}

                        {/* Cancellation Notice */}
                        {subscription?.cancel_at && (
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                                <p className="text-xs text-red-700 dark:text-red-400">
                                    Subscription will cancel on {formatDate(subscription.cancel_at)}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Usage Section */}
            <div className="pastel-card p-6">
                <div className="flex items-center gap-2 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-(--pastel-blue) flex items-center justify-center">
                        <BarChart3 className="h-4 w-4 text-blue-700" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">This Month&apos;s Usage</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Orders Usage */}
                    <UsageMeter
                        label="Orders"
                        used={ordersUsed}
                        limit={ordersLimit}
                        percent={ordersPercent}
                        charged={usage?.orders_charged ?? 0}
                        pricePerUnit={currentPlan?.order_price_iqd ?? 100}
                    />

                    {/* Team Members Usage */}
                    <UsageMeter
                        label="Team Members"
                        used={teamUsed}
                        limit={teamLimit}
                        percent={teamPercent}
                    />
                </div>
            </div>

            {/* Plans Comparison */}
            <div className="pastel-card p-6">
                <div className="flex items-center gap-2 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-(--pastel-yellow) flex items-center justify-center">
                        <TrendingUp className="h-4 w-4 text-amber-700" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">Available Plans</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {allPlans.map((plan) => (
                        <PlanCard
                            key={plan.plan}
                            plan={plan}
                            isCurrent={plan.plan === subscription?.plan}
                        />
                    ))}
                </div>
            </div>

            {/* Transaction History */}
            <div className="pastel-card p-6">
                <div className="flex items-center gap-2 mb-5">
                    <div className="w-8 h-8 rounded-lg bg-(--pastel-mint) flex items-center justify-center">
                        <CreditCard className="h-4 w-4 text-teal-700" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">Transaction History</h3>
                </div>

                {transactions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        No transactions yet
                    </div>
                ) : (
                    <div className="space-y-2">
                        {transactions.map((tx) => (
                            <div
                                key={tx.id}
                                className="flex items-center justify-between p-3 rounded-xl border border-(--card-border) bg-muted/10 hover:bg-muted/20 transition-colors"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                                        tx.amount_iqd > 0 ? "bg-green-100 dark:bg-green-950/40" : "bg-red-100 dark:bg-red-950/40"
                                    )}>
                                        {tx.amount_iqd > 0 ? (
                                            <ArrowUpRight className="w-4 h-4 text-green-600" />
                                        ) : (
                                            <ArrowDownRight className="w-4 h-4 text-red-500" />
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{tx.description}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDate(tx.created_at)}
                                            {tx.payment_method && ` · ${tx.payment_method}`}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right shrink-0 ml-3">
                                    <p className={cn(
                                        "text-sm font-semibold tabular-nums",
                                        tx.amount_iqd > 0 ? "text-green-600" : "text-red-500"
                                    )}>
                                        {tx.amount_iqd > 0 ? "+" : ""}{formatIQD(tx.amount_iqd)}
                                    </p>
                                    <p className="text-xs text-muted-foreground tabular-nums">
                                        Bal: {formatIQD(tx.balance_after_iqd)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function UsageMeter({
    label,
    used,
    limit,
    percent,
    charged,
    pricePerUnit,
}: {
    label: string;
    used: number;
    limit: number;
    percent: number;
    charged?: number;
    pricePerUnit?: number;
}) {
    const isUnlimited = limit === -1;
    const isWarning = !isUnlimited && percent >= 80;
    const isDanger = !isUnlimited && percent >= 100;

    return (
        <div className="p-4 rounded-xl border border-(--card-border) bg-muted/10">
            <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-sm tabular-nums">
                    <span className="font-semibold">{used.toLocaleString()}</span>
                    <span className="text-muted-foreground">
                        {isUnlimited ? " (unlimited)" : ` / ${limit.toLocaleString()}`}
                    </span>
                </p>
            </div>

            {!isUnlimited && (
                <div className="w-full h-2 rounded-full bg-muted/40 overflow-hidden mb-2">
                    <div
                        className={cn(
                            "h-full rounded-full transition-all duration-500",
                            isDanger ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-green-500"
                        )}
                        style={{ width: `${Math.min(100, percent)}%` }}
                    />
                </div>
            )}

            <div className="flex items-center justify-between">
                {!isUnlimited && (
                    <p className={cn(
                        "text-xs",
                        isDanger ? "text-red-500 font-medium" : isWarning ? "text-amber-600" : "text-muted-foreground"
                    )}>
                        {isDanger
                            ? "Limit reached — overage charges apply"
                            : isWarning
                              ? `${100 - percent}% remaining`
                              : `${percent}% used`}
                    </p>
                )}
                {charged !== undefined && charged > 0 && pricePerUnit && (
                    <p className="text-xs text-muted-foreground">
                        Charged: {formatIQD(charged * pricePerUnit)}
                    </p>
                )}
            </div>
        </div>
    );
}

function PlanCard({ plan, isCurrent }: { plan: PlanLimitsData; isCurrent: boolean }) {
    const color = PLAN_COLORS[plan.plan] ?? PLAN_COLORS.starter;

    return (
        <div className={cn(
            "relative p-4 rounded-xl border-2 transition-all",
            isCurrent
                ? "border-primary shadow-md"
                : "border-(--card-border) hover:border-primary/30"
        )}>
            {isCurrent && (
                <div className="absolute -top-2.5 left-3 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold uppercase tracking-wide">
                    Current
                </div>
            )}

            <div className="mb-3 mt-1">
                <h4 className={cn("font-bold capitalize", color.text)}>{plan.plan}</h4>
                <p className="text-lg font-bold mt-1">{formatIQD(plan.base_price_iqd)}<span className="text-xs text-muted-foreground font-normal">/mo</span></p>
            </div>

            <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5">
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    <span>{plan.max_orders_per_month === -1 ? "Unlimited" : plan.max_orders_per_month.toLocaleString()} orders/mo</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    <span>{plan.max_team_members === -1 ? "Unlimited" : plan.max_team_members} team members</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    <span>{formatIQD(plan.order_price_iqd)}/order</span>
                </div>
            </div>

            {/* Features */}
            <div className="mt-3 pt-3 border-t border-(--card-border) space-y-1">
                {Object.entries(plan.features).map(([key, enabled]) => (
                    <div key={key} className="flex items-center gap-1.5 text-xs">
                        {enabled ? (
                            <Check className="w-3 h-3 text-green-600" />
                        ) : (
                            <Shield className="w-3 h-3 text-muted-foreground/40" />
                        )}
                        <span className={enabled ? "text-foreground" : "text-muted-foreground/50 line-through"}>
                            {FEATURE_LABELS[key] ?? key}
                        </span>
                    </div>
                ))}
            </div>

            {!isCurrent && (
                <button className={cn(
                    "w-full mt-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    "border border-(--card-border) hover:bg-muted/40 text-foreground"
                )}>
                    Switch Plan
                </button>
            )}
        </div>
    );
}
