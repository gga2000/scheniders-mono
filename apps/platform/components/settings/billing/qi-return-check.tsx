"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { formatIQD } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { checkQiPayment } from "@/hooks/use-qi-topup";

/** Qi may confirm a few seconds after the shop lands back here. */
const CHECKS = 5;
const CHECK_GAP_MS = 3_000;

/**
 * The shop is back from Qi's page (?qi=<payment id>): check the payment with
 * Qi through our server, tell the shop the outcome, and refresh the wallet.
 * The webhook credits the same payment too; whichever runs first wins, once.
 */
export function QiReturnCheck({ onSettled }: { onSettled: () => void }) {
    const { t } = useLanguage();
    const id = useSearchParams().get("qi");
    const router = useRouter();
    const pathname = usePathname();
    const [checking, setChecking] = useState(false);
    const started = useRef<string | null>(null);
    // The check runs once per payment id; it reads the latest of these when it ends.
    const latest = useRef({ t, onSettled, router, pathname });
    useEffect(() => {
        latest.current = { t, onSettled, router, pathname };
    });

    useEffect(() => {
        if (!id || started.current === id) return;
        started.current = id;
        setChecking(true);
        const { t } = latest.current;

        const run = async () => {
            try {
                for (let i = 0; i < CHECKS; i++) {
                    const result = await checkQiPayment(id);
                    if (result.status === "success") {
                        toast.success(t("billing.qi.paid", { amount: formatIQD(result.amount) }));
                        return;
                    }
                    if (result.status === "failed" || result.status === "canceled") {
                        toast.error(t("billing.qi.notPaid"));
                        return;
                    }
                    await new Promise((resolve) => setTimeout(resolve, CHECK_GAP_MS));
                }
                toast.warning(t("billing.qi.pending"));
            } catch {
                // The webhook still credits a paid payment; tell the shop it is not confirmed yet.
                toast.warning(t("billing.qi.pending"));
            } finally {
                setChecking(false);
                latest.current.onSettled();
                latest.current.router.replace(`${latest.current.pathname}?section=billing`);
            }
        };
        void run();
    }, [id]);

    if (!checking) return null;
    return (
        <div className="flex items-center gap-2 rounded-xl border border-(--card-border) bg-muted/10 p-3 text-sm text-muted-foreground" data-testid="qi-checking">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("billing.qi.checking")}
        </div>
    );
}
