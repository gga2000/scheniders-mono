"use client";

import { useFinancialVisibility } from "@/components/providers/financial-visibility-provider";
import { WidgetLoadError, WidgetPending } from "@/components/dashboard/widget-query-state";
import { usePrimeConnection } from "@/hooks/use-prime-link";
import { usePrimeBoard } from "@/hooks/use-prime-board";
import { usePrimeHome } from "@/hooks/use-prime-home";
import { primeStuckSummary } from "@/lib/prime/stuck";
import { cn } from "@/lib/utils";
import { PrimeMoneyCard } from "./prime-money-card";
import { PrimeNowCard } from "./prime-now-card";
import { PrimeRateCard } from "./prime-rate-card";
import { PrimeStuckAlert } from "./prime-stuck-alert";

/**
 * Prime's cards among the home page's own: what Prime holds for the store
 * (people who may see money), the delivery rate of the last 7 days, where
 * the parcels are now, and the ones with no move for 3+ days. Shown only to
 * a store whose Prime link is switched on.
 */
export function PrimeHomeRow() {
    const { connected } = usePrimeConnection();
    if (!connected) return null;
    return <PrimeHomeCards />;
}

function PrimeHomeCards() {
    const { canReveal } = useFinancialVisibility();
    const home = usePrimeHome(true);
    const board = usePrimeBoard(true);

    if (home.isError || board.isError) {
        const retry = () => {
            void home.refetch();
            void board.refetch();
        };
        return <WidgetLoadError onRetry={retry} className="min-h-[200px]" />;
    }
    if (!home.summary || !board.data) return <WidgetPending className="min-h-[200px]" />;

    const { orders, cash } = board.data;
    const stuck = primeStuckSummary(board.data.board, cash, (id) => orders.get(id)?.city);
    const side = canReveal ? "xl:col-span-4" : "xl:col-span-6";

    return (
        <div data-prime-home className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            {canReveal && (
                <div className={cn("xl:col-span-4", stuck && "xl:row-span-2")}>
                    <PrimeMoneyCard summary={home.summary} />
                </div>
            )}
            <div className={side}>
                <PrimeRateCard summary={home.summary} />
            </div>
            <div className={side}>
                <PrimeNowCard board={board.data.board} />
            </div>
            {stuck && (
                <div className={canReveal ? "xl:col-span-8" : "xl:col-span-12"}>
                    <PrimeStuckAlert stuck={stuck} />
                </div>
            )}
        </div>
    );
}
