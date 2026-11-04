"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { useQueryClient } from "@tanstack/react-query";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimePullBack, type PrimePullBackAnswer } from "@/hooks/use-prime-shipments";
import { toast } from "@/hooks/use-toast";
import { orderKeys } from "@/hooks/use-orders-query";

/**
 * «سحب الطرد من برايم»: a parcel sent by mistake or too early goes back to
 * the dispatch desk without cancelling the order. Prime deletes the case
 * (only before it picks the parcel up) and the server moves the order back to
 * confirmed, so the next run sends it again.
 */
export function PrimePullBackButton({ orderId, caseId }: { orderId: string; caseId: number }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const queryClient = useQueryClient();
    const pullBack = usePrimePullBack();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | null>(null);

    const explain = (answer: PrimePullBackAnswer): string => {
        if (answer.reason === "already_picked_up") return t("orders.prime.pullBackPickedUp");
        if (answer.reason === "status_not_moved") return t("orders.prime.pullBackStatusFailed");
        if (answer.reason === "prime_rejected") return t("orders.prime.pullBackFailed", { reason: answer.message ?? "" });
        if (answer.reason === "prime_unreachable") return t("orders.prime.unreachable");
        return t("orders.prime.pullBackNotPossible");
    };

    const confirm = async () => {
        setBusy(true);
        setProblem(null);
        try {
            const answer = await pullBack(orderId);
            await queryClient.invalidateQueries({ queryKey: orderKeys.all });
            if (!answer.ok) {
                setProblem(explain(answer));
                return;
            }
            toast.success(t("orders.prime.pullBackDone"));
            setOpen(false);
        } catch {
            setProblem(t("orders.prime.unreachable"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    data-prime-pull-back
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex h-11 items-center gap-2 rounded-full border border-[#E7E5E4] bg-white px-4 text-sm font-semibold text-[#1E1E1E] transition-colors hover:bg-[#F5F3EF] dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                >
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                    {t("orders.prime.pullBack")}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={8}
                collisionPadding={16}
                onClick={(e) => e.stopPropagation()}
                className="z-[9999] w-[340px] rounded-xl border-(--card-border) bg-[var(--card)] p-4 shadow-xl dark:bg-gray-900"
            >
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                        <p dir={dir} className="text-left text-[15px] font-bold text-foreground">{t("orders.prime.pullBackTitle")}</p>
                        <p dir={dir} className="text-left text-xs leading-relaxed text-muted">{t("orders.prime.pullBackBody", { caseId })}</p>
                    </div>
                    {problem && (
                        <p role="alert" dir={dir} className="rounded-lg bg-rose-50 px-3 py-2 text-left text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                            {problem}
                        </p>
                    )}
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => void confirm()}
                            disabled={busy}
                            className="h-10 flex-1 rounded-lg bg-foreground text-[13px] font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
                        >
                            {busy ? t("orders.prime.pullBackWorking") : t("orders.prime.pullBackConfirm")}
                        </button>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="h-10 rounded-lg border border-[var(--card-border)] px-4 text-[13px] font-semibold text-foreground hover:bg-[var(--background)]"
                        >
                            {t("common.cancel")}
                        </button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
