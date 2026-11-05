"use client";

import { useState } from "react";
import { Check, MessageCircle, MessageSquareText, Phone, RotateCcw, RotateCw } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { useLanguage, useTextDir } from "@/hooks/use-language";
import { usePrimeProblemMark } from "@/hooks/use-prime-shipments";
import { toast } from "@/hooks/use-toast";
import { openWhatsAppChat } from "@/lib/open-whatsapp-chat";
import type { PrimeProblem, PrimeProblemKind } from "@/lib/prime/problems";
import { cn } from "@/lib/utils";

/** The problem's kind chip, shared by the Prime page's problems tab and the orders page's «معالجة» strip. */
export const PRIME_PROBLEM_CHIP: Record<PrimeProblemKind, string> = {
    failed: "bg-[#FBEAE8] text-[#8F1D13] dark:bg-rose-500/15 dark:text-rose-200",
    confirm: "bg-[#F5F1FE] text-[#4B2FA8] dark:bg-violet-400/15 dark:text-violet-200",
    returning: "bg-[#FBEAE8] text-[#8F1D13] dark:bg-rose-500/15 dark:text-rose-200",
    cancelled_by_prime: "bg-[#F1EFEA] text-[#4A4A4A] dark:bg-white/10 dark:text-white/70",
    postponed: "bg-[#E6F7F6] text-[#0F5E5B] dark:bg-teal-400/15 dark:text-teal-200",
    stuck: "bg-[#FEF3E2] text-[#8A4B00] dark:bg-amber-400/15 dark:text-amber-200",
};

/** What the WhatsApp button says to the customer, per problem. */
const WHATSAPP_TEXT: Record<PrimeProblemKind, string> = {
    failed: "prime.problems.wa.failed",
    confirm: "prime.problems.wa.generic",
    returning: "prime.problems.wa.failed",
    cancelled_by_prime: "prime.problems.wa.generic",
    postponed: "prime.problems.wa.postponed",
    stuck: "prime.problems.wa.generic",
};

export const primeActionButton =
    "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#E7E5E4] bg-white px-3.5 text-[13px] font-semibold text-[#1E1E1E] transition-colors hover:bg-[#F5F3EF] dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10";

/**
 * The fix at hand for a Prime problem: call or WhatsApp the customer, send
 * the parcel again (or ask Prime when it cannot be resent), and mark it
 * handled with a note so nobody calls twice.
 */
export function PrimeProblemActions({
    problem,
    order,
    canResend,
    onResend,
    onAskPrime,
}: {
    problem: Pick<PrimeProblem, "orderId" | "kind" | "handled">;
    order: { phone: string; customer_name: string; order_id: string };
    canResend: boolean;
    onResend: () => void;
    onAskPrime: () => void;
}) {
    const { t } = useLanguage();
    const whatsapp = () => openWhatsAppChat(order.phone, t(WHATSAPP_TEXT[problem.kind], { name: order.customer_name, order: order.order_id }), t);
    return (
        <div className="flex flex-wrap items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            {order.phone && (
                <a href={`tel:${order.phone}`} className={primeActionButton} title={order.phone}>
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("prime.problems.call")}
                </a>
            )}
            {order.phone && (
                <button type="button" onClick={whatsapp} className={primeActionButton}>
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("prime.problems.whatsapp")}
                </button>
            )}
            {canResend ? (
                <button
                    type="button"
                    onClick={onResend}
                    className={cn(primeActionButton, "border-[#B42318] bg-[#B42318] text-white hover:bg-[#8F1D13] dark:border-rose-500 dark:bg-rose-500/80")}
                >
                    <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("prime.page.newAttempt")}
                </button>
            ) : (
                <button type="button" onClick={onAskPrime} className={primeActionButton}>
                    <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("prime.page.askPrime")}
                </button>
            )}
            <HandledButton orderId={problem.orderId} handled={problem.handled} />
        </div>
    );
}

/** What the customer said on the call; one tap marks the parcel handled with it as the note. */
const CALL_RESULTS = ["answered", "noAnswer", "tomorrow"] as const;

/** "Handled" with an optional note (who called, what the customer said); on a handled row, takes the mark off. */
function HandledButton({ orderId, handled }: { orderId: string; handled: boolean }) {
    const { t } = useLanguage();
    const dir = useTextDir();
    const mark = usePrimeProblemMark();
    const [open, setOpen] = useState(false);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);

    const send = async (body: Parameters<typeof mark>[0]) => {
        setBusy(true);
        try {
            if (!(await mark(body))) throw new Error("not saved");
            setOpen(false);
            setNote("");
        } catch {
            toast.error(t("prime.problems.saveFailed"));
        } finally {
            setBusy(false);
        }
    };

    if (handled) {
        return (
            <button type="button" disabled={busy} onClick={() => void send({ action: "reopen", orderId })} className={primeActionButton}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {t("prime.problems.reopen")}
            </button>
        );
    }
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button type="button" className={cn(primeActionButton, "border-[#CFE6D8] text-[#165C39] dark:border-emerald-400/30 dark:text-emerald-300")}>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("prime.problems.handled")}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={8} collisionPadding={16} className="z-[9999] w-[320px] rounded-xl border-(--card-border) bg-[var(--card)] p-4 shadow-xl dark:bg-gray-900">
                <form
                    className="flex flex-col gap-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void send({ action: "handled", orderId, note: note.trim() || undefined });
                    }}
                >
                    <div className="flex flex-col gap-1.5">
                        <span dir={dir} className="text-left text-xs font-semibold text-foreground">
                            {t("prime.problems.afterCall")}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                            {CALL_RESULTS.map((key) => (
                                <button
                                    key={key}
                                    type="button"
                                    data-call-result={key}
                                    disabled={busy}
                                    onClick={() => void send({ action: "handled", orderId, note: t(`prime.problems.result.${key}`) })}
                                    className="inline-flex h-8 items-center rounded-full border border-[#E7E5E4] px-3 text-xs font-semibold text-foreground transition-colors hover:bg-[#F5F3EF] disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/10"
                                >
                                    {t(`prime.problems.result.${key}`)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <label dir={dir} className="flex flex-col gap-1.5 text-left text-xs font-semibold text-foreground">
                        {t("prime.problems.noteLabel")}
                        <textarea
                            dir="auto"
                            value={note}
                            maxLength={300}
                            rows={3}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={t("prime.problems.notePlaceholder")}
                            className="resize-none rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-sm font-normal text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--pastel-yellow)]"
                        />
                    </label>
                    <button type="submit" disabled={busy} className="h-10 rounded-lg bg-foreground text-[13px] font-bold text-background transition-opacity hover:opacity-90 disabled:opacity-60">
                        {t("prime.problems.saveHandled")}
                    </button>
                </form>
            </PopoverContent>
        </Popover>
    );
}
