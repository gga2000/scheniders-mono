"use client";

import { useState } from "react";
import { Bookmark, Package } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@scheniders/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "@/hooks/use-toast";
import { useTillHoldEnd, type TillHold } from "@/hooks/use-till";
import { dateLocale } from "@/lib/till/cart";
import { cn } from "@/lib/utils";
import { INK_BUTTON } from "./till-colors";

const HOUR = 3_600_000;

/** Bottles kept aside in this shop: sell one when the customer comes, or put it back on the shelf. */
export function TillHoldsDialog({
    sessionId,
    holds,
    onSell,
    onClose,
}: {
    sessionId: string;
    holds: TillHold[];
    /** The hold was picked up: open a sale with it for that customer. */
    onSell: (hold: TillHold) => void;
    onClose: () => void;
}) {
    const { t, language } = useLanguage();
    const end = useTillHoldEnd();
    // The clock is read once, when the list opens.
    const [now] = useState(() => Date.now());
    const locale = dateLocale(language);

    const finish = (hold: TillHold, reason: "picked_up" | "released") =>
        end.mutate(
            { sessionId, holdId: hold.id, reason },
            {
                onSuccess: (ended) => {
                    if (!ended) {
                        toast({ title: t("till.holds.gone"), variant: "warning" });
                        return;
                    }
                    if (reason === "picked_up") onSell(hold);
                    else toast({ title: t("till.holds.putBack", { name: hold.name }), variant: "success" });
                },
                onError: () => toast({ title: t("till.holds.failed"), variant: "error" }),
            },
        );

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="till-screen md:max-w-2xl">
                <div className="flex flex-col gap-5">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-left">
                            <Bookmark className="h-5 w-5" aria-hidden="true" />
                            {t("till.holds.title")}
                        </DialogTitle>
                        <DialogDescription className="text-left" dir="auto">
                            {holds.length ? t("till.holds.subtitle") : t("till.holds.none")}
                        </DialogDescription>
                    </DialogHeader>

                    <ul className="flex flex-col divide-y divide-[var(--card-border)]">
                        {holds.map((h) => {
                            const left = new Date(h.expires_at).getTime() - now;
                            const soon = left < 2 * HOUR;
                            const until = new Date(h.expires_at).toLocaleString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Baghdad" });
                            const busy = end.isPending && end.variables?.holdId === h.id;
                            return (
                                <li key={h.id} className="flex items-center gap-3 py-3">
                                    <span className="block h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[var(--card-border)]/25">
                                        {h.image_url ? (
                                            <img src={h.image_url} alt="" className="h-full w-full object-cover" />
                                        ) : (
                                            <span className="flex h-full items-center justify-center text-muted">
                                                <Package className="h-5 w-5" aria-hidden="true" />
                                            </span>
                                        )}
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span className="truncate text-left text-sm font-semibold text-foreground" dir="auto">
                                            {h.name}
                                            {h.variant_name && <span className="ms-1 font-medium text-muted">{h.variant_name}</span>}
                                            <span className="ms-1.5 tabular-nums text-muted">×{h.quantity}</span>
                                        </span>
                                        <span className="truncate text-left text-sm text-foreground" dir="auto">
                                            {h.customer_name}
                                            {h.customer_phone && <span className="ms-2 tabular-nums text-muted">{h.customer_phone}</span>}
                                        </span>
                                        <span className={cn("text-left text-xs", soon ? "font-semibold text-[#92400E] dark:text-amber-300" : "text-muted")} dir="auto">
                                            {t("till.holds.until", { until, by: h.held_by })}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => finish(h, "released")}
                                        className="h-12 shrink-0 rounded-2xl border border-[var(--card-border)] px-4 text-sm font-semibold text-foreground disabled:opacity-50"
                                    >
                                        {t("till.holds.release")}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => finish(h, "picked_up")}
                                        className={cn("h-12 shrink-0 rounded-2xl px-5 text-sm font-bold disabled:opacity-50", INK_BUTTON)}
                                    >
                                        {t("till.holds.sell")}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            </DialogContent>
        </Dialog>
    );
}
