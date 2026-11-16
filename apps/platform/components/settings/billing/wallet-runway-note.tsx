"use client";

import { Plus, Wallet } from "lucide-react";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import type { WalletRunway } from "@/lib/billing/wallet-runway";

/**
 * The calm wallet note (Fermi B3 part 2): a paying shop whose wallet holds
 * less than 3 days of its own spend is told about how long it lasts, what the
 * wallet pays for, and gets the top-up button. Shown only when walletRunway
 * says so, so never in the trial or under the lock.
 */
export function WalletRunwayNote({
    runway,
    dailySpendIqd,
    onTopUp,
}: {
    runway: WalletRunway;
    dailySpendIqd: number;
    onTopUp: () => void;
}) {
    const { t } = useLanguage();
    const empty = runway.kind === "empty";
    return (
        <div
            className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/30"
            data-testid="wallet-runway"
        >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--pastel-blue)">
                <Wallet className="h-4 w-4 text-sky-700 dark:text-sky-300" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-sky-900 dark:text-sky-200">
                    <bdi>{empty ? t("billing.runway.empty") : t("billing.runway.low", { count: runway.days })}</bdi>
                </p>
                <p className="text-xs text-sky-800/80 dark:text-sky-300/80">
                    <bdi>
                        {empty
                            ? t("billing.runway.emptyBody")
                            : t("billing.runway.lowBody", { daily: formatIQD(dailySpendIqd) })}
                    </bdi>
                </p>
            </div>
            <button
                type="button"
                onClick={onTopUp}
                className="flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-800 dark:bg-sky-600 dark:hover:bg-sky-500"
            >
                <Plus className="h-3.5 w-3.5" />
                {t("billing.wallet.topUp")}
            </button>
        </div>
    );
}
